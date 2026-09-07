/**
 * trader.mjs — the loop the desk actually runs.
 *
 *   recall memory -> read the market -> agents propose -> decide() gates it
 *   -> execute -> write the outcome back to memory
 *
 * The last step is what makes the next decision better, and what makes wiping
 * the store visibly break the thing. Prices come from real on-chain quotes, so
 * there is no price API key and no invented number anywhere.
 */
import { evaluateAll, AGENT_KINDS } from "./agents.mjs";
import { decide } from "./decide.mjs";
import { quote, swap, ROUTE } from "./dex.mjs";
import { balances, chainInfo, IS_FORK } from "./chain.mjs";
import { TOKENS } from "./tokens.mjs";

/** Real prices, straight off the pools we would trade against. */
export async function getMarket(symbols = ["ETH", "cbBTC", "DEGEN"]) {
  const prices = {}, failed = {};
  for (const s of symbols) {
    try {
      const probe = s === "DEGEN" ? 100 : s === "cbBTC" ? 0.01 : 0.1;
      const q = await quote(s, "USDC", probe);
      prices[s] = q.amountOut / probe;
    } catch (e) { failed[s] = String(e.message || e).slice(0, 80); }
  }
  prices.USDC = 1;
  return { prices, failed, at: new Date().toISOString() };
}

/** Fold a fill back into the remembered position (average up/down honestly). */
export async function applyFill(mem, { symbol, side, usd, price }) {
  const cur = (await mem.getEntity("position", symbol).catch(() => null))?.body || null;
  const qty = price ? usd / price : 0;
  if (side === "BUY") {
    const newQty = (cur?.qty || 0) + qty;
    const newAvg = cur?.qty
      ? ((cur.qty * cur.avg_entry_usd) + usd) / newQty
      : price;
    await mem.setEntity("position", symbol, {
      qty: newQty, avg_entry_usd: newAvg, updated: new Date().toISOString(),
    });
  } else {
    const newQty = Math.max(0, (cur?.qty || 0) - qty);
    if (newQty <= 1e-12) await mem.deleteEntity("position", symbol).catch(() => {});
    else await mem.setEntity("position", symbol, {
      qty: newQty, avg_entry_usd: cur?.avg_entry_usd ?? price,
      updated: new Date().toISOString(),
    });
  }
}

/**
 * One pass of the loop.
 * @param opts.execute  actually sign (fork: true by default; mainnet: never
 *                      without an explicit confirmation upstream)
 */
export async function runOnce(mem, { execute = IS_FORK, cfgs = {}, market } = {}) {
  const brief = await mem.recallBrief();
  const mkt = market || await getMarket();
  const signals = evaluateAll(mkt, brief, cfgs);
  if (!signals.length) return { signals: [], verdict: null, fill: null, market: mkt };

  const signal = signals[0];
  const verdict = decide(signal, brief);

  // The proposal is journaled whether or not it executes — that history is
  // what reflection later turns into rules.
  await mem.journal({
    evaluated: { signal, market: mkt.prices },
    acted: { action: verdict.action, usd: verdict.sizeUsd, executed: false },
    forward: { why: verdict.why },
  });

  let fill = null;
  if (verdict.action === "EXECUTE" && execute) {
    if (!IS_FORK) throw new Error("refusing to auto-execute on mainnet — needs explicit confirmation");
    const px = mkt.prices[signal.symbol];
    const [sell, buy] = signal.side === "BUY"
      ? ["USDC", signal.symbol] : [signal.symbol, "USDC"];
    const amountIn = signal.side === "BUY"
      ? verdict.sizeUsd                       // spend USD
      : verdict.sizeUsd / px;                 // sell this much of the asset
    fill = await swap(sell, buy, Number(amountIn.toFixed(TOKENS[sell].decimals > 8 ? 8 : 6)));
    await applyFill(mem, { symbol: signal.symbol, side: signal.side, usd: verdict.sizeUsd, price: px });
    await mem.journal({
      evaluated: { signal },
      acted: { action: "FILL", usd: verdict.sizeUsd, executed: true, hash: fill.hash },
      forward: { received: fill.received, symbol: fill.receivedSymbol },
    });
  }

  return { signals, signal, verdict, fill, market: mkt, brief };
}

export async function snapshot(mem) {
  const [info, bal, brief] = await Promise.all([chainInfo(), balances(), mem.recallBrief()]);
  return { chain: info, route: ROUTE, balances: bal, memory: brief, agents: AGENT_KINDS };
}
