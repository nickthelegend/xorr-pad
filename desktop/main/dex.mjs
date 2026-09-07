/**
 * dex.mjs — turning a decision into a real fill on Base.
 *
 * Two routes:
 *   1inch  — used when ONEINCH_API_KEY is set. Their aggregator is mainnet-only
 *            (there is no Base Sepolia 1inch), which is exactly why the default
 *            environment here is a Base mainnet fork.
 *   uniswap— a direct SwapRouter02 call. Needs no API key, so a real fill is
 *            always possible. This is the default route.
 *
 * Either way the transaction is signed and mined; nothing here is simulated.
 */
import { parseAbi, formatUnits, parseUnits, erc20Abi, maxUint256 } from "viem";
import { pub, wallet, account, IS_FORK } from "./chain.mjs";
import { TOKENS, UNISWAP_V3 } from "./tokens.mjs";

const ONEINCH_KEY = process.env.ONEINCH_API_KEY || "";
export const ROUTE = ONEINCH_KEY ? "1inch" : "uniswap";

const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 ticksCrossed,uint256 gasEstimate)",
]);
const wethAbi = parseAbi([
  "function deposit() external payable",
  "function withdraw(uint256) external",
]);

const addr = (s) => (TOKENS[s].native ? TOKENS.WETH.address : TOKENS[s].address);

/** Best Uniswap quote across the standard fee tiers. */
export async function quote(sell, buy, amountIn) {
  const tIn = TOKENS[sell], tOut = TOKENS[buy];
  const amt = parseUnits(String(amountIn), tIn.decimals);
  let best = null;
  for (const fee of UNISWAP_V3.fees) {
    try {
      const { result } = await pub.simulateContract({
        address: UNISWAP_V3.quoter, abi: quoterAbi, functionName: "quoteExactInputSingle",
        args: [{ tokenIn: addr(sell), tokenOut: addr(buy), amountIn: amt, fee,
                 sqrtPriceLimitX96: 0n }],
        account: account.address,
      });
      const out = result[0];
      if (!best || out > best.amountOutRaw) best = { fee, amountOutRaw: out };
    } catch { /* no pool at this tier */ }
  }
  if (!best) throw new Error(`no Uniswap V3 pool for ${sell}->${buy}`);
  return {
    route: "uniswap", fee: best.fee,
    amountIn, amountInRaw: amt,
    amountOut: Number(formatUnits(best.amountOutRaw, tOut.decimals)),
    amountOutRaw: best.amountOutRaw,
    price: Number(formatUnits(best.amountOutRaw, tOut.decimals)) / Number(amountIn),
  };
}

async function ensureWeth(amountRaw) {
  const bal = await pub.readContract({ address: TOKENS.WETH.address, abi: erc20Abi,
    functionName: "balanceOf", args: [account.address] });
  if (bal >= amountRaw) return null;
  const hash = await wallet.writeContract({ address: TOKENS.WETH.address, abi: wethAbi,
    functionName: "deposit", value: amountRaw - bal });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

async function ensureAllowance(token, spender, amountRaw) {
  const cur = await pub.readContract({ address: token, abi: erc20Abi,
    functionName: "allowance", args: [account.address, spender] });
  if (cur >= amountRaw) return null;
  const hash = await wallet.writeContract({ address: token, abi: erc20Abi,
    functionName: "approve", args: [spender, maxUint256] });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

/** What we can actually spend of `sell` right now, in human units. */
export async function spendable(sell) {
  const t = TOKENS[sell];
  if (t.native) {
    const wei = await pub.getBalance({ address: account.address });
    const gasBuffer = parseUnits("0.01", 18);          // leave room for gas
    // A buy of ETH settles in WETH, so that is where a position actually
    // lives. Count it: selling has to see the ETH it just bought, not only
    // the native balance we keep for gas.
    const weth = await pub.readContract({ address: TOKENS.WETH.address, abi: erc20Abi,
      functionName: "balanceOf", args: [account.address] });
    const native = wei > gasBuffer ? wei - gasBuffer : 0n;
    return Number(formatUnits(native + weth, 18));
  }
  const raw = await pub.readContract({ address: t.address, abi: erc20Abi,
    functionName: "balanceOf", args: [account.address] });
  return Number(formatUnits(raw, t.decimals));
}

/**
 * Execute the swap. Returns the mined transaction hash and the observed
 * balance delta — we assert the tokens actually moved, not just that a tx
 * landed.
 */
export async function swap(sell, buy, amountIn, { slippagePct = 1 } = {}) {
  // Memory says what you are ALLOWED to trade; the chain says what you can
  // actually afford. Check both, or the router reverts with STF.
  const have = await spendable(sell);
  if (have < Number(amountIn))
    throw new Error(`insufficient ${sell}: need ${amountIn}, have ${have.toFixed(6)}`);
  const q = await quote(sell, buy, amountIn);
  const tOut = TOKENS[buy];
  const minOut = q.amountOutRaw * BigInt(Math.floor((100 - slippagePct) * 100)) / 10000n;

  const steps = {};
  if (TOKENS[sell].native) steps.wrap = await ensureWeth(q.amountInRaw);
  steps.approve = await ensureAllowance(addr(sell), UNISWAP_V3.router, q.amountInRaw);

  const outAddr = TOKENS[buy].native ? TOKENS.WETH.address : tOut.address;
  const before = await pub.readContract({ address: outAddr, abi: erc20Abi,
    functionName: "balanceOf", args: [account.address] });

  const hash = await wallet.writeContract({
    address: UNISWAP_V3.router, abi: routerAbi, functionName: "exactInputSingle",
    args: [{ tokenIn: addr(sell), tokenOut: addr(buy), fee: q.fee,
             recipient: account.address, amountIn: q.amountInRaw,
             amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const after = await pub.readContract({ address: outAddr, abi: erc20Abi,
    functionName: "balanceOf", args: [account.address] });

  const delta = after - before;
  if (delta <= 0n) throw new Error(`swap mined but ${buy} balance did not move`);

  return {
    route: ROUTE, hash, status: receipt.status, block: Number(receipt.blockNumber),
    gasUsed: Number(receipt.gasUsed), fee: q.fee, steps,
    sold: `${amountIn} ${sell}`,
    received: Number(formatUnits(delta, tOut.decimals)),
    receivedSymbol: buy,
    explorer: IS_FORK ? "(local fork)" : `https://basescan.org/tx/${hash}`,
  };
}
