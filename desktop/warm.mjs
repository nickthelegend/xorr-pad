/**
 * warm.mjs — pull everything the pad will touch into the fork's cache, once.
 *
 * anvil fetches account and storage state from the upstream lazily, the first
 * time something reads it. The public Base RPC rate-limits hard, so that first
 * read can take 16 seconds or simply time out — and it happens in the middle of
 * a trade, which looks like the app hanging rather than the node fetching.
 *
 * This touches every token balance, every pool quote in both directions, and
 * the router's allowances up front. Combined with anvil's --state file, the
 * fork then answers locally and the upstream stops mattering.
 *
 *   node warm.mjs        # after ./fork.sh, before the demo
 */
import { balances, pub, account, erc20Abi } from "./main/chain.mjs";
import { quote } from "./main/dex.mjs";
import { TOKENS, UNISWAP_V3 } from "./main/tokens.mjs";
import { SYMBOLS } from "./main/markets.mjs";

const t0 = Date.now();
const step = async (label, fn) => {
  const s = Date.now();
  try { await fn(); console.log(`  ${label.padEnd(38)} ${Date.now() - s}ms`); }
  catch (e) { console.log(`  ${label.padEnd(38)} failed: ${String(e.message).slice(0, 60)}`); }
};

console.log("\nwarming the fork — every read below is fetched once, then cached locally\n");

await step("all token balances", () => balances());

for (const sym of SYMBOLS) {
  await step(`quote USDC -> ${sym}`, () => quote("USDC", sym, 25));
  await step(`quote ${sym} -> USDC`, () => quote(sym, "USDC", sym === "cbBTC" ? 0.0005 : sym === "ETH" ? 0.01 : 5));
}

for (const sym of ["USDC", "WETH", ...SYMBOLS.filter((s) => s !== "ETH")]) {
  const t = TOKENS[sym];
  if (!t || t.native) continue;
  await step(`allowance ${sym}`, () => pub.readContract({
    address: t.address, abi: erc20Abi, functionName: "allowance",
    args: [account.address, UNISWAP_V3.router] }));
}

console.log(`\nwarm in ${((Date.now() - t0) / 1000).toFixed(1)}s. The fork now answers from its own state.\n`);
