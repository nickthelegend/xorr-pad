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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Memory, DEFAULT_LIMITS } from "./memory.mjs";
import { runOnce, getMarket, snapshot, applyFill } from "./trader.mjs";
import { decide } from "./decide.mjs";
import { evaluate } from "./agents.mjs";
import { swap } from "./dex.mjs";
import { IS_FORK } from "./chain.mjs";
import { readFile } from "node:fs/promises";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const TOKEN = process.env.PAD_TOKEN || "";

export const state = {
  agent: "momentum",        // the baton: which agent the keys act through
  market: "ETH",
  sizeUsd: 50,              // the knob
  armed: true,
  pending: null,            // a signal waiting on YES/NO
  lastFill: null,
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

      if (url.pathname === "/memory/wipe" && req.method === "POST") {
        const out = await mem.wipe();
        note("MEMORY WIPED — the agent has forgotten its limits, positions and rules");
        return send(200, out);
      }

      if (url.pathname === "/portfolio")
        return send(200, await snapshot(mem));

      if (url.pathname === "/tick" && req.method === "POST") {
        const r = await runOnce(mem, { execute: state.armed && IS_FORK });
        if (r.fill) { state.lastFill = r.fill; note(`FILL ${r.fill.hash.slice(0, 12)}… ${r.fill.received} ${r.fill.receivedSymbol}`); }
        return send(200, r);
      }

      if (url.pathname === "/panic" && req.method === "POST") {
        state.armed = false; state.pending = null;
        note("PANIC — disarmed, pending cleared");
        return send(200, { armed: false });
      }

      if (url.pathname === "/key" && req.method === "POST")
        return send(200, await onKey(mem, String(body.id || "").toLowerCase()));

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
    const amountIn = p.sig.side === "BUY" ? p.verdict.sizeUsd : p.verdict.sizeUsd / px;
    const fill = await swap(sell, buy, Number(amountIn.toFixed(6)));
    await applyFill(mem, { symbol: p.sig.symbol, side: p.sig.side, usd: p.verdict.sizeUsd, price: px });
    await mem.journal({ evaluated: { signal: p.sig },
                        acted: { action: "FILL", usd: p.verdict.sizeUsd, executed: true, hash: fill.hash },
                        forward: { received: fill.received } });
    state.lastFill = fill;
    note(`FILL ${fill.hash.slice(0, 12)}… ${fill.received} ${fill.receivedSymbol}`);
    return { ok: true, fill };
  }

  if (id === "base") {                       // the white key: run a pass now
    const r = await runOnce(mem, { execute: state.armed && IS_FORK });
    if (r.fill) state.lastFill = r.fill;
    note(`BASE -> ${r.verdict ? r.verdict.action : "no signal"}`);
    return { ok: true, ...r };
  }
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
    console.log(`xorr-pad backend on http://${HOST}:${PORT}  (${IS_FORK ? "Base fork" : "Base MAINNET"}, auth ${TOKEN ? "on" : "OFF"})`);
  });
  return { srv, mem };
}

// run directly (argv[1] may be relative, so resolve before comparing)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
