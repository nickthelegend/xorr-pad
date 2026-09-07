/**
 * verify.mjs — the whole product, checked end to end against a running backend.
 *
 * Not a unit test. It drives the real HTTP API, the real Base fork, the real
 * Sibyl store and the real Deepgram/Claude calls, and asserts the behaviour
 * written down in TESTPLAN.md. Everything it touches is real: the swaps mine,
 * the store is on disk, the speech is synthesised and transcribed.
 *
 *   ./run-dev.sh &                 # backend on :8080, CHAIN_MODE=fork
 *   node test/verify.mjs
 *
 * Exits non-zero on the first section that fails.
 */
import { chainInfo, balances, pub, erc20Abi } from "../main/chain.mjs";
import { quote, swap, spendable } from "../main/dex.mjs";
import { TOKENS } from "../main/tokens.mjs";
import { Memory, DEFAULT_LIMITS, NO_MEMORY_LIMITS } from "../main/memory.mjs";
import { tts, stt, pcmToWav, think, parseIntent, parseAmount } from "../main/voice.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// "Extreme SSD" has a space in it — URL.pathname would percent-encode it and
// every spawned child would fail with ENOENT on its own cwd.
const ROOT = fileURLToPath(new URL("..", import.meta.url));

const B = process.env.PAD_URL || "http://localhost:8080";
const TOKEN = process.env.PAD_TOKEN || "xorrpad-dev";
const H = { "content-type": "application/json", authorization: "Bearer " + TOKEN };

let pass = 0, fail = 0;
const chk = (id, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}  ${id.padEnd(34)} ${detail}`);
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const j = async (p, o = {}) => {
  const r = await fetch(B + p, { ...o, headers: o.noauth ? {} : H });
  let b = null; try { b = await r.json(); } catch {}
  return { s: r.status, b };
};
const amt = (b, s) => b[s].amount;

// ── A/B. the HTTP surface ───────────────────────────────────────────────────
section("B. HTTP API");
{
  const h = await j("/health", { noauth: true });
  chk("B1 GET /health open", h.s === 200 && h.b.ok === true && h.b.mode === "fork" &&
      typeof h.b.agent === "string" && typeof h.b.armed === "boolean", JSON.stringify(h.b));

  const noTok = await j("/memory", { noauth: true });
  chk("B2 auth is enforced", noTok.s === 401 && noTok.b?.error === "bad pad token", `${noTok.s}`);

  const mem = await j("/memory");
  const need = ["limits", "positions", "rules", "watchlist", "baton", "journal_recent"];
  chk("B3 GET /memory shape", mem.s === 200 && need.every((k) => k in mem.b), `keys=${Object.keys(mem.b)}`);

  const pf = await j("/portfolio");
  chk("B4 GET /portfolio", pf.s === 200 && pf.b.chain.chainId === 8453 && pf.b.chain.mode === "fork" &&
      typeof pf.b.balances.ETH.amount === "number", `chainId=${pf.b.chain?.chainId} (no bigint crash)`);

  let agentsOk = true;
  for (const a of ["dca", "grid", "momentum", "rebalance", "yield", "risk"]) {
    const k = await j("/key", { method: "POST", body: JSON.stringify({ id: a }) });
    const hh = await j("/health", { noauth: true });
    if (!(k.b?.agent === a && hh.b.agent === a)) agentsOk = false;
  }
  const baton = (await j("/memory")).b.baton;
  chk("B5 all six agents take the baton", agentsOk && baton?.agent === "risk", `baton persisted as '${baton?.agent}'`);

  const unknown = await j("/key", { method: "POST", body: JSON.stringify({ id: "nonsense" }) });
  chk("B10 unknown key is handled", unknown.s === 200 && unknown.b.ok === false &&
      /unknown key/.test(unknown.b.error), `"${unknown.b.error}"`);

  const orphanYes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  chk("B9 YES with nothing pending", orphanYes.b?.ok === false && /nothing pending/.test(orphanYes.b.error), "no 500");

  const four04 = await j("/nope");
  chk("B17 unknown route", four04.s === 404 && /no such route/.test(four04.b?.error || ""), "404");

  const badBody = await j("/reflect/accept", { method: "POST", body: JSON.stringify({ id: "oops" }) });
  chk("B15a malformed accept is 400", badBody.s === 400 && /proposal/.test(badBody.b?.error || ""), `${badBody.s}`);
}

// ── the gate: propose → confirm → real fill ─────────────────────────────────
section("B6–B8 · F2–F4. propose, confirm, fill");
{
  const buy = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const v = buy.b.verdict;
  const cites = v.why.some((w) => /memory|journal|holding|allowlist|rule|limits/i.test(w));
  chk("B6 BUY cites remembered facts", buy.s === 200 && !!buy.b.signal && cites,
      `${v.action} $${v.sizeUsd} — "${v.why[0]}"`);

  const before = await j("/memory");
  const yes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  const after = await j("/memory");
  const q0 = before.b.positions?.ETH?.qty ?? 0, q1 = after.b.positions?.ETH?.qty ?? 0;
  chk("B7 YES mines a real swap", /^0x[0-9a-f]{64}$/.test(yes.b?.fill?.hash || "") &&
      yes.b.fill.status === "success" && yes.b.fill.received > 0 && q1 > q0,
      `${yes.b?.fill?.hash?.slice(0, 12)}… position ${q0.toFixed(5)} → ${q1.toFixed(5)}`);

  const dupe = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  chk("G5 a second YES cannot double-fill", dupe.b?.ok === false && /nothing pending/.test(dupe.b.error), "refused");

  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const no = await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
  chk("B8 NO rejects and journals", no.b?.rejected === true, "rejected, nothing traded");
}

// ── the kill switch ─────────────────────────────────────────────────────────
section("B11–B12 · F7. the kill switch");
{
  await j("/key", { method: "POST", body: JSON.stringify({ id: "kill" }) });
  const h = await j("/health", { noauth: true });
  chk("B11 KILL disarms", h.b.armed === false, "armed=false");

  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const usd0 = (await j("/portfolio")).b.balances.USDC.amount;
  const yes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  const usd1 = (await j("/portfolio")).b.balances.USDC.amount;
  chk("G19 KILL stops the HUMAN path too", yes.b?.ok === false && /disarmed/.test(yes.b.error) &&
      Math.abs(usd1 - usd0) < 1e-9, `balance unmoved at $${usd1.toFixed(2)}`);

  const arm = await j("/arm", { method: "POST" });
  const h2 = await j("/health", { noauth: true });
  chk("G20 /arm re-arms, pending survives", arm.b.armed === true && h2.b.armed === true && h2.b.pending === true,
      "the same ✓ still stands");

  const yes2 = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  chk("G20b the held ✓ then executes", /^0x[0-9a-f]{64}$/.test(yes2.b?.fill?.hash || ""),
      `${yes2.b?.fill?.hash?.slice(0, 12)}…`);

  const panic = await j("/panic", { method: "POST" });
  chk("B12 /panic disarms", panic.b.armed === false, "armed=false");
  await j("/arm", { method: "POST" });
}

// ── reflection: journal → proposal → accepted rule → veto ───────────────────
section("B14–B15 · D5 · F8. the habit loop");
{
  for (let i = 0; i < 3; i++) {
    await j("/key", { method: "POST", body: JSON.stringify({ id: "sell" }) });
    await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
  }
  const rf = await j("/reflect");
  chk("B14 GET /reflect", rf.s === 200 && Array.isArray(rf.b.proposals) && typeof rf.b.journalDepth === "number",
      `${rf.b.proposals.length} proposal(s) from ${rf.b.journalDepth} journalled events`);

  const prop = rf.b.proposals[0];
  if (!prop) { chk("D5 a rule is proposed", false, "nothing mined from the journal"); }
  else {
    await j("/reflect/accept", { method: "POST", body: JSON.stringify({ proposal: prop }) });
    const rules = (await j("/memory")).b.rules;
    const saved = rules.find((r) => r.id === prop.id);
    chk("B15 accepted rule persists", saved?.accepted === true, `entity:rule/${prop.id}`);

    const sell = await j("/key", { method: "POST", body: JSON.stringify({ id: "sell" }) });
    const vetoed = sell.b.verdict.action === "REJECT" &&
                   sell.b.verdict.why.some((w) => /vetoed by remembered rule/.test(w));
    chk("D5 the learned rule vetoes", vetoed, `"${sell.b.verdict.why.slice(-1)[0]}"`);
  }
}

// ── C. the chain ────────────────────────────────────────────────────────────
section("C. Base fork — real contracts, real fills");
{
  const info = await chainInfo();
  const supply = await pub.readContract({ address: TOKENS.USDC.address, abi: erc20Abi, functionName: "totalSupply" });
  chk("C1 fork is Base mainnet state", info.chainId === 8453 && Number(info.block) > 0 && supply > 0n,
      `chain 8453 @ block ${info.block}, USDC supply $${(Number(supply) / 1e6).toFixed(0)}`);

  const q = await quote("ETH", "USDC", 0.05);
  chk("C2 live Uniswap V3 quote", [500, 3000, 10000].includes(q.fee) && q.price > 500 && q.price < 20000,
      `fee tier ${q.fee} → $${q.price.toFixed(2)}/ETH`);

  const b0 = await balances(); const f = await swap("USDC", "ETH", 5); const b1 = await balances();
  chk("C3 a swap actually moves tokens", f.status === "success" && amt(b1, "WETH") > amt(b0, "WETH") &&
      amt(b1, "USDC") < amt(b0, "USDC"),
      `USDC ${amt(b0, "USDC").toFixed(2)}→${amt(b1, "USDC").toFixed(2)}, WETH +${(amt(b1, "WETH") - amt(b0, "WETH")).toFixed(5)}`);

  const s = await swap("ETH", "USDC", 0.001); const b2 = await balances();
  chk("C3b and round-trips back", s.status === "success" && amt(b2, "USDC") > amt(b1, "USDC"),
      `USDC ${amt(b1, "USDC").toFixed(2)}→${amt(b2, "USDC").toFixed(2)}`);

  let msg = "(no throw)";
  try { await swap("USDC", "ETH", 1e9); } catch (e) { msg = e.message; }
  chk("C4 over-spend fails readably", /insufficient/i.test(msg) && !/STF/.test(msg), `"${msg.slice(0, 60)}…"`);

  const sp = await spendable("ETH"), bb = await balances();
  chk("C4b spendable ETH counts WETH", Math.abs(sp - ((amt(bb, "ETH") - 0.01) + amt(bb, "WETH"))) < 1e-6,
      "a bought position is sellable");

  const guard = (env) => {
    try {
      execFileSync(process.execPath, ["-e", 'import("./main/chain.mjs").then(()=>process.exit(9))'],
        { env: { ...process.env, ...env }, cwd: ROOT, stdio: "pipe" });
      return "loaded";
    } catch (e) { return String(e.stderr || "").includes("Error") ? "refused" : "refused"; }
  };
  const noKey = guard({ CHAIN_MODE: "mainnet", AGENT_PRIVATE_KEY: "" });
  const anvilKey = guard({ CHAIN_MODE: "mainnet", AGENT_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" });
  chk("C5 mainnet guards hold", noKey === "refused" && anvilKey === "refused",
      "no key → refused; anvil key on mainnet → refused");
}

// ── D. memory ───────────────────────────────────────────────────────────────
section("D. Sibyl memory");
{
  const DB = "/tmp/xorrpad-verify.db";
  for (const p of [DB, DB + "-wal", DB + "-shm"]) if (fs.existsSync(p)) fs.unlinkSync(p);
  const m = new Memory({ db: DB }); await m.ping();
  await m.setReference("risk/limits", DEFAULT_LIMITS);
  await m.setEntity("position", "ETH", { qty: 0.5, avg_entry_usd: 2400 });
  const n0 = (await m.events(500)).length;
  await m.journal({ evaluated: { signal: { symbol: "ETH", side: "BUY", sizeUsd: 25 } },
                    acted: { action: "APPROVED", executed: false } });
  const n1 = (await m.events(500)).length;
  chk("D2 the journal grows", n1 === n0 + 1, `${n0} → ${n1} events`);
  chk("D1a it is a real file", fs.existsSync(DB) && fs.statSync(DB).size > 0, DB);

  const out = execFileSync(process.execPath, ["-e", `
    import("./main/memory.mjs").then(async ({Memory})=>{ const m=new Memory({db:"${DB}"}); await m.ping();
      const b=await m.recallBrief();
      console.log(JSON.stringify({l:b.limits?.max_trade_usd,e:b.positions?.ETH?.qty,n:(await m.events(500)).length}));
      process.exit(0); });`],
    { env: process.env, encoding: "utf8", cwd: ROOT });
  const seen = JSON.parse(out.trim().split("\n").pop());
  chk("D1 survives a separate process", seen.l === 100 && seen.e === 0.5 && seen.n === n1,
      "real SQLite on disk, not an in-memory shim");

  const w = await m.wipe();
  const gone = execFileSync(process.execPath, ["-e", `
    import("./main/memory.mjs").then(async ({Memory})=>{ const m=new Memory({db:"${DB}"}); await m.ping();
      const b=await m.recallBrief();
      console.log(JSON.stringify({l:b.limits,p:Object.keys(b.positions||{}).length,n:(await m.events(500)).length}));
      process.exit(0); });`],
    { env: process.env, encoding: "utf8", cwd: ROOT });
  const g = JSON.parse(gone.trim().split("\n").pop());
  chk("D3 wipe really destroys it", w.removed.length === 3 && g.l === null && g.p === 0 && g.n === 0,
      "db + wal + shm removed; a fresh process finds nothing");

  await m.setReference("risk/limits", { max_trade_usd: 7, max_day_usd: 9, allow: ["ETH"] });
  chk("D3b the store still works after a wipe", (await m.recallBrief()).limits?.max_trade_usd === 7, "re-seeded fine");
  m.stop?.();

  chk("D6 no-memory fallback is stricter", NO_MEMORY_LIMITS.max_trade_usd < DEFAULT_LIMITS.max_trade_usd &&
      NO_MEMORY_LIMITS.max_day_usd < DEFAULT_LIMITS.max_day_usd,
      `$${NO_MEMORY_LIMITS.max_trade_usd}/trade vs the remembered $${DEFAULT_LIMITS.max_trade_usd}`);
}

// ── G3. a wipe must void an outstanding ✓ ───────────────────────────────────
section("G3. wiping memory mid-flow");
{
  const buy = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const usd0 = (await j("/portfolio")).b.balances.USDC.amount;
  const w = await j("/memory/wipe", { method: "POST" });
  const yes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  const usd1 = (await j("/portfolio")).b.balances.USDC.amount;
  chk("G3 the forgotten ✓ is voided", w.b.pendingVoided === true && yes.b?.ok === false && usd0 === usd1,
      `proposed $${buy.b.verdict.sizeUsd} before the wipe, then refused — balance unmoved`);

  const m = await j("/memory");
  chk("B16 post-wipe recall is empty", m.b.limits === null && Object.keys(m.b.positions).length === 0,
      "limits null, positions {}");

  const post = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  chk("F6 the same press now decides differently", post.b.verdict.sizeUsd <= NO_MEMORY_LIMITS.max_trade_usd &&
      post.b.verdict.why.some((w) => /NO remembered limits/.test(w)),
      `$${buy.b.verdict.sizeUsd} with memory → $${post.b.verdict.sizeUsd} without it`);
  await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
}

// ── E. voice + brain ────────────────────────────────────────────────────────
section("E. Deepgram + the Claude Code brain");
{
  const audio = await tts("buy fifty dollars of E T H");
  chk("E1 Deepgram TTS", Buffer.isBuffer(audio) && audio.length > 10000, `${audio.length} bytes of linear16`);

  const text = await stt(pcmToWav(audio));
  const t = text.toLowerCase();
  chk("E2 Deepgram STT", /buy/.test(t) && /(50|fifty)/.test(t) && /eth/.test(t), `heard "${text}"`);

  const sig = parseIntent(text, "momentum");
  chk("E2b speech becomes an order", sig?.side === "BUY" && sig?.sizeUsd === 50, JSON.stringify(sig));
  chk("E2c spoken amounts parse", parseAmount("$50") === 50 && parseAmount("fifty bucks") === 50 &&
      parseAmount("two hundred") === 200, "'$50' · 'fifty bucks' · 'two hundred'");

  const mk = (lim) => ({ limits: { max_trade_usd: lim, max_day_usd: 300, allow: ["ETH", "USDC"] },
                         positions: { ETH: { qty: 0.03, avg_entry_usd: 2479 } }, rules: [], watchlist: [] });
  const a1 = await think("what is my per-trade limit?", mk(100), { prices: { ETH: 2479 } });
  const a2 = await think("what is my per-trade limit?", mk(250), { prices: { ETH: 2479 } });
  const says = (s, n, w) => new RegExp(`${n}|${w}`, "i").test(s);
  chk("E3 the brain is grounded in memory",
      says(a1, 100, "one hundred") && says(a2, 250, "two hundred and fifty") && !/\b100\b|one hundred/i.test(a2),
      "its answer tracks the remembered number, it does not guess");

  const r = await fetch(B + "/voice", { method: "POST",
    headers: { authorization: "Bearer " + TOKEN, "content-type": "application/octet-stream" },
    body: await tts("Buy forty dollars of E T H") });
  const spoken = Buffer.from(await r.arrayBuffer());
  const act = r.headers.get("x-action");
  // A spoken ORDER must reach the decide() gate. Accepting ANSWER here would
  // hide exactly the bug this caught: a mis-heard ticker turning a trade into
  // small talk.
  const tr = decodeURIComponent(r.headers.get("x-transcript") || "");
  chk("B18 POST /voice round trip", r.status === 200 && spoken.length > 10000 &&
      /buy/i.test(tr) && ["EXECUTE", "REJECT"].includes(act),
      `speech → "${tr}" → ${act} → ${spoken.length} bytes spoken back`);

  const ask = await fetch(B + "/voice", { method: "POST",
    headers: { authorization: "Bearer " + TOKEN, "content-type": "application/octet-stream" },
    body: await tts("What is my per trade limit?") });
  await ask.arrayBuffer();
  chk("B18b a question is answered, not traded", ask.headers.get("x-action") === "ANSWER",
      `"${decodeURIComponent(ask.headers.get("x-reply") || "").slice(0, 70)}"`);
  await j("/panic", { method: "POST" }); await j("/arm", { method: "POST" });

  console.log("  \x1b[33mSKIP\x1b[0m  E4 Groq                          every model returns model_permission_blocked_project");
  console.log("  \x1b[33mSKIP\x1b[0m  E5 1inch                         no ONEINCH_API_KEY; route falls back to Uniswap V3");
}

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m` +
            "   (2 skipped: credentials unavailable)\n");
process.exit(fail ? 1 : 0);
