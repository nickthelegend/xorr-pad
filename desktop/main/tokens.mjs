/** tokens.mjs — the Base tokens the pad may touch. Addresses are Base mainnet
 *  (chain 8453); the fork inherits them, which is why fills there are real. */
export const TOKENS = {
  ETH:   { symbol: "ETH",   address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals: 18, native: true },
  WETH:  { symbol: "WETH",  address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  USDC:  { symbol: "USDC",  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  cbBTC: { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
  DEGEN: { symbol: "DEGEN", address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", decimals: 18 },
};
export const bySymbol = (s) => TOKENS[s] || null;
export const UNISWAP_V3 = {
  router: "0x2626664c2603336E57B271c5C0b26F421741e481", // SwapRouter02, Base
  quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", // QuoterV2, Base
  fees: [500, 3000, 10000],
};
