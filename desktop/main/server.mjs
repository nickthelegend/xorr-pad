/**
 * server.mjs — what the pad on your desk talks to.
 *
 *   GET  /health                 open, so the pad can check connectivity
 *   POST /key    {id}            a key press: agent select, buy/sell, yes/no...
 *   GET  /portfolio              balances + positions + P&L
 *   GET  /memory                 what Sibyl currently knows (the judge's pane)
 *   POST /memory/wipe            the demo's "what breaks without memory"
 *   POST /tick                   run one agent pass
 *   POST /panic                  kill switch: disarm everything
 *
 * Bearer PAD_TOKEN on everything except /health.
 */
import http from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Memory, DEFAULT_LIMITS } from "./memory.mjs";
import { runOnce, getMarket, snapshot, applyFill } from "./trader.mjs";
import { decide } from "./decide.mjs";
import { evaluate } from "./agents.mjs";
import { swap, spendable } from "./dex.mjs";
import { IS_FORK } from "./chain.mjs";
import { reflect, acceptRule, rejectRule } from "./reflect.mjs";
import { readFile } from "node:fs/promises";
import { stt, tts, think, parseIntent, pcmToWav } from "./voice.mjs";
import { scan } from "./scan.mjs";
import { MARKETS, SYMBOLS, DELISTED, delistReason } from "./markets.mjs";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
/**
 * The pad listens on 0.0.0.0 so the hardware can reach it over Wi-Fi, which
 * means an unset token would leave a trading API open to the whole network.
 * Generate one instead of running without auth, and print it once so the pad
 * and the browser can be pointed at it.
 */
const GENERATED = !process.env.PAD_TOKEN;
const TOKEN = process.env.PAD_TOKEN || randomBytes(16).toString("hex");

export const state = {
  agent: "momentum",        // the baton: which agent the keys act through
  market: "ETH",
  sizeUsd: 50,              // the knob
  armed: true,
  pending: null,            // a signal waiting on YES/NO
  lastFill: null,
  lastScan: null,
  log: [],
};

const note = (m) => { state.log.unshift({ t: new Date().toISOString(), m }); state.log.length = Math.min(state.log.length, 50); console.log("  " + m); };

export function createServer(mem) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    // viem hands back bigints (wei, raw balances); JSON has no bigint, so
    // serialise them as strings rather than crashing the server.
    const jsonSafe = (_k, v) => (typeof v === "bigint" ? v.toString() : v);
    const send = (code, body) => {
      if (res.headersSent) return;
      res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(body, jsonSafe));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
      return res.end();
    }

    const open = url.pathname === "/health" || url.pathname === "/" || url.pathname === "/index.html";
    if (!open && TOKEN) {
      const auth = req.headers.authorization || "";
      const given = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers["x-pad-token"];
      if (given !== TOKEN) return send(401, { error: "bad pad token" });
    }

    if (url.pathname === "/voice" && req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const pcm = Buffer.concat(chunks);
      try {
        const transcript = await stt(pcmToWav(pcm));
        const brief = await mem.recallBrief();
        const market = await getMarket([state.market]).catch(() => ({ prices: {} }));

        // An order goes through the same decide() gate as an automated signal;
        // anything else is just answered out loud.
        let reply, verdict = null;
        const sig = parseIntent(transcript, state.agent, state.market);
        if (sig) {
          verdict = decide(sig, brief);
          state.pending = { sig, verdict, market };
          reply = verdict.action === "EXECUTE"
            ? `${sig.side} ${sig.sizeUsd} dollars of ${sig.symbol}. ${verdict.why.slice(-1)[0]}. Press yes to confirm.`
            : `I can't. ${verdict.why.slice(-1)[0]}.`;
        } else {
          reply = await think(transcript, brief, market);
        }
        await mem.journal({ evaluated: { heard: transcript },
                            acted: { action: sig ? "PROPOSED" : "ANSWERED", executed: false },
                            forward: { reply } });
        note(`heard "${transcript}" -> ${reply.slice(0, 60)}`);
        const out = await tts(reply);
        res.writeHead(200, { "content-type": "application/octet-stream",
          "x-transcript": encodeURIComponent(transcript), "x-reply": encodeURIComponent(reply),
          "x-action": verdict ? verdict.action : "ANSWER" });
        return res.end(out);
      } catch (e) {
        console.error("[voice]", e.message);
        if (!res.headersSent) { res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: String(e.message) })); }
        return;
      }
    }

    const body = await new Promise((r) => {
      const c = []; req.on("data", (d) => c.push(d));
      req.on("end", () => { try { r(JSON.parse(Buffer.concat(c).toString() || "{}")); } catch { r({}); } });
    });

    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const html = await readFile(new URL("../renderer/index.html", import.meta.url));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(html);
      }

      if (url.pathname === "/health")
        return send(200, { ok: true, mode: IS_FORK ? "fork" : "mainnet", agent: state.agent,
                           armed: state.armed, pending: !!state.pending });

      if (url.pathname === "/memory" && req.method === "GET")
        return send(200, await mem.recallBrief());

      // The deck's own history. Without this the UI could only ever show what
      // was clicked in that one tab — every physical pad press and every
      // automated tick would be invisible, and a refresh would erase it all.
      if (url.pathname === "/log" && req.method === "GET")
        return send(200, { log: state.log });

      if (url.pathname === "/memory/wipe" && req.method === "POST") {
        const out = await mem.wipe();
        // Any outstanding ✓ was reasoned from limits, positions and rules that
        // no longer exist. Honouring it would execute against forgotten facts,
        // so the wipe invalidates it and the operator has to decide again.
        const dropped = !!state.pending;
        state.pending = null;
        note("MEMORY WIPED — the agent has forgotten its limits, positions and rules"
             + (dropped ? "; the pending decision was voided with it" : ""));
        return send(200, { ...out, pendingVoided: dropped });
      }

      // Teach it its limits again. Without this a wipe is one-way until the
      // process restarts, so the demo could only ever be run once.
      if (url.pathname === "/memory/seed" && req.method === "POST") {
        const limits = body.limits || DEFAULT_LIMITS;
        await mem.setReference("risk/limits", limits);
        note(`re-taught: $${limits.max_trade_usd}/trade, $${limits.max_day_usd}/day`);
        return send(200, { limits });
      }

      // Run the measured-edge book across every market. This is the pad's
      // actual trading brain, and it is honest about finding nothing.
      if (url.pathname === "/scan") {
        const r = await scan();
        state.lastScan = r;
        note(`SCAN — ${r.summary}`);
        return send(200, r);
      }

      if (url.pathname === "/markets")
        return send(200, { markets: MARKETS, delisted: DELISTED, active: state.market });

      if (url.pathname === "/reflect" && req.method === "GET")
        return send(200, await reflect(mem));

      if (url.pathname === "/reflect/accept" && req.method === "POST") {
        if (!body.proposal?.id) return send(400, { error: "body must be {proposal:{id,…}}" });
        const r = await acceptRule(mem, body.proposal);
        note(`learned a rule: ${r.text}`);
        return send(200, r);
      }
      if (url.pathname === "/reflect/reject" && req.method === "POST") {
        if (!body.proposal?.id) return send(400, { error: "body must be {proposal:{id,…}}" });
        return send(200, await rejectRule(mem, body.proposal));
      }

      // Disarming is one-way from the red key and from /panic. Re-arming is
      // its own deliberate act, so nobody re-arms by mashing KILL twice.
      if (url.pathname === "/arm" && req.method === "POST") {
        state.armed = true;
        note("ARMED — trading re-enabled");
        return send(200, { armed: true });
      }

      if (url.pathname === "/portfolio")
        return send(200, await snapshot(mem));

      if (url.pathname === "/tick" && req.method === "POST") {
        const r = await runOnce(mem, { execute: state.armed && IS_FORK });
        if (r.fill) { state.lastFill = r.fill; note(`FILL ${r.fill.hash.slice(0, 12)}… ${Number(r.fill.received).toFixed(6)} ${r.fill.receivedSymbol}`); }
        return send(200, r);
      }

      if (url.pathname === "/panic" && req.method === "POST") {
        state.armed = false; state.pending = null;
        note("PANIC — disarmed, pending cleared");
        return send(200, { armed: false });
      }

      if (url.pathname === "/key" && req.method === "POST") {
        // Key ids are lowercase, but market symbols are not (cbBTC, EURC).
        // Resolve a symbol case-insensitively before flattening the rest.
        const raw = String(body.id || "");
        const asSymbol = SYMBOLS.find((k) => k.toLowerCase() === raw.toLowerCase())
          || Object.keys(DELISTED).find((k) => k.toLowerCase() === raw.toLowerCase());
        return send(200, await onKey(mem, asSymbol || raw.toLowerCase()));
      }

      return send(404, { error: "no such route" });
    } catch (e) {
      console.error("[route]", url.pathname, e.message);
      if (!res.headersSent) return send(500, { error: String(e.message || e) });
    }
  });
}

/** The deck. Every physical key lands here — and so does every UI click, so a
 *  dead switch never blocks a demo. */
async function onKey(mem, id) {
  const AGENTS = ["dca", "grid", "momentum", "rebalance", "yield", "risk"];

  if (AGENTS.includes(id)) {
    state.agent = id;
    await mem.setState("baton", { agent: id, market: state.market, sizeUsd: state.sizeUsd,
                                  at: new Date().toISOString() });
    note(`baton -> ${id}`);
    return { ok: true, agent: id };
  }

  // Pick which market the buy/sell keys act on. The pad has one knob and a
  // fixed deck, so the market cycles rather than needing a key each.
  if (id === "market" || SYMBOLS.includes(id) || DELISTED[id]) {
    const next = id === "market"
      ? SYMBOLS[(SYMBOLS.indexOf(state.market) + 1) % SYMBOLS.length]
      : id;
    if (!MARKETS[next]) {
      const why = delistReason(next);
      return { ok: false, error: why ? `${next} is delisted — ${why}` : `unknown market '${next}'` };
    }
    state.market = next;
    await mem.setState("baton", { agent: state.agent, market: next, sizeUsd: state.sizeUsd,
                                  at: new Date().toISOString() });
    note(`market -> ${next} (${MARKETS[next].class})`);
    return { ok: true, market: next, class: MARKETS[next].class };
  }

  if (id === "scan") {
    const r = await scan();
    state.lastScan = r;
    note(`SCAN — ${r.summary}`);
    if (r.signals.length) {
      const top = r.signals[0];
      const brief = await mem.recallBrief();
      const sig = { agent: top.strategy, side: top.side, symbol: top.symbol,
                    sizeUsd: state.sizeUsd, reason: top.rationale, confidence: top.confidence };
      const verdict = decide(sig, brief);
      state.pending = { sig, verdict, market: { prices: Object.fromEntries(r.markets.filter(m=>m.price).map(m=>[m.symbol,m.price])) } };
      note(`${sig.side} ${sig.symbol} $${sig.sizeUsd} -> ${verdict.action} $${verdict.sizeUsd}`);
      return { ok: true, scan: r, signal: sig, verdict, awaiting: verdict.action === "EXECUTE" ? "yes/no" : null };
    }
    return { ok: true, scan: r, signal: null, verdict: null };
  }

  if (id === "buy" || id === "sell") {
    const brief = await mem.recallBrief();
    const market = await getMarket([state.market]);
    const sig = { agent: state.agent, side: id.toUpperCase(), symbol: state.market,
                  sizeUsd: state.sizeUsd, reason: `${id} pressed on the pad`, confidence: 1 };
    const verdict = decide(sig, brief);
    state.pending = { sig, verdict, market };
    note(`${id.toUpperCase()} ${state.market} $${state.sizeUsd} -> ${verdict.action} $${verdict.sizeUsd}`);
    return { ok: true, signal: sig, verdict, awaiting: verdict.action === "EXECUTE" ? "yes/no" : null };
  }

  if (id === "yes" || id === "no") {
    const p = state.pending;
    if (!p) return { ok: false, error: "nothing pending" };
    // The kill switch has to stop the HUMAN path too, not just the automated
    // one. Pending is deliberately left intact: re-arm and the same ✓ stands.
    if (id === "yes" && !state.armed) {
      note("YES refused — the pad is disarmed");
      return { ok: false, error: "disarmed — re-arm before trading", armed: false };
    }
    state.pending = null;
    // The answer is the training signal reflection later learns from.
    await mem.journal({
      evaluated: { signal: p.sig, verdict: p.verdict },
      acted: { action: id === "yes" ? "APPROVED" : "REJECTED", usd: p.verdict.sizeUsd, executed: false },
      forward: { by: "operator", key: id },
    });
    if (id === "no") { note(`rejected ${p.sig.side} ${p.sig.symbol}`); return { ok: true, rejected: true }; }
    if (p.verdict.action !== "EXECUTE") return { ok: false, error: "that signal was not executable" };

    const px = p.market.prices[p.sig.symbol];
    const [sell, buy] = p.sig.side === "BUY" ? ["USDC", p.sig.symbol] : [p.sig.symbol, "USDC"];
    let amountIn = p.sig.side === "BUY" ? p.verdict.sizeUsd : p.verdict.sizeUsd / px;
    // clamp to what the wallet actually holds, so an over-sized proposal
    // degrades to a smaller real trade instead of reverting
    const have = await spendable(sell);
    if (have <= 0) return { ok: false, error: `no ${sell} to spend` };
    if (amountIn > have) { note(`clamped to balance: ${amountIn.toFixed(4)} -> ${have.toFixed(4)} ${sell}`); amountIn = have * 0.999; }
    const fill = await swap(sell, buy, Number(amountIn.toFixed(6)));
    await applyFill(mem, { symbol: p.sig.symbol, side: p.sig.side, usd: p.verdict.sizeUsd, price: px });
    await mem.journal({ evaluated: { signal: p.sig },
                        acted: { action: "FILL", usd: p.verdict.sizeUsd, executed: true, hash: fill.hash },
                        forward: { received: fill.received } });
    state.lastFill = fill;
    note(`FILL ${fill.hash.slice(0, 12)}… ${Number(fill.received).toFixed(6)} ${fill.receivedSymbol}`);
    return { ok: true, fill };
  }

  if (id === "base") return onKey(mem, "scan");   // the white key runs the book
  if (id === "portfolio") return { ok: true, ...(await snapshot(mem)) };
  if (id === "kill")      { state.armed = false; state.pending = null; note("KILL"); return { ok: true, armed: false }; }
  if (id === "mic")       return { ok: true, note: "voice handled on /voice" };

  return { ok: false, error: `unknown key '${id}'` };
}

export async function start() {
  const mem = new Memory();
  await mem.ping();
  const brief = await mem.recallBrief();
  if (!brief.limits) {
    await mem.setReference("risk/limits", DEFAULT_LIMITS);
    console.log("  seeded default risk limits into memory");
  }
  const srv = createServer(mem);
  srv.listen(PORT, HOST, () => {
    console.log(`xorr-pad backend on http://${HOST}:${PORT}  (${IS_FORK ? "Base fork" : "Base MAINNET"}, auth on)`);
    if (GENERATED) {
      console.log(`  no PAD_TOKEN was set, so one was generated for this run:`);
      console.log(`  ${TOKEN}`);
      console.log(`  open  http://localhost:${PORT}/?token=${TOKEN}`);
      console.log(`  set PAD_TOKEN in the environment to keep it stable across restarts.`);
    }
  });
  return { srv, mem };
}

// run directly (argv[1] may be relative, so resolve before comparing)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
