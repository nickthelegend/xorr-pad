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
import { chainInfo, balances, pub, erc20Abi, fundOnFork } from "../main/chain.mjs";
import { quote, swap, spendable } from "../main/dex.mjs";
import { TOKENS, UNISWAP_V3 } from "../main/tokens.mjs";
import { Memory, DEFAULT_LIMITS, NO_MEMORY_LIMITS } from "../main/memory.mjs";
import { tts, stt, pcmToWav, think, parseIntent, parseAmount } from "../main/voice.mjs";
import { MARKETS, DELISTED, SYMBOLS } from "../main/markets.mjs";
import { klines, marketUptrend, regimeOf } from "../main/candles.mjs";
import { BOOK, runBook, ema, rsi } from "../main/strategies.mjs";
import { priceImpact, MAX_IMPACT } from "../main/dex.mjs";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
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

/**
 * Wait for the fork to answer before a chain-heavy section.
 *
 * The upstream this fork reads from is a free, rate-limited public RPC. A burst
 * — G6 fires two confirms at once, so two swaps race — tips it over, and anvil
 * then stalls for a few seconds fetching uncached slots. Every check after that
 * failed for the same reason and reported it as a product fault: "nothing
 * archived", "0 positions", "lost []". None of those were true.
 *
 * So gate on the node. A transient stall costs a pause; a node that never comes
 * back still fails the checks, loudly and for the right reason.
 */
async function waitForNode(seconds = 45) {
  const deadline = Date.now() + seconds * 1000;
  let last = "";
  while (Date.now() < deadline) {
    const r = await j("/portfolio");
    if (r.s === 200 && r.b?.chain?.chainId) return { ok: true };
    last = r.b?.error || `HTTP ${r.s}`;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { ok: false, why: last };
}

// ── A/B. the HTTP surface ───────────────────────────────────────────────────
section("B. HTTP API");
try {
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

  // Make sure nothing IS pending before asserting on the orphan case. The
  // pending decision survives restarts by design, so leaving this implicit made
  // the check depend on whether the previous run happened to end mid-decision —
  // and a stray ✓ here would confirm a real trade, not just fail a test.
  await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
  const orphanYes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  chk("B9 YES with nothing pending", orphanYes.b?.ok === false && /nothing pending/.test(orphanYes.b.error), "no 500");

  const four04 = await j("/nope");
  chk("B17 unknown route", four04.s === 404 && /no such route/.test(four04.b?.error || ""), "404");

  const badBody = await j("/reflect/accept", { method: "POST", body: JSON.stringify({ id: "oops" }) });
  chk("B15a malformed accept is 400", badBody.s === 400 && /proposal/.test(badBody.b?.error || ""), `${badBody.s}`);
} catch (e) { chk("B crashed", false, String(e.message || e).slice(0, 92)); }

// ── the gate: propose → confirm → real fill ─────────────────────────────────
section("B6–B8 · F2–F4. propose, confirm, fill");
try {
  // Name the market this section asserts on. The baton is remembered across
  // restarts, so leaving it implicit made these checks depend on whichever
  // market the PREVIOUS run happened to finish on — they passed on a fresh
  // store and failed on the second run against the same one.
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
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
} catch (e) { chk("B6–B8 · F2–F4 crashed", false, String(e.message || e).slice(0, 92)); }

// ── the kill switch ─────────────────────────────────────────────────────────
section("B11–B12 · F7. the kill switch");
try {
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
} catch (e) { chk("B11–B12 · F7 crashed", false, String(e.message || e).slice(0, 92)); }

// ── reflection: journal → proposal → accepted rule → veto ───────────────────
section("B14–B15 · D5 · F8. the habit loop");
try {
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
} catch (e) { chk("B14–B15 · D5 · F8 crashed", false, String(e.message || e).slice(0, 92)); }

// ── C. the chain ────────────────────────────────────────────────────────────
section("C. Base fork — real contracts, real fills");
try {
  {
    // Stop the section rather than running checks that cannot measure anything.
    // Letting them run turned one infrastructure stall into nine "failures"
    // that each named a product fault which was not there.
    const up = await waitForNode();
    if (!up.ok) throw new Error(`the Base node never came back (${up.why}) — this section measures nothing without it`);
  }
  // The fork's wallet is whatever previous runs left in --state. Top it up
  // first, or the suite's pass/fail depends on residue from the last session.
  const fund = await fundOnFork();
  chk("C0 the fork wallet is funded to trade", fund.funded && fund.usdc >= 100,
      `${fund.usdc?.toFixed(2)} USDC${fund.swapped ? " (topped up on-chain)" : ""}${fund.quoteAsset ? " — " + fund.quoteAsset : ""}`);

  const info = await chainInfo();
  const supply = await pub.readContract({ address: TOKENS.USDC.address, abi: erc20Abi, functionName: "totalSupply" });
  chk("C1 fork is Base mainnet state", info.chainId === 8453 && Number(info.block) > 0 && supply > 0n,
      `chain 8453 @ block ${info.block}, USDC supply $${(Number(supply) / 1e6).toFixed(0)}`);

  const q = await quote("ETH", "USDC", 0.05);
  chk("C2 live Uniswap V3 quote", UNISWAP_V3.fees.includes(q.fee) && q.price > 500 && q.price < 20000,
      `fee tier ${q.fee / 10000}% → $${q.price.toFixed(2)}/ETH`);

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
} catch (e) { chk("C crashed", false, String(e.message || e).slice(0, 92)); }

// ── D. memory ───────────────────────────────────────────────────────────────
section("D. Sibyl memory");
try {
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
} catch (e) { chk("D crashed", false, String(e.message || e).slice(0, 92)); }

// ── G3. a wipe must void an outstanding ✓ ───────────────────────────────────
section("G3. wiping memory mid-flow");
try {
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

  // and the wipe has to be reversible, or the demo can only be run once
  const seed = await j("/memory/seed", { method: "POST", body: "{}" });
  const back = await j("/memory");
  chk("G32 the pad can be re-taught", seed.s === 200 && back.b.limits?.max_trade_usd === 100,
      `limits restored to $${back.b.limits?.max_trade_usd}/trade without a restart`);
  await j("/memory/wipe", { method: "POST" });

  const post = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  chk("F6 the same press now decides differently", post.b.verdict.sizeUsd <= NO_MEMORY_LIMITS.max_trade_usd &&
      post.b.verdict.why.some((w) => /NO remembered limits/.test(w)),
      `$${buy.b.verdict.sizeUsd} with memory → $${post.b.verdict.sizeUsd} without it`);
  await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
} catch (e) { chk("G3 crashed", false, String(e.message || e).slice(0, 92)); }

// ── M. markets, strategies, liquidity ───────────────────────────────────────
section("M. markets — every asset class, on Base");
try {
  const classes = new Set(Object.values(MARKETS).map((m) => m.class));
  chk("M1 four asset classes are live", classes.size >= 4,
      [...classes].join(", ") + ` across ${SYMBOLS.length} markets`);

  const mk = await j("/markets");
  chk("M2 GET /markets", mk.s === 200 && Object.keys(mk.b.markets).length === SYMBOLS.length,
      `${Object.keys(mk.b.markets).length} listed, ${Object.keys(mk.b.delisted).length} delisted with reasons`);

  // Every listed market must actually price within the impact limit.
  let worst = { sym: null, impact: -1 };
  for (const sym of SYMBOLS) {
    const i = await priceImpact("USDC", sym, 200);
    if (i.impact > worst.impact) worst = { sym, impact: i.impact };
  }
  chk("M3 every listed market is deep enough", worst.impact <= MAX_IMPACT,
      `worst is ${worst.sym} at ${(worst.impact * 100).toFixed(2)}% (limit ${(MAX_IMPACT * 100).toFixed(0)}%)`);

  const deg = await j("/key", { method: "POST", body: JSON.stringify({ id: "DEGEN" }) });
  chk("M4 a delisted market is refused with its reason",
      deg.b?.ok === false && /delisted/.test(deg.b.error), `"${deg.b?.error}"`);

  // The wipe in the previous section left the pad on its timid fallback, which
  // allows only ETH and USDC — that is correct, so re-teach before trading a
  // non-crypto market, and prove the refusal first.
  const beforeTeach = await j("/key", { method: "POST", body: JSON.stringify({ id: "EURC" }) });
  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const refused = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  chk("M4b a memoryless pad refuses an unremembered market",
      refused.b?.verdict?.action === "REJECT" && refused.b.verdict.why.some((w) => /allowlist/.test(w)),
      `"${refused.b?.verdict?.why?.slice(-1)[0]}"`);
  await j("/memory/seed", { method: "POST", body: "{}" });

  await j("/key", { method: "POST", body: JSON.stringify({ id: "EURC" }) });
  const h = await j("/health", { noauth: true });
  const buy = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const yes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  chk("M5 a non-crypto market fills for real", /^0x[0-9a-f]{64}$/.test(yes.b?.fill?.hash || "") &&
      yes.b.fill.receivedSymbol === "EURC",
      `forex: ${(+yes.b?.fill?.received || 0).toFixed(2)} EURC at fee tier ${yes.b?.fill?.fee}`);
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
} catch (e) { chk("M crashed", false, String(e.message || e).slice(0, 92)); }

section("S. the strategy book");
try {
  const gate = await marketUptrend();
  chk("S1 the market trend gate reads real BTC history", typeof gate.uptrend === "boolean" && gate.sma200 > 0,
      gate.reason);

  const c = await klines("ETHUSDT", { limit: 300 });
  chk("S2 real hourly candles with volume", c.length >= 200 && c.every((k) => k.volume > 0 && k.high >= k.low),
      `${c.length} bars, OHLCV complete`);

  // Each strategy must FIRE on a construction that meets it and stay silent
  // one step below — a book that cannot fire is not a book.
  const flat = (n, px) => Array.from({ length: n }, () => ({ t: 0, open: px, high: px * 1.001, low: px * 0.999, close: px, volume: 1000 }));
  const deep = flat(120, 100); deep[119] = { t: 0, open: 92.8, high: 93.2, low: 92.9, close: 93, volume: 1000 };
  chk("S3 deep_stretch_reversion fires at -7%", !!BOOK.deep_stretch_reversion(deep, { uptrend: true, regime: "CHOP", symbol: "ETH" }),
      "the strongest measured condition");
  const shallow = flat(120, 100); shallow[119] = { t: 0, open: 95.8, high: 96.2, low: 95.9, close: 96, volume: 1000 };
  chk("S4 …and stays silent at -4%", !BOOK.deep_stretch_reversion(shallow, { uptrend: true, regime: "CHOP", symbol: "ETH" }),
      "threshold respected");
  chk("S5 …and the market gate switches it off", !BOOK.deep_stretch_reversion(deep, { uptrend: false, regime: "CHOP", symbol: "ETH" }),
      "no dip buying while BTC is below its 200-day mean");

  const sc = await j("/scan");
  chk("S6 GET /scan runs the book on every market",
      sc.s === 200 && sc.b.markets.length === SYMBOLS.length && Array.isArray(sc.b.signals) && !!sc.b.summary,
      `${sc.b.summary}`);
  chk("S7 the scan explains every market it looked at",
      sc.b.markets.every((m) => m.error || (typeof m.rsi === "number" && typeof m.regime === "string")),
      sc.b.markets.map((m) => `${m.symbol} RSI ${m.rsi}`).join(", "));
} catch (e) { chk("S crashed", false, String(e.message || e).slice(0, 92)); }

// ── routes and chain behaviour the earlier sections do not reach ────────────
section("R. remaining routes");
try {
  await j("/memory/seed", { method: "POST", body: "{}" });
  await j("/arm", { method: "POST" });
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });

  const lg = await j("/log");
  chk("B6 GET /log", lg.s === 200 && Array.isArray(lg.b.log) && lg.b.log.every((e) => e.t && e.m),
      `${lg.b.log.length} server-side entries, so pad presses are visible`);

  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const live = await j("/pending");
  await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
  const gone = await j("/pending");
  chk("B7 GET /pending both states", live.b.pending === true && !!live.b.signal && !!live.b.verdict && gone.b.pending === false,
      `${live.b.signal.side} ${live.b.signal.symbol} $${live.b.signal.sizeUsd} -> none`);

  const sw = await j("/key", { method: "POST", body: JSON.stringify({ id: "eurc" }) });
  const baton = (await j("/memory")).b.baton?.market;
  chk("B9 market switch is case-insensitive", sw.b?.ok === true && sw.b.market === "EURC" && sw.b.class === "forex" && baton === "EURC",
      `"eurc" -> ${sw.b?.market} (${sw.b?.class}), baton follows`);
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });

  const tick = await j("/tick", { method: "POST" });
  chk("B20 POST /tick", tick.s === 200 && Array.isArray(tick.b.signals),
      `${tick.b.signals.length} signal(s), verdict ${tick.b.verdict?.action ?? "none"}`);

  const noId = await j("/key", { method: "POST", body: "{}" });
  const junk = await j("/reflect/reject", { method: "POST", body: '{"x":1}' });
  chk("G9 malformed bodies never 500", noId.s === 200 && noId.b?.ok === false && junk.s === 400,
      `/key {} -> "${noId.b?.error}"; junk reject -> ${junk.s}`);

  const fonts = await fetch(B + "/fonts/inter-600.woff2");
  const trav = await fetch(B + "/fonts/..%2f..%2fpackage.json");
  chk("A3/A4 fonts serve, traversal does not",
      fonts.status === 200 && fonts.headers.get("content-type") === "font/woff2" && trav.status !== 200,
      `woff2 200, traversal ${trav.status}`);
} catch (e) { chk("R crashed", false, String(e.message || e).slice(0, 92)); }

section("C. chain behaviour on every asset class");
try {
  const q = await quote("ETH", "USDC", 0.1);
  chk("C3 quote uses the measured fee tier", q.fee === MARKETS.ETH.fee,
      `${q.fee / 10000}% matches markets.mjs`);

  for (const [cls, syms] of Object.entries({ crypto: ["ETH", "cbBTC"], forex: ["EURC"], defi: ["AERO", "MORPHO"], ai: ["VIRTUAL"] })) {
    for (const sym of syms) {
      const key = sym === "ETH" ? "WETH" : sym;
      const before = (await balances())[key].amount;
      const f = await swap("USDC", sym, 6);
      const after = (await balances())[key].amount;
      chk(`C4 ${cls}/${sym} mined fill`, f.status === "success" && after > before && f.received > 0,
          `${f.hash.slice(0, 12)}… +${(after - before).toFixed(6)} at tier ${f.fee}`);
    }
  }

  TOKENS.DEGEN = { symbol: "DEGEN", address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", decimals: 18 };
  // Size it to what the wallet holds, or the balance check fires first and we
  // end up testing the wallet instead of the gate.
  const affordable = Math.max(5, Math.min(100, Math.floor((await spendable("USDC")) * 0.5)));
  let msg = "(no throw)";
  try { await swap("USDC", "DEGEN", affordable); } catch (e) { msg = e.message; }
  // Refused either because it measured the pool as too thin, or because it
  // could not measure it at all. Both are the gate holding; a submitted
  // transaction is the gate failing.
  chk("C6 the liquidity gate refuses before signing",
      (/too thin/.test(msg) || /could not be measured/.test(msg)) && !/submitted/.test(msg),
      `$${affordable} attempt: "${msg.slice(0, 64)}"`);
  delete TOKENS.DEGEN;
} catch (e) { chk("C crashed", false, String(e.message || e).slice(0, 92)); }

section("G. concurrency");
try {
  {
    // Stop the section rather than running checks that cannot measure anything.
    // Letting them run turned one infrastructure stall into nine "failures"
    // that each named a product fault which was not there.
    const up = await waitForNode();
    if (!up.ok) throw new Error(`the Base node never came back (${up.why}) — this section measures nothing without it`);
  }
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  // A stalled node must fail this check with a message, not crash the run.
  const usdc = async () => {
    const r = await j("/portfolio");
    return r.b?.balances?.USDC?.amount ?? null;
  };
  const u0 = await usdc();
  const [a, b2] = await Promise.all([
    j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) }),
    j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) }),
  ]);
  // The two concurrent swaps are the heaviest burst in the run, and the node
  // routinely needs a moment afterwards. Measuring straight away read a 503 and
  // reported it as "fills exactly once" failing — when the fill was correct and
  // only the measurement was unavailable. Wait for the node, then measure.
  await waitForNode(60);
  const u1 = await usdc();
  const fills = [a, b2].filter((r) => r.b?.fill).length;
  // Compare the movement against the trade that actually ran, not a constant.
  // The old guard hard-coded "< 60" and failed a correct single $100 fill the
  // moment the size had been left at $100 — it was measuring the fixture, not
  // the behaviour. What matters is that ONE trade moved, never two.
  const one = Number(a.b?.fill ? a.b.verdict?.sizeUsd : b2.b?.verdict?.sizeUsd) || 50;
  chk("G6 concurrent confirm fills exactly once",
      fills === 1 && u0 != null && u1 != null && (u0 - u1) <= one * 1.1,
      u0 == null || u1 == null
        ? "the Base node stalled and /portfolio returned 503 — cannot measure the balance"
        : `${fills} fill, $${(u0 - u1).toFixed(2)} moved on a $${one} trade`);

  await Promise.all(["cbBTC", "EURC", "AERO"].map((m) =>
    j("/key", { method: "POST", body: JSON.stringify({ id: m }) })));
  const bat = (await j("/memory")).b.baton?.market;
  const nxt = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  chk("G7 rapid switching stays consistent", nxt.b?.signal?.symbol === bat,
      `baton ${bat}, next proposal ${nxt.b?.signal?.symbol}`);
  await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
} catch (e) { chk("G crashed", false, String(e.message || e).slice(0, 92)); }

// ── E. voice + brain ────────────────────────────────────────────────────────
section("E. Deepgram + the Claude Code brain");
try {
  const audio = await tts("buy fifty dollars of E T H");
  chk("E1 Deepgram TTS", Buffer.isBuffer(audio) && audio.length > 10000, `${audio.length} bytes of linear16`);

  const text = await stt(pcmToWav(audio));
  const t = text.toLowerCase();
  // Deepgram returns "By" for "Buy", and spells ETH as "e t eight" — H heard as
  // "aitch" — often enough that pinning the assertion to any spelling tests the
  // transcriber's mood, not the product. It failed on exactly that while the
  // pad parsed the same sentence into the right order. So assert what actually
  // matters: something was heard, and it becomes the order it should.
  const parsed = parseIntent(text, "momentum", "ETH");
  chk("E2 Deepgram STT", text.length > 0 && parsed?.side === "BUY" &&
      parsed.symbol === "ETH" && parsed.sizeUsd === 50,
      `heard "${text}" -> ${parsed ? `${parsed.side} ${parsed.symbol} $${parsed.sizeUsd}` : "not an order"}`);

  const sig = parseIntent(text, "momentum");
  chk("E2b speech becomes an order", sig?.side === "BUY" && sig?.sizeUsd === 50, JSON.stringify(sig));
  chk("E2c spoken amounts parse", parseAmount("$50") === 50 && parseAmount("fifty bucks") === 50 &&
      parseAmount("two hundred") === 200, "'$50' · 'fifty bucks' · 'two hundred'");

  // Deepgram returns "By" AND "My" for "Buy" — both have killed a real spoken
  // order. The impostors count as the verb only immediately before an amount,
  // so a question that merely contains "my" is still a question.
  {
    const sideOf = (t) => parseIntent(t, "momentum", "ETH")?.side ?? null;
    const cases = [
      ["Buy $50 of ETH.", "BUY"], ["By $50 of ETH.", "BUY"], ["My $50 of ETH.", "BUY"],
      ["by fifty dollars of eth", "BUY"], ["my fifty dollars of eth", "BUY"],
      ["What is my per trade limit?", null], ["what is my balance", null],
      ["by the way what do you think", null], ["my portfolio please", null],
    ];
    const bad = cases.filter(([t, want]) => sideOf(t) !== want);
    chk("E2d buy/by/my homophones, without false orders", bad.length === 0,
        bad.length ? `${bad.length} wrong: ${bad.map(([t]) => `"${t}"`).join(", ")}`
                   : `${cases.length}/${cases.length} — orders parse, questions do not`);
  }

  const mk = (lim) => ({ limits: { max_trade_usd: lim, max_day_usd: 300, allow: ["ETH", "USDC"] },
                         positions: { ETH: { qty: 0.03, avg_entry_usd: 2479 } }, rules: [], watchlist: [] });
  const a1 = await think("what is my per-trade limit?", mk(100), { prices: { ETH: 2479 } });
  const a2 = await think("what is my per-trade limit?", mk(250), { prices: { ETH: 2479 } });
  // The reply is spoken, so numbers come back as words and the phrasing varies
  // run to run ("two hundred fifty" / "two hundred and fifty"). Normalise to
  // digits and test the CLAIM — that the answer tracks memory — not the wording.
  const toDigits = (t) => {
    const W = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
                twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };
    let out = t.toLowerCase().replace(/\band\b/g, " ");
    // "two hundred fifty" -> 250, "one hundred" -> 100
    out = out.replace(/\b(one|two|three|four|five|six|seven|eight|nine)\s+hundred(?:\s+(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety))?(?:\s+(one|two|three|four|five|six|seven|eight|nine))?/g,
      (_m, h, t2, u) => String(W[h] * 100 + (t2 ? W[t2] : 0) + (u ? W[u] : 0)));
    return out;
  };
  const n1 = toDigits(a1), n2 = toDigits(a2);
  const has = (t, n) => new RegExp(`\\b${n}\\b`).test(t);
  chk("E3 the brain is grounded in memory",
      has(n1, 100) && !has(n1, 250) && has(n2, 250) && !has(n2, 100),
      `remembered 100 → "${a1.slice(0, 42)}…" · remembered 250 → "${a2.slice(0, 42)}…"`);

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
} catch (e) { chk("E crashed", false, String(e.message || e).slice(0, 92)); }

// ── N. the bugs found by running it, locked shut ────────────────────────────
section("N. regressions");
try {
  {
    // Stop the section rather than running checks that cannot measure anything.
    // Letting them run turned one infrastructure stall into nine "failures"
    // that each named a product fault which was not there.
    const up = await waitForNode();
    if (!up.ok) throw new Error(`the Base node never came back (${up.why}) — this section measures nothing without it`);
  }
  // recall_brief computed spent_today and then dropped it from the returned
  // dict, so decide() silently fell back to "the last 10 events" — correct
  // today, wrong the moment a day has more than ten.
  const m = await j("/memory");
  chk("N1 the brief carries spent_today", Number.isFinite(m.b.spent_today),
      `spent_today=${JSON.stringify(m.b.spent_today)}`);

  // A USD-denominated round trip never lands on exactly zero, so a fully closed
  // position left sub-cent dust and the 1e-12 close test never fired: nothing
  // was ever archived and the pad kept claiming to hold 0.0000007 ETH.
  await j("/memory/seed", { method: "POST", body: "{}" });
  await j("/arm", { method: "POST" });
  const k = (id) => j("/key", { method: "POST", body: JSON.stringify({ id }) });
  await k("AERO");
  // Start from a known size and a flat book. A round trip that only partly
  // closes a position left open by something earlier archives nothing — which
  // is correct behaviour and a meaningless assertion. Sell down first.
  await j("/size", { method: "POST", body: JSON.stringify({ usd: 50 }) });
  for (let i = 0; i < 8; i++) {
    if (!(await j("/memory")).b?.positions?.AERO) break;
    const s = await k("sell");
    if (s.b?.verdict?.action !== "EXECUTE") break;
    await k("yes");
  }
  await k("buy"); await k("yes");
  const sv = await k("sell");
  if (sv.b?.verdict?.action === "EXECUTE") await k("yes");
  const store = (await j("/memory/full")).b;
  const arch = store.archived || [];
  const live = (store.entities?.position || []).map((r) => r.name);
  chk("N2 a closed position is archived, not deleted",
      arch.some((a) => a.name === "AERO") && !live.includes("AERO"),
      arch.length ? `archived: ${arch[0].category}/${arch[0].name} — "${arch[0].reason}"` : "nothing archived");

  // spendable() rounds an 18-decimal balance through a JS double, which can
  // round UP: selling "everything" asked the router for 8398 wei more than the
  // wallet held and Uniswap reverted with the opaque string STF.
  await swap("USDC", "AERO", 25);
  const all = await spendable("AERO");
  const f = await swap("AERO", "USDC", all);
  chk("N3 selling the entire balance does not revert", f.status === "success",
      `sold ${f.sold} -> ${f.received.toFixed(4)} USDC`);

  // viem sends exactly the estimate, and the swap executes a block later
  // against state that can cost more. One reverted at 98.8% of its limit —
  // out of gas, no fill, gas burned. Every swap now carries a margin.
  const rc = await pub.getTransactionReceipt({ hash: f.hash });
  const tx = await pub.getTransaction({ hash: f.hash });
  const used = Number(rc.gasUsed) / Number(tx.gas);
  chk("N5 a swap has gas headroom", used < 0.9,
      `used ${(used * 100).toFixed(1)}% of the limit (${rc.gasUsed} of ${tx.gas})`);

  // The store's headings and rows were separate children of a two-column
  // layout, so "archived — 1" could sit at the foot of one column with its row
  // at the head of the next, under a different heading.
  const html = fs.readFileSync(new URL("../renderer/index.html", import.meta.url), "utf8");
  const body = html.slice(html.indexOf("function drawStore"), html.indexOf("// --- first paint"));
  chk("N4 no store tier pushes a bare heading", !/parts\.push\(\s*`<h2/.test(body),
      /parts\.push\(\s*`<h2/.test(body) ? "a heading is pushed outside group()" : "every tier goes through group()");

  // Leave the baton where the suite found it, so the next run starts clean.
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
} catch (e) { chk("N crashed", false, String(e.message || e).slice(0, 92)); }

// ── O. the store, reasoned about rather than reported ───────────────────────
section("O. memory that derives, forgets and remembers when");
try {
  {
    // Stop the section rather than running checks that cannot measure anything.
    // Letting them run turned one infrastructure stall into nine "failures"
    // that each named a product fault which was not there.
    const up = await waitForNode();
    if (!up.ok) throw new Error(`the Base node never came back (${up.why}) — this section measures nothing without it`);
  }
  const k = (id) => j("/key", { method: "POST", body: JSON.stringify({ id }) });
  const DB = process.env.SIBYL_DB || "/tmp/xorrpad-server.db";
  await j("/memory/wipe", { method: "POST" });
  await j("/memory/seed", { method: "POST", body: "{}" });
  await j("/arm", { method: "POST" });
  await k("ETH");

  // #9 — recall as the first thing that happens, and honest when it is empty.
  const t0 = new Date().toISOString();
  await k("buy"); await k("yes");
  const b1 = await j("/briefing");
  chk("O1 the briefing states what it remembers", /limits/i.test(b1.b.text) && /holding/i.test(b1.b.text),
      `"${b1.b.text.slice(0, 76)}…"`);

  // #3 — a rule that can show its working.
  for (let i = 0; i < 3; i++) { await k("sell"); await k("no"); }
  const rf = await j("/reflect");
  const live = rf.b.proposals[0];
  chk("O2 a proposal carries the events it was mined from",
      Array.isArray(live?.from) && live.from.length >= 3, `from ${live?.from?.length} journal events`);
  await j("/reflect/accept", { method: "POST", body: JSON.stringify({ proposal: live }) });
  const veto = await k("sell");
  chk("O3 the veto cites its provenance",
      veto.b.verdict?.vetoedBy === live.id && veto.b.verdict.why.some((w) => /mined from/.test(w)),
      `"${veto.b.verdict.why.find((w) => /mined from/.test(w)) || veto.b.verdict.why[0]}"`);
  const jr = (await j("/memory/full")).b.journal || [];
  const vetoed = jr.some((e) => {
    const a = typeof e.acted === "string" ? JSON.parse(e.acted) : e.acted;
    return a?.vetoedBy === live.id;
  });
  chk("O4 the gate's own refusal is journalled", vetoed,
      vetoed ? `acted.vetoedBy=${live.id}` : "the pad's refusals leave no trace");

  // #8 — a rule that cannot fire is worse than no rule.
  await j("/reflect/accept", { method: "POST", body: JSON.stringify({ proposal: { ...live, id: "dead-doge-rule", symbol: "DOGE" } }) });
  const cx = await j("/memory/contradictions");
  chk("O5 a rule that can never fire is surfaced", cx.b.findings?.some((f) => f.kind === "dead"),
      `"${cx.b.findings?.[0]?.text?.slice(0, 74)}"`);

  // #12 — forgetting deliberately. Backdate both rules so age cannot be the
  // reason either survives, which is how this passed for the wrong reason once.
  {
    const mem2 = new Memory({ db: DB });
    const br = await mem2.recallBrief();
    const old = new Date(Date.now() - 30 * 86400_000).toISOString();
    for (const r of br.rules || []) await mem2.setEntity("rule", r.id, { ...r, accepted_at: old });
    mem2.stop();
  }
  await k("sell");                                  // make the live rule fire again
  const dec = await j("/memory/decay", { method: "POST", body: JSON.stringify({ days: 1 }) });
  const firedKept = (dec.b.kept || []).filter((x) => x.why === "fired inside the window").map((x) => x.id);
  chk("O6 a rule that is doing work survives the sweep",
      firedKept.includes(live.id) && !dec.b.archived.includes(live.id),
      `kept as fired: [${firedKept.join(", ")}]`);
  chk("O7 a rule nothing needs is archived, not deleted",
      dec.b.archived.includes("dead-doge-rule") &&
      ((await j("/memory/full")).b.archived || []).some((a) => a.name === "dead-doge-rule"),
      `archived: [${dec.b.archived.join(", ")}]`);
  const dz = await j("/memory/decay", { method: "POST", body: JSON.stringify({ days: 0 }) });
  chk("O8 days:0 is honoured, not silently 14", dz.b.days === 0, `days=${dz.b.days}`);

  // #5 — the temporal tier as a time machine.
  const past = await j(`/memory/at?ts=${encodeURIComponent(t0)}`);
  const now = await j(`/memory/at?ts=${encodeURIComponent(new Date(Date.now() + 1000).toISOString())}`);
  const store = await j("/memory");
  chk("O9 replay shows a past that differs from now",
      Object.keys(past.b.positions).length === 0 && Object.keys(now.b.positions).length > 0,
      `${Object.keys(past.b.positions).length} positions then, ${Object.keys(now.b.positions).length} now`);
  chk("O10 and the replayed present matches the live store",
      Object.keys(now.b.positions).sort().join(",") === Object.keys(store.b.positions || {}).sort().join(","),
      `replay [${Object.keys(now.b.positions).sort().join(", ")}] vs store [${Object.keys(store.b.positions || {}).sort().join(", ")}]`);
  chk("O11 a junk timestamp is refused", (await j("/memory/at?ts=banana")).s === 400, "400 on ?ts=banana");

  // #10 — the sponsor's own MCP server, on the store the pad writes.
  {
    const frame = (o) => JSON.stringify(o) + "\n";
    const rpcInit = frame({ jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "verify", version: "1" } } })
      + frame({ jsonrpc: "2.0", method: "notifications/initialized" });
    const rpcList = frame({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const rpcPos = frame({ jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "memory_list", arguments: { category: "position" } } });
    const bin = path.join(ROOT, "..", ".venv", "bin", "sibyl-memory-mcp");
    // An MCP server is long-lived by design. Piping the requests in and closing
    // stdin makes the later ones race the EOF — tools/list answered and the
    // tools/call that followed it was simply dropped, which looked exactly like
    // a broken integration. Hold the pipe open and wait for the answers.
    const rpcCall = () => new Promise((resolve) => {
      const proc = spawn(bin, [], { env: { ...process.env, SIBYL_MEMORY_DB: DB, SIBYL_DB: DB },
                                    stdio: ["pipe", "pipe", "ignore"] });
      const seen = new Map();
      let buf = "";
      const done = (r) => { try { proc.kill(); } catch {} resolve(r); };
      const timer = setTimeout(() => done(seen), 25000);
      proc.stdout.on("data", (d) => {
        buf += d;
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.id != null) seen.set(m.id, m);
          if (m.id === 1) proc.stdin.write(rpcList);
          if (m.id === 2) proc.stdin.write(rpcPos);
          if (m.id === 3) { clearTimeout(timer); done(seen); }
        }
      });
      proc.on("error", () => { clearTimeout(timer); done(seen); });
      proc.stdin.write(rpcInit);
    });
    const seen = await rpcCall();
    const tools = seen.get(2)?.result?.tools?.length || 0;
    let positions = -1;
    try { positions = JSON.parse(seen.get(3).result.content[0].text).count; } catch {}

    chk("O12 the sponsor's MCP server exposes its tools", tools === 8, `${tools} tools over stdio`);
    chk("O13 MCP reads what the pad wrote", positions > 0,
        positions < 0 ? "the MCP server did not answer" : `memory_list(position) -> ${positions}`);
  }

  // #7 — what a wipe actually cost, measured rather than asserted.
  await j("/memory/wipe", { method: "POST" });
  const d = await j("/memory/diff");
  chk("O14 the wipe diff names what was lost",
      (d.b.lost?.entities?.position || []).length > 0 && d.b.lost.references.includes("risk/limits"),
      `lost [${(d.b.lost?.entities?.position || []).join(", ")}] + ${d.b.lost?.references?.length} reference(s) + ${d.b.lost?.journal} events`);
  // The cost is settled at the wipe. Recomputing it later compared the old
  // snapshot against a store that had regrown, and reported a NEGATIVE loss.
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const d2 = await j("/memory/diff");
  await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });   // leave nothing pending
  chk("O16 the cost stays what it was, and is never negative",
      d2.b.lost.journal === d.b.lost.journal && d2.b.lost.journal >= 0 && !!d2.b.at,
      `${d2.b.lost.journal} events, stamped ${String(d2.b.at).slice(11, 19)}`);
  const b2 = await j("/briefing");
  chk("O15 the briefing after a wipe is honest", /remember nothing/i.test(b2.b.text), `"${b2.b.text.slice(0, 60)}…"`);

  await j("/memory/seed", { method: "POST", body: "{}" });
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
} catch (e) { chk("O crashed", false, String(e.message || e).slice(0, 92)); }

// ── P. the physical pad's contract ──────────────────────────────────────────
section("P. the pad on the desk");
try {
  // One cheap poll carries everything the pad's LED and keycaps need.
  const t0 = Date.now();
  const pad = await j("/pad");
  const ms = Date.now() - t0;
  const need = ["armed","agent","market","sizeUsd","pending","mode","chainOk",
                "remembers","spentToday","dayLimit","unrealised","price"];
  chk("P1 GET /pad carries the whole pad state", pad.s === 200 && need.every((k) => k in pad.b),
      `${Object.keys(pad.b || {}).length} fields in ${ms}ms`);
  chk("P2 /pad is cheap enough to poll", ms < 150, `${ms}ms (budget 150)`);

  // Speech for the amp: raw PCM at the rate the mic records at.
  const sp = await fetch(B + "/speak?text=" + encodeURIComponent("xorr pad connected"), { headers: H });
  const spb = Buffer.from(await sp.arrayBuffer());
  let peak = 0;
  for (let i = 0; i + 1 < spb.length; i += 2) peak = Math.max(peak, Math.abs(spb.readInt16LE(i)));
  chk("P3 GET /speak returns playable PCM",
      sp.status === 200 && sp.headers.get("content-type") === "application/octet-stream" &&
      sp.headers.get("x-sample-rate") === "16000" && spb.length > 8000 && peak > 2000,
      `${(spb.length / 2 / 16000).toFixed(2)}s at 16kHz, peak ${peak}`);
  const spEmpty = await j("/speak");
  chk("P4 /speak refuses an empty line", spEmpty.s === 400 && /nothing to say/.test(spEmpty.b.error || ""),
      `${spEmpty.s} "${spEmpty.b?.error}"`);
  chk("P5 the pad's routes are auth-gated",
      (await j("/pad", { noauth: true })).s === 401 && (await j("/speak?text=hi", { noauth: true })).s === 401,
      "both 401 without the pad token");

  // A spoken ticker that resolves to nothing must NEVER become the market in
  // hand. "Buy $50 of ETH" came back from Deepgram as "ETA" and bought VIRTUAL.
  {
    const sym = (t) => { const g = parseIntent(t, "momentum", "VIRTUAL");
                         return g?.needsMarket ? "REFUSE" : (g?.symbol ?? null); };
    const cases = [
      ["Buy $50 of ETA.", "ETH"], ["Buy $50 of E T A", "ETH"], ["buy fifty dollars of eath", "ETH"],
      ["buy 40 dollars", "VIRTUAL"], ["buy 30 of it.", "VIRTUAL"],
      ["Buy $40 of Zorblax.", "REFUSE"], ["Sell $25 of Doge!", "REFUSE"],
    ];
    const bad = cases.filter(([t, want]) => sym(t) !== want);
    chk("P6 a mis-heard ticker never becomes the market in hand", bad.length === 0,
        bad.length ? bad.map(([t]) => `"${t}"->${sym(t)}`).join(", ")
                   : `${cases.length}/${cases.length} — ETA resolves to ETH, unknown names are refused`);
  }
} catch (e) { chk("P crashed", false, String(e.message || e).slice(0, 92)); }

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m` +
            "   (2 skipped: credentials unavailable)\n");
process.exit(fail ? 1 : 0);
