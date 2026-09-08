/**
 * routers/index.mjs — which router executes a trade.
 *
 * There is one today. The point of the seam is not variety for its own sake:
 * the tokenized equities in `stocks.mjs` have their depth on a custom
 * concentrated-liquidity factory and on Uniswap v4, neither of which a direct
 * V3 call can reach, so an aggregator is the only route to them. This is where
 * one plugs in.
 *
 * A router is selected only if it says it is `available()` — meaning it has
 * whatever credential it needs. A router that cannot run must never be chosen
 * and must never be reported: the route on a fill is read back off the mined
 * receipt in dex.mjs precisely so a label cannot drift from what happened.
 */
import * as uniswap from "./uniswap.mjs";

/** Every router built, in preference order. */
export const ALL = [uniswap];

/** Those that have what they need to run right now. */
export function usable() { return ALL.filter((r) => r.available()); }

/**
 * The router to trade through.
 *
 * `ROUTER` names one explicitly; otherwise the first usable one wins. Naming a
 * router that cannot run is an error rather than a silent fallback — quietly
 * routing somewhere other than where you were told is how a fill ends up
 * claiming a venue it never touched.
 */
export function pick(preferred = process.env.ROUTER) {
  const ready = usable();
  if (!ready.length) throw new Error("no router is available — this build cannot execute a trade");
  if (!preferred) return ready[0];
  const want = ALL.find((r) => r.name === preferred);
  if (!want) throw new Error(`unknown router "${preferred}" — built: ${ALL.map((r) => r.name).join(", ")}`);
  if (!want.available())
    throw new Error(`router "${preferred}" is built but not usable — it is missing its API key`);
  return want;
}

/** Address -> router name, for reading a route back off a receipt. */
export function bySpender() {
  return new Map(ALL.map((r) => [String(r.spender).toLowerCase(), r.name]));
}
