# Product

<!-- impeccable:product-schema 1 -->

> Every fact below is inferred from the repository — code, README, CAD sources,
> firmware and test output — because the operator directed this run to work it
> out rather than be interviewed. Nothing here is invented; anything the code
> does not establish is marked *undecided*.

## Platform

web

## Users

One primary user: **the operator at their own desk.** They own the pad, they
soldered it themselves, and they are sitting in front of it while it runs. They
are technical, they read a transaction hash without flinching, and they are
suspicious of trading software that will not show its working.

The second audience is a **hackathon judge** reading over that operator's
shoulder for a few minutes, who has to be able to tell — without a walkthrough —
that the memory is load-bearing and the fills are real.

## Product Purpose

A physical 15-key deck that runs an autonomous trading agent on Base and
**remembers**: risk limits, open positions, and rules learned from the
operator's own yes/no. Pressing a key proposes a trade; the agent gates it
against what it remembers; the operator confirms with a physical ✓ and a real
transaction mines.

Success is that a person can watch a decision be made, see which remembered
facts made it, and — by deleting the memory — watch the same keypress be decided
differently.

## Positioning

Two claims a neighbouring product could not truthfully copy:

1. **Deleting the memory demonstrably changes the trade.** Not a slogan: a test
   runs identical signals with and without the store and asserts the verdicts
   diverge, with a control that must stay unchanged.
2. **Every market and every strategy earned its place by measurement.** Markets
   are admitted by quoting a real pool at two sizes and comparing; strategies
   are ported from a research engine that publishes their t-statistics *and*
   the fact that they have not been shown to make money net of fees.

## Operating Context

The pad sits on a desk next to the screen. The operator is looking at hardware
and at a readout of that hardware, at the same time, in a room with the lights
on. Sessions are short and physical: press, read, confirm, or kill.

Because the operator hand-soldered the matrix and some switches are dead, **every
physical key is mirrored as a clickable control on screen** — the screen is the
guaranteed path when the hardware fails mid-demo.

## Capabilities and Constraints

- Six markets across four asset classes on Base: ETH, cbBTC (crypto), EURC
  (forex), AERO, MORPHO (defi), VIRTUAL (ai agents). Delisted for thin
  liquidity: DEGEN, BRETT, cbETH, wstETH, WELL, ONDO.
- Six strategies from the measured-edge book, each carrying its measurement.
- Runs against a Base mainnet fork; real contracts, real fills, no real money.
  Real mainnet always requires an explicit confirmation.
- Voice: hold the mic key, speak an order, hear the answer.
- Numbers on screen span **$0.0001 to $79,000** and quantities from 0.000632 to
  85.44 — precision must scale, and monospace alignment is not decoration.
- Latency is visible: a scan takes seconds, a fill takes seconds. Waiting is a
  normal state, not an error.
- The screen is the operator's own machine on their own network. No sign-up, no
  onboarding, no marketing surface exists.

## Brand Commitments

**The palette is already physical and is binding.** It is filament and plastic,
chosen and bought:

| role | value | where it exists |
|---|---|---|
| buy / yes | `#22C55E` | green filament keycaps |
| sell / no / kill | `#EF4444` | red filament keycaps |
| agent keys, mic, portfolio | `#F2F3F5` | white filament |
| the Base key | `#FFFFFF` | plain white |
| tray | `#AEB4BC` | grey |
| plate | `#F4F5F7` | off-white |
| legend infill | `#FFFFFF` / `#3F444D` | painted deboss |

Name: **xorr-pad**, always lowercase. Tagline: *"An AI agent that trades on your
desk."*

**Voice — the strongest brand asset in the repo.** The existing prose states
what is true and what is not, in the same breath, without hedging: *"no strategy
has been shown to make money"*, *"a $500 order moves the pool 239.7%"*, *"the
pad runs them because they are real and explainable, not because they print."*
Plain, lowercase, measured, unafraid of a bad number. Interface copy must sound
like the same person wrote it.

## Evidence on Hand

Real, in-repo, and never to be fabricated or rounded away:

- Measured price impact per market, and the delisting reasons.
- Strategy provenance: `+2.351% / +1.249%, t=7.49, n=1353` and the rest.
- Real transaction hashes from mined fills on the fork.
- `desktop/test/loadbearing.test.mjs` — the memory proof, exits 0.
- `desktop/test/verify.mjs` — 58 checks against the live product.
- Photographs of the built hardware in `docs/images/`.

There are **no** users, testimonials, revenue, or performance claims. The honest
performance fact is negative and must stay: the source engine's live book was
+$4.32 gross and −$23.07 net over 30 trades, the loss entirely fees.

## Product Principles

1. **Show the working.** A verdict without its reasons is not a verdict. Every
   number on screen names where it came from.
2. **The bad number stays.** Delisting reasons, blocked credentials and negative
   results are content, not embarrassment.
3. **The screen mirrors the object.** It is the readout of a physical instrument
   that exists, in the colours that instrument is actually printed in.
4. **Consent is physical and reversible.** Nothing executes without a ✓, the
   kill switch stops everything, and a decision you cannot see is one you cannot
   consent to.
5. **Precision is the aesthetic.** Alignment, tabular numerals and honest
   rounding are the craft here — not ornament.

## Accessibility & Inclusion

- Green and red carry trade meaning and are inherited from physical keycaps, so
  colour must never be the *only* signal — labels and position must also carry
  it.
- The operator may be reading at arm's length across a desk while looking at
  hardware; small type and low contrast fail this scene.
- Keyboard operation must survive: the deck rebuilt its DOM on a timer and lost
  focus until this was fixed.
- *Undecided:* no formal WCAG target has been set by the operator.
