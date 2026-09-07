# xorr-pad

**An AI agent that trades on your desk.**

<div align="center">
<img src="docs/images/top.png" alt="The xorr-pad deck — six agents, buy/sell, yes/no, Base, mic and a kill key" width="520">
</div>

A physical deck that runs an autonomous agent on **Base**, and **remembers** —
your risk limits, the positions you hold, and every rule it learned from your
yes/no — through [Sibyl Memory](https://github.com/Sibyl-Labs/Sibyl-Memory).

It trades **four asset classes on Base**, and the strategies it runs are ported
from [xorr](https://github.com/nickthelegend/xorr)'s measured-edge book — built
from forward returns measured on both halves of two years, not from a thesis.

Delete the memory and it trades blind. That is not a slogan; it is
[a test](desktop/test/loadbearing.test.mjs) that runs the same signals with and
without the store and asserts the verdicts diverge.

## What it trades

Every market was picked by measurement, not by taste: quote a real Uniswap V3
pool at $50 and at $500 and compare the two prices. If the bigger order does not
price within 2% of the smaller one, it is not tradeable and it is not listed.

| market | class | pool | a $500 order moves it |
|---|---|---|---|
| **ETH** | crypto | 0.01% tier | 0.01% |
| **cbBTC** | crypto | 0.05% | 0.00% |
| **EURC** | **forex** — a real EUR/USD position on Base | 0.05% | 0.01% |
| **AERO** | defi | 0.05% | 0.10% |
| **MORPHO** | defi | 1% | 0.03% |
| **VIRTUAL** | ai agents (Virtuals) | 0.3% | 0.01% |

Delisted by the same measurement: **DEGEN** (a $500 order moves the pool
**239.7%**), BRETT (52%), cbETH (8.3%), and wstETH/WELL/ONDO (no pool at all).
DEGEN was in the pad's allowlist until this check existed — memory says what you
are *allowed* to trade; only the pool says what you can trade without destroying
yourself on the way in. `swap()` refuses before signing when the two disagree.

**On stocks:** there is no tokenized equity on Base with real AMM liquidity. The
issuers that exist are KYC-gated and do not trade in permissionless pools, so the
pad will not pretend to quote them. EURC is the genuine non-crypto market. If a
tokenized equity ever gets a liquid pool it is one row in
[`markets.mjs`](desktop/main/markets.mjs) and every strategy trades it unchanged.

## The book — six measured strategies

Ported from xorr's `backend/strategies`, thresholds and holding periods intact:

| strategy | condition | measured (in-sample / held-out) |
|---|---|---|
| `deep_stretch_reversion` | ≥6% below the 50-bar mean | **+2.351% / +1.249%**, t=7.49, n=1353 |
| `oversold_exhaustion` | RSI < 25 | +0.577% / +0.393%, t=3.81, n=1652 |
| `stretch_capitulation` | ≥3% below the mean on 1.8× volume | two measured effects agreeing |
| `stretch_oversold_confluence` | ≥3% below **and** RSI < 32 | the intersection of the two strongest |
| `volume_thrust` | top-decile up move on 2.5× volume | +0.170% / +0.101%, t=1.84, n=1264 |
| `mr_band_fade` | 2σ below a 20-bar mean, in chop only | the ungated control that survived |

Two gates are shared, as in xorr: dip buying is switched **off** entirely while
BTC is below its 200-day mean (measured +0.946%/trade above it, −0.022% below),
and nothing is bought while it is still making lows.

**Not ported on purpose:** the ~45 inherited "fade the liquidation flush"
strategies. xorr's own gauntlet found almost all of them fail out-of-sample, and
shipping known-failing strategies to make a bigger number would be dishonest.

**And the honest part:** none of this has been shown to make money. xorr's live
book was +$4.32 gross and −$23.07 net over its first 30 trades, the entire loss
being fees. These are real, measured, too-small-to-pay-for-execution edges. The
pad runs them because they are real and explainable, not because they print.

## The deck

| | c0 | c1 | c2 | c3 |
|---|---|---|---|---|
| **r0** | 🎛 size knob | DCA | GRID | MOMENTUM |
| **r1** | REBALANCE | YIELD | RISK | ⬜ BASE |
| **r2** | 🟩 BUY | 🟥 SELL | 🟩 YES | 🟥 NO |
| **r3** | PORTFOLIO | 🎤 MIC | | 🟥 KILL |

Press an agent to take the baton, BUY/SELL to propose, YES/NO to answer — and
every yes/no teaches it. Hold MIC and just say *"buy fifty dollars of ETH"*.

## Run it

```bash
# 1. a Base mainnet fork — real contracts and liquidity, no real money
cd desktop && npm run fork

# 2. the desk app (hosts the backend the pad talks to)
npm install
CHAIN_MODE=fork PAD_TOKEN=xorrpad-dev npm start
```

It prints the LAN URL to type into the pad's captive portal. Point a browser at
`http://localhost:8080/?token=xorrpad-dev` if you'd rather drive it by hand —
**every pad key is clickable**, which matters because hand-soldered pads have
dead switches.

Prove the memory claim:

```bash
node desktop/test/loadbearing.test.mjs
```

## How a trade happens

```
memory ──▶ market ──▶ six agents ──▶ decide() ──▶ Uniswap on Base ──▶ journal
recall     real        propose        the gate      real signed tx     writeback
```

`decide()` is built only from what Sibyl remembers: it clamps to your cap,
vetoes anything matching a rule you accepted, refuses to sell a position it
cannot see, and subtracts today's spend from the journal.

## What's in here

| Path | What it is |
|---|---|
| `desktop/memory/sibyl_bridge.py` | the memory, over stdio JSON (Sibyl is Python-only) |
| `desktop/main/memory.mjs` | Node client — `recallBrief()` and the journal |
| `desktop/main/agents.mjs` | dca · grid · momentum · rebalance · yield · risk |
| `desktop/main/decide.mjs` | the gate where memory changes the trade |
| `desktop/main/dex.mjs` | quotes and real swaps on Base |
| `desktop/main/reflect.mjs` | mines your yes/no history into rules you accept |
| `desktop/main/voice.mjs` | Deepgram speech + a brain that has read memory |
| `firmware/` | the ESP32-S3 sketch, and `keytest` for wiring |
| `cad/` | the enclosure, parametric — `python assembly.py` rebuilds every STL |

## Hardware

ESP32-S3, 14 MX switches, INMP441 mic, MAX98357A amp + speaker. Wiring and pin
map in [`firmware/README.md`](firmware/README.md); dimensions in
[`SPEC.md`](SPEC.md). Caps print in three filaments —
`exports/print/xorr-pad-keycaps.3mf` opens straight in Bambu Studio.

`firmware/keytest` maps a hand-soldered matrix for you: it names each key, you
press it, and it prints a paste-ready `KEYMAP` — plus it beeps per key so you
can hear a dead switch.

## Status

- [x] enclosure, caps, 3MF
- [x] Sibyl memory + the load-bearing proof
- [x] Base fork, real Uniswap fills
- [x] six agents, `decide()`, kill switch
- [x] desk app, voice, firmware
- [ ] finish the key sweep (one dead switch, row 3 unswept)
- [ ] 1inch route (needs an API key)
- [ ] Virtuals

MIT. See [`PLAN.md`](PLAN.md) for the full build plan and
[`SUBMISSION.md`](SUBMISSION.md) for the memory writeup.
