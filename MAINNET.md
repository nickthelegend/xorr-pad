# MAINNET.md — the real-money run log

> **No transaction has ever been signed by this project on Base mainnet.**
> Every fill in every demo, screenshot, test and README claim is on a local
> anvil fork of Base mainnet. This file exists so that fact is written down
> somewhere explicit rather than inferred from the absence of a file, and so
> that the first real rung has somewhere honest to land.

Status as of **2026-09-09**: rungs 1–4 not started. They need a funded hot
wallet the owner creates and places in `.env` themselves (see PLAN.md T6.5).

---

## What HAS been done against real mainnet

All of it read-only. Reading the chain costs nothing and signs nothing, so
none of this was ever gated on money — an earlier version of the plan had
these marked blocked, and that was wrong.

### Read-only bring-up (PLAN.md T1.2)

Verified against real Base mainnet, with no key present:

| Check | Result |
|---|---|
| head block read | real, advancing |
| `NVDAc.symbol()` | returns `"NVDAc"` — where a fork reverts `OpcodeNotFound` |
| `/pad` | `mode: "mainnet"`, live ETH price |
| pressing ✓ | refused, naming the missing signing key |
| `wallet` | `null`; `READ_ONLY === true` |

The B20 result is the important one: tokenized equities are implemented by the
Base node rather than as bytecode, so they **cannot** exist on a fork at any
block. That is the one feature of this project that mainnet alone can show.

### Real gas and fee conditions (PLAN.md T1.7)

`node desktop/test/mainnet-conditions.mjs` — reads mainnet, never signs.

| Measurement | Value |
|---|---|
| real SwapRouter02 swaps sampled | 25, across 12 blocks |
| gas used | min 86,803 · p50 123,358 · p90 210,274 · max 239,912 |
| base fee, 20 blocks | 0.005 gwei, **1.00x swing** |
| priority fee | p50 0.001 gwei · p90 0.021 gwei |
| USDC→WETH price impact | $1: 0.0000% · $100: 0.0002% · $1,000: 0.0020% |

The 2.76x gas spread is across *different swap shapes* and does not judge our
margin. It does say a fixed gas limit would be wrong.

### Is the 30% gas margin right? (PLAN.md T1.7)

`node desktop/test/gas-drift.mjs` — real fills on the fork. A mined transaction
carries both the limit we set (`estimate * 1.30`) and the gas actually used, so
the drift is recoverable after the fact.

| leg | estimate | used | drift |
|---|---|---|---|
| USDC→ETH | 125,545 | 122,355 | 0.975x |
| USDC→cbBTC | 140,925 | 137,486 | 0.976x |
| USDC→EURC | 296,008 | 290,408 | 0.981x |
| **USDC→AERO** | 439,354 | 478,932 | **1.090x** |
| USDC→MORPHO | 145,514 | 142,004 | 0.976x |

Worst drift **1.090x** against a **1.30x** margin: it held with 16.1% unused.
Justified by measurement, and not over-provisioned either.

### Change made because of these numbers

Slippage tolerance was a flat **1%**, tuned on a fork. Measured impact at the
sizes this pad trades is 0.000–0.002% — so 1% is roughly **500x wider than the
pool requires**, and on mainnet the whole of that gap is the window a sandwich
runs in, paid out of our own fill.

`DEFAULT_SLIPPAGE_PCT` is now mode-aware: **1% on a fork** (where a tight bound
can only fail a demo swap over drift that costs nobody anything) and **0.3% on
mainnet**. Asserted by suite check M7.

---

## The run log

Empty. Each rung below gets a row when — and only when — it actually runs.

### Rung 1 — the smallest signed transaction (T1.3)
One ~$1 USDC→ETH swap behind a human ✓.
**Done when:** a Basescan link, `status: success`, and a balance delta matching
the quote within slippage.

| hash | what it proved | gas paid | fill vs quote |
|---|---|---|---|
| *not run* | | | |

### Rung 2 — a round trip (T1.4)
Buy then sell the same ~$1. **Done when:** the true fee cost is recorded — the
number the book's "measured, not profitable" claim rests on.

| hash | side | gas paid | net cost |
|---|---|---|---|
| *not run* | | | |

### Rung 3 — one fill per asset class (T1.5)
~$1 each into cbBTC, EURC, AERO, MORPHO, VIRTUAL.

| asset | hash | gas paid |
|---|---|---|
| *not run* | | |

### Rung 4 — an equity fill (T1.6)
The route exists (KyberSwap reaches `aerodrome-cl`). This is the one feature
that cannot be demonstrated on a fork at any block.

| equity | hash | gas paid | fill vs quote |
|---|---|---|---|
| *not run* | | | |

---

## Before any rung runs

1. A **dedicated hot wallet**, funded with **≤ $30**, created by the owner.
2. Its key placed in `.env` by the owner — **never** pasted into a chat, a
   commit, a log line or a command argument.
3. `CHAIN_MODE=mainnet`. Note that automation is refused on mainnet by
   construction (`server.mjs` gates auto-execute on `state.armed && IS_FORK`),
   so every rung is a deliberate human ✓.
4. One rung at a time, with the result written here before starting the next.
