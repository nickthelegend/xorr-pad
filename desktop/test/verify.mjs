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

  const fonts = await fetch(B + "/fonts/archivo-var.woff2");
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
  const u1 = await usdc();
  const fills = [a, b2].filter((r) => r.b?.fill).length;
  chk("G6 concurrent confirm fills exactly once",
      fills === 1 && u0 != null && u1 != null && (u0 - u1) < 60,
      u0 == null || u1 == null
        ? "the Base node stalled and /portfolio returned 503 — cannot measure the balance"
        : `${fills} fill, $${(u0 - u1).toFixed(2)} moved`);

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
  // Deepgram returns "By" for "Buy" often enough that pinning the assertion to
  // one spelling tests the transcriber's mood, not the product.
  chk("E2 Deepgram STT", /\bbu?y\b/i.test(t) && /(50|fifty)/.test(t) && /eth/.test(t), `heard "${text}"`);

  const sig = parseIntent(text, "momentum");
  chk("E2b speech becomes an order", sig?.side === "BUY" && sig?.sizeUsd === 50, JSON.stringify(sig));
  chk("E2c spoken amounts parse", parseAmount("$50") === 50 && parseAmount("fifty bucks") === 50 &&
      parseAmount("two hundred") === 200, "'$50' · 'fifty bucks' · 'two hundred'");

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
  await k("AERO"); await k("buy"); await k("yes");
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

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m` +
            "   (2 skipped: credentials unavailable)\n");
process.exit(fail ? 1 : 0);
