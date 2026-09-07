/**
 * chain.mjs — Base, for real.
 *
 * CHAIN_MODE=fork    -> a local anvil fork of Base mainnet. Real contracts,
 *                       real liquidity, real signed transactions, no real money.
 *                       This exists because 1inch (and most Base liquidity)
 *                       has no testnet, so a fork is the only honest way to
 *                       execute a real fill without spending funds.
 * CHAIN_MODE=mainnet -> the actual chain. Auto-trade is refused here; every
 *                       fill needs an explicit confirmation.
 */
import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, erc20Abi } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { TOKENS } from "./tokens.mjs";

export const MODE = process.env.CHAIN_MODE || "fork";
export const IS_FORK = MODE === "fork";
const RPC = process.env.RPC_URL || (IS_FORK ? "http://127.0.0.1:8545" : "https://mainnet.base.org");

// anvil's first account — a well-known throwaway, only ever used on the fork.
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY = process.env.AGENT_PRIVATE_KEY || (IS_FORK ? ANVIL_KEY : null);
if (!KEY) throw new Error("AGENT_PRIVATE_KEY is required when CHAIN_MODE=mainnet");
if (!IS_FORK && KEY === ANVIL_KEY) throw new Error("refusing to use the anvil key on mainnet");

export const account = privateKeyToAccount(KEY);
export const pub = createPublicClient({ chain: base, transport: http(RPC) });
export const wallet = createWalletClient({ account, chain: base, transport: http(RPC) });

export async function chainInfo() {
  const [id, block] = await Promise.all([pub.getChainId(), pub.getBlockNumber()]);
  return { mode: MODE, rpc: RPC, chainId: id, block: Number(block), address: account.address };
}

export async function balances(symbols = Object.keys(TOKENS)) {
  const out = {};
  for (const s of symbols) {
    const t = TOKENS[s];
    if (!t) continue;
    if (t.native) {
      const wei = await pub.getBalance({ address: account.address });
      out[s] = { raw: wei, amount: Number(formatUnits(wei, 18)) };
    } else {
      const raw = await pub.readContract({
        address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
      out[s] = { raw, amount: Number(formatUnits(raw, t.decimals)) };
    }
  }
  return out;
}

/** Fund the agent on the fork so it can actually trade. No-op on mainnet. */
export async function fundOnFork(eth = "5") {
  if (!IS_FORK) return { funded: false, reason: "not a fork" };
  const hex = "0x" + parseUnits(eth, 18).toString(16);
  await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_setBalance",
                           params: [account.address, hex] }) });
  return { funded: true, eth };
}

export { formatUnits, parseUnits, erc20Abi };
