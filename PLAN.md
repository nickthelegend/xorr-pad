# xorr-pad — build plan

**An AI agent that trades on your desk.** A desktop app, a backend that signs
real transactions on Base, and a physical ESP32 pad that drives the same gate.

A builder agent should be able to pick any single task below and execute it
without reading anything else first. Every task names the file it touches and
how you know it is done. Status tags: **DONE** · **IN PROGRESS** ·
**NOT STARTED** · **BLOCKED**.

Audited against the running code and live credentials on **2026-09-09**, not
against the README. Where this plan contradicts an earlier one, this is right.

---

## 1. What "done" and "winning" actually mean

This is not a generic trading bot. Three things make it the thing it is, and
they are what it has to be judged on.

**G1 — Memory is load-bearing, provably.** Delete the store and the same
keypress produces a different, worse decision. Not "we use a database" — the
verdict visibly changes and the app says what it forgot. *Currently true and
asserted by `desktop/test/loadbearing.test.mjs`.*

**G2 — Every fill is real.** Real contracts, real signed transactions, real
mined receipts, real balance movement. A fork is acceptable for a demo; a
simulation is not. *Currently true on a Base mainnet fork; **not yet proven on
mainnet**, which is the largest open item in this plan.*

**G3 — It refuses, out loud, with its working shown.** A verdict arrives with
numbered reasons drawn from memory. Refusals — thin liquidity, day budget spent,
a learned rule, an unrecognised spoken ticker — are the product's voice, not
error handling. *Currently true.*

**Winning** additionally needs:

**G4 — The physical pad works in front of a judge.** Provisioned over its own
captive portal, joined to the venue's Wi-Fi, driving the backend, speaking. A
pad that only works in a screenshot loses to one on the table.

**G5 — One command starts it.** A judge should not need `anvil` in one terminal
and `node` in another. There is a deliverable app.

**G6 — Nothing about it is fake.** No mocks, no stubs, no fallback data, no
route label that lies about how a fill happened.

---

## Phase 0 — Where it actually is today

Verified 2026-09-09 by running it, not by reading it.

| | Status |
|---|---|
| `desktop/test/verify.mjs` | **103 pass, 0 fail**, 2 skipped |
| `loadbearing.test.mjs` | PASS — 3 of 4 verdicts change on a wipe |
| Mocks / stubs / TODOs in `desktop/` | **1 grep hit, and it is a comment about a physical knob** — no code stubs |
| Real fills on a Base fork | yes — crypto, forex, defi and AI assets, all mined |
| Real fills on **mainnet** | **never attempted** |
| Deepgram STT + TTS | working, key valid |
| Claude brain (`claude -p`, CLI subscription — no API cost) | **working** — E3 and B18b pass |
| Groq brain | **BLOCKED — the key in `.env` returns `Invalid API Key`** |
| 1inch | **not implemented.** `ROUTE` is a label only |
| Desktop packaging | none — `npm start` runs Electron from source |
| ESP32 pad firmware | rewritten for xorr-pad, compiles, **never flashed** |

---

## Phase 1 — Make the route honest *(blocks G6)*

The single worst thing in the codebase right now. `desktop/main/dex.mjs:18` sets
`ROUTE = ONEINCH_KEY ? "1inch" : "uniswap"` and every fill is returned with
`route: ROUTE` — but `swap()` only ever calls Uniswap V3 `exactInputSingle`.
**Set `ONEINCH_API_KEY` and the app reports 1inch fills it did not make.**

- **T1.1 — Stop the label lying.** *NOT STARTED*
  In `desktop/main/dex.mjs`, make `ROUTE` reflect the code path actually taken.
  Until T2.x lands, that means `ROUTE = "uniswap"` unconditionally, and
  `ONEINCH_API_KEY` being set must not change any reported value.
  **Done when:** with `ONEINCH_API_KEY` set, a fill returns `route: "uniswap"`,
  and a new check in `verify.mjs` asserts the reported route matches the router
  address the transaction was actually sent to.

- **T1.2 — Assert route honesty in the suite.** *NOT STARTED*
  Add to `verify.mjs`: read the mined receipt's `to` address and assert it maps
  to the router named in `fill.route`.
  **Done when:** deliberately mislabelling the route fails the check.

---

## Phase 2 — Aggregator routing: 1inch and the alternatives *(G2, G6)*

> **Updated 2026-09-09 — this phase is now also what unlocks stocks.** Tokenized
> equities are listed and priced (Phase 8) but their depth sits on a custom
> concentrated-liquidity factory plus Uniswap v4, which this build cannot reach.
> An aggregator is no longer a nice-to-have comparison exercise; it is the only
> path to trading equities at all.

### How 1inch actually works, and whether it can work here

Researched 2026-09-09:

- **Endpoint:** `https://api.1inch.com/swap/v6.1/8453` for Base.
- **Auth:** `Authorization: Bearer <API_KEY>`.
- **Getting a key:** sign up at business.1inch.com, **complete KYC/KYB**, create
  a project. Free "Dev" plan = 100k calls/month, 60 req/min.
- **Mainnet only.** There is no Base testnet deployment.

**It can still be used against a fork.** The technique: call the 1inch API,
which quotes against *real* mainnet state and returns `tx.to`, `tx.data`,
`tx.value`; then submit that calldata to the local anvil fork. It works as long
as the fork block is near head, because the routes and pools the calldata
references must exist in the forked state. This is the only honest way to
exercise 1inch without spending money, and it is worth doing.

**Alternatives, for comparison:**

| Aggregator | Base | Auth | Key friction |
|---|---|---|---|
| **1inch v6.1** | yes | `Authorization: Bearer` | **KYC/KYB required** |
| **0x Swap v2** | yes (`chainId=8453`) | `0x-api-key` + `0x-version: v2` headers | dashboard signup, no KYC found |
| **Uniswap V3 direct** | yes | none | **already implemented and working** |

**Recommendation to plan against:** 0x is the lower-friction aggregator and
should be built first as the proof that the routing abstraction is real; 1inch
slots into the same interface once the KYC'd key exists. Uniswap stays the
no-key fallback and must remain the default.

- **T2.1 — A router interface with more than one implementation.** *NOT STARTED*
  New `desktop/main/routers/` with `uniswap.mjs` (move the existing code
  unchanged) and a common shape: `quote(sell, buy, amountIn)` and
  `buildTx(sell, buy, amountIn, slippage) -> {to, data, value}`.
  **Done when:** `swap()` in `dex.mjs` picks a router by name and the Uniswap
  path is byte-for-byte the behaviour it has today (suite still 103/103).

- **T2.2 — 0x router.** *BLOCKED — needs `ZEROX_API_KEY`, absent from `.env`*
  `routers/zerox.mjs` hitting `https://api.0x.org/swap/allowance-holder/quote`
  with `chainId=8453`, headers `0x-api-key` and `0x-version: v2`.
  **Done when:** a 0x-built transaction mines **on the fork** and moves the
  expected balance, and `fill.route === "0x"` matches the receipt's `to`.

- **T2.3 — 1inch router.** *BLOCKED — needs `ONEINCH_API_KEY` (KYC/KYB)*
  `routers/oneinch.mjs` against `/swap/v6.1/8453/swap`, plus its
  `/approve/transaction` flow for allowances.
  **Done when:** same bar as T2.2, with `fill.route === "1inch"`.

- **T2.4 — Best-execution comparison.** *NOT STARTED* (depends on T2.2 or T2.3)
  Quote every configured router for the same size and route through the best,
  recording the losers' quotes in the journal so the choice is auditable.
  **Done when:** a fill's journal entry names every router quoted and the margin
  it won by. This is a genuinely strong demo of "measured, not asserted".

- **T2.5 — The wallet question, answered.** *NOT STARTED*
  Document what "1inch wallet" means here: 1inch is an **aggregator API plus a
  self-custody wallet app**; this project does not integrate a wallet app, it
  holds a key and signs directly with viem. Write that distinction into
  `README.md` so nobody expects WalletConnect.
  **Done when:** the README says which of {aggregator API, wallet app, WalletConnect}
  is and is not used, and why.

---

## Phase 3 — Mainnet, for real *(G2 — the biggest open item)*

**Everything in this phase spends real money and must not be started without an
explicit go-ahead per step.** The plan is a ladder: each rung costs a few cents
and proves one thing.

**Key handling — read before doing anything.** `AGENT_PRIVATE_KEY` is absent
from `.env`. The owner puts it there **themselves**, in `.env` only, which is
already gitignored. It must never be pasted into a chat, a commit, a log line
or a terminal argument. Verified already: zero tracked files and zero commits in
history contain a key. A dedicated hot wallet funded with **≤ $30** is the right
vehicle — not a wallet holding anything that matters.

- **T3.1 — Pre-flight guards, re-read and confirmed.** *DONE*
  `chain.mjs:24` requires `AGENT_PRIVATE_KEY` on mainnet; `chain.mjs:25` refuses
  the anvil key on mainnet; `server.mjs:406` gates auto-execute on
  `state.armed && IS_FORK`, so **automation can never fire on mainnet** — only a
  human ✓. Verified by `C5` in the suite.

- **T3.2 — Mainnet read-only bring-up.** *NOT STARTED — needs a funded key*
  `CHAIN_MODE=mainnet` with a real `RPC_URL`. No transaction. Confirm
  `/portfolio` reads the real balance, `/pad` reports `mode: "mainnet"`, and the
  header reads **Base MAINNET**.
  **Done when:** the desk shows the real wallet's balances and nothing has been
  signed.

- **T3.3 — Rung 1: the smallest possible signed transaction.** *NOT STARTED*
  One ~$1 USDC→ETH swap, confirmed by a human ✓.
  **Done when:** a real Basescan link, `status: success`, and the balance delta
  matches the quote within slippage.

- **T3.4 — Rung 2: the round trip.** *NOT STARTED* Sell it back. Records the
  true cost of a round trip in fees — the number the book's "measured, not
  profitable" claim rests on.

- **T3.5 — Rung 3: one fill per asset class.** *NOT STARTED*
  ~$1 each into cbBTC, EURC, AERO, MORPHO, VIRTUAL. Proves the multi-asset claim
  on the real chain, not just the fork.

- **T3.6 — Rung 4: the refusals, on mainnet.** *NOT STARTED*
  Confirm on the real chain that the liquidity gate refuses a too-thin market,
  the day budget refuses when spent, and a ✓ while disarmed is refused.
  **Done when:** each refusal is observed on mainnet, costing nothing.

- **T3.7 — Gas and slippage sanity for mainnet.** *NOT STARTED*
  The 30% gas margin and 1% slippage were tuned on a fork with no competition.
  Re-check both against real Base conditions and record what was chosen.

- **T3.8 — A mainnet run log.** *NOT STARTED*
  `MAINNET.md`: every transaction hash, what it proved, what it cost. This is
  the artifact that answers "is any of this real?".

---

## Phase 4 — LLM providers *(G3)*

- **T4.1 — Claude via the CLI subscription.** *DONE*
  `desktop/main/voice.mjs:101` runs `claude -p <prompt> --output-format text`
  through `execFile`. **This is the subscription, not the API — it costs
  nothing per call.** `BRAIN=claude` is already the default (`voice.mjs:30`).
  Verified working: suite checks `E3` and `B18b` both pass.

- **T4.2 — Groq.** *BLOCKED — the key is invalid*
  `GROQ_API_KEY` is present in `.env` but Groq answers
  `{"error":{"code":"invalid_api_key"}}`. This is a **change from the earlier
  diagnosis** of a project-level model block — the key is now simply not valid.
  **Unblock:** mint a fresh key at console.groq.com and replace it in `.env`.
  Nothing in the code needs changing; `brainGroq` is written and the model list
  is configurable via `GROQ_MODEL`.
  **Done when:** `BRAIN=groq node test/verify.mjs` passes `E4` instead of skipping.

- **T4.3 — Make the brain robust to a partial brief.** *NOT STARTED*
  `think()` throws `Cannot read properties of undefined` when handed a brief
  missing fields — found by calling it directly during this audit. The real path
  always passes a complete brief, so this is latent, but it is one refactor away
  from being live.
  **Done when:** `think()` with `{}` returns an honest answer instead of throwing.

- **T4.4 — Say which brain answered.** *NOT STARTED*
  `/voice` should return an `x-brain` header and the desk should show it.
  **Done when:** the UI names the brain that produced the answer.

---

## Phase 5 — The xorr-desktop deliverable *(G5)*

There is no separate `xorr-desktop` project — the Electron app **is**
`xorr-pad/desktop`, and it is not packaged. `npm start` runs it from source and
`package.json` has no build tooling (`devDependencies` is empty).

- **T5.1 — One command that starts everything.** *NOT STARTED*
  Electron's `boot()` already starts the backend in-process, but **anvil is not
  managed** — the fork must be started by hand first. Supervise `fork.sh` from
  `main/electron.mjs`, wait for the RPC to answer, then bind.
  **Done when:** with nothing running, `npm start` brings up fork, backend and
  window, and shows a real readout.

- **T5.2 — Package it.** *NOT STARTED*
  Add `electron-builder`, a macOS arm64 target, an icon from the printed pad's
  blue, and a `dist` script.
  **Done when:** `npm run dist` produces a `.app` that launches on a machine
  that has never run `npm install`.

- **T5.3 — First-run experience.** *NOT STARTED*
  Packaged, there is no `.env`. The app needs a first-run screen for the
  Deepgram key, chain mode and pad token, written to `app.getPath("userData")`.
  **Done when:** a fresh machine can go from download to a working desk without
  a terminal.

- **T5.4 — Ship the pad token to the pad.** *NOT STARTED*
  The desk should show its LAN URL and token as a QR the pad's portal can be
  pointed at, instead of typing an IP on a phone keyboard.

---

## Phase 6 — The pad on the desk *(G4)*

Firmware is rewritten, compiles, and its backend contract is covered by suite
section P. **It has never been flashed** — no ESP32 is connected to this
machine (`/dev/cu.*` is empty).

- **T6.1 — Flash it.** *BLOCKED — needs the board plugged in*
  `arduino-cli upload --fqbn esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi --port /dev/cu.usbmodem*`
  **Those board options are not optional** — the default FQBN gives a 4 MB
  partition scheme (90% full) and **PSRAM disabled**, and the 12-second record
  buffer is 384 KB of PSRAM.

- **T6.2 — Provision over the captive portal.** *BLOCKED — needs hardware*
  Join `xorr-pad-setup`, enter the desk's URL and token, save, confirm it joins
  and persists across a power cycle.

- **T6.3 — Walk every key on hardware.** *BLOCKED — needs hardware*
  All 16 positions register with no ghosting; the status light matches the
  desk's state in all five conditions; KILL needs its 600 ms hold.

- **T6.4 — Hold-to-talk on hardware.** *BLOCKED — needs hardware*
  Speak an order, confirm the transcript, hear the reply through the amp, and
  confirm it lands as a decision awaiting a ✓.

- **T6.5 — Print the trading keycaps.** *BLOCKED — needs the printer*
  The caps currently on the board are from the previous build. The legends are
  in `cad/part_caps.py`.

- **T6.6 — Fix the dead switch.** *BLOCKED — needs the bench*
  A known-dead switch at r2c1; row 3 unverified.

---

## Phase 7 — Security *(G6)*

- **T7.1 — Repo is clean.** *DONE*
  Verified 2026-09-09: zero tracked files and **zero commits in history**
  contain a live key or the leaked PAT; only an empty-placeholder `.env.example`
  is tracked; `.gitignore` covers `.env` and `*.bak`.

- **T7.2 — Rotate the exposed credentials.** *BLOCKED — owner action only*
  The Deepgram key and the GitHub PAT were pasted into a chat transcript. They
  never reached git, but a transcript is an exposure. Rotate at
  console.deepgram.com and github.com/settings/tokens. **No agent can do this —
  it needs the owner signed in.** Groq is moot: that key is already invalid.

- **T7.3 — Mainnet key hygiene.** *NOT STARTED* (gates Phase 3)
  A dedicated hot wallet, ≤ $30, `AGENT_PRIVATE_KEY` in `.env` only, entered by
  the owner. Never in chat, a commit, a log or a command argument.

---

## The honest gap list

Every gap, tied to the task it blocks. Ordered by how much it costs to leave.

| # | Gap | Evidence | Blocks |
|---|---|---|---|
| **1** | **The route label lies.** `ROUTE` reports `"1inch"` whenever `ONEINCH_API_KEY` is set, but `swap()` only ever calls Uniswap V3. No 1inch API call exists anywhere in `main/`. | `dex.mjs:18` vs `dex.mjs:198–272`; `grep -rn "api.1inch" main/` → nothing | T1.1, G6 |
| **2** | **Not one mainnet transaction has ever been signed.** Every fill in this project is on a fork. G2's strongest claim is untested where it counts. | `CHAIN_MODE` defaults to `fork`; no `MAINNET.md`; `AGENT_PRIVATE_KEY` absent | Phase 3, G2 |
| **3** | **No aggregator is implemented at all** — Uniswap direct is the only router. No best-execution comparison exists. | `main/` contains one router | Phase 2 |
| **4** | **The Groq key is invalid**, not permission-blocked as previously recorded. | live probe → `{"code":"invalid_api_key"}` | T4.2 |
| **5** | **The Electron app is not packaged and does not manage anvil.** No `electron-builder`, empty `devDependencies`, `npm start` assumes a fork is already up. | `desktop/package.json` | T5.1, T5.2, G5 |
| **6** | **The firmware has never run.** Compiles clean, contract covered by suite section P, but provisioning, I2S, matrix and NVS are all unverified. | no `/dev/cu.*`; PADPLAN section D | Phase 6, G4 |
| **7** | **`think()` throws on a partial brief.** Latent — the real path always passes a full one. | direct call during this audit | T4.3 |
| **8** | **Exposed credentials are not rotated.** Not in git, but in a transcript. | T7.1 verification | T7.2 |
| **9** | **The fork stalls under sustained load.** ~20 real swaps plus a concurrent burst can wedge the free public RPC. Mitigated (pinned block, boot warming, one fewer quote per swap, anvil retries) but not removed. | suite history | Phase 3 robustness |
| **10** | **No `ZEROX_API_KEY` or `ONEINCH_API_KEY`.** 1inch additionally needs KYC/KYB, which is days, not minutes. | `.env` | T2.2, T2.3 |

**Not gaps, recorded so nobody re-opens them:** there are **no mocks, stubs,
fake data or TODOs** in `desktop/` — the single grep hit is a comment about the
pad's physical knob being a non-functional part. The suite is 103/103. Memory is
load-bearing and asserted. The Claude brain runs on the CLI subscription and
costs nothing per call.

---

## Suggested order

1. **T1.1 + T1.2** — an hour, and it removes the only dishonest thing in the code.
2. **T4.2** — a new Groq key is five minutes and unskips a suite check.
3. **T5.1 + T5.2** — the deliverable a judge actually opens.
4. **Phase 3, rungs 1–2** — the claim that separates this from every simulated
   trading demo. Needs the owner's go-ahead and a funded hot wallet.
5. **T2.1 + T2.2** — real routing, once a 0x key exists.
6. **Phase 6** — the moment the board is on the desk.


---

## Phase 8 — Tokenized equities *(added 2026-09-09)*

Coinbase tokenized stocks went live natively on Base on 24 August 2026. Each
token is backed 1:1 by a share held at Alpaca, a regulated broker, and carries
dividends and voting rights. They are the strongest possible answer to "so it
trades memecoins?" — the same pad, the same gate, buying Nvidia.

- **T8.1 — List the equities, verified on-chain.** *DONE*
  `desktop/main/stocks.mjs`. Ten tickers with addresses, `decimals = 8` and
  measured pool depth, **each verified against real Base mainnet** — `symbol()`
  and `decimals()` read back and compared, not copied from a blog. Three more
  (COINc, INTCc, CRCLc) were announced but have no Base pool as of 2026-09-09
  and are listed as unlisted with that reason.

- **T8.2 — Show them, with marks.** *DONE*
  A Stocks section on the Markets screen: brand-coloured monogram marks drawn
  locally (no logo files, no CDN — the fonts are self-hosted for venue wi-fi and
  a logo CDN would undo that, and the wordmarks are not ours to ship), company
  name, real depth, and a "not yet" tag.

- **T8.3 — Refuse precisely.** *DONE*
  Two different refusals, never conflated: on a fork, "B20 token implemented by
  the Base node, a fork returns OpcodeNotFound"; on mainnet without a router,
  "depth is on a CL pool this build cannot route to — needs an aggregator key".

- **T8.4 — Route to them.** *BLOCKED — needs an aggregator key (T2.2 / T2.3)*
  **Done when:** a real equity fill mines on mainnet and the balance moves.

- **T8.5 — Price them on the strip.** *NOT STARTED*
  The equity rows show "—" because `feedPrices()` is Binance-backed and these
  are not Binance symbols. Read the price from the pool, or from the aggregator
  quote once T8.4 lands.

### The finding that makes Phase 8 hard, and it is not obvious

`eth_getCode` on a tokenized stock returns **a single byte, `0xef`**. There is
no program there. These are **B20 tokens implemented by the Base node itself**,
and the same call to the same address on 2026-09-09 gives:

```
real Base mainnet    symbol() -> "NVDAc"
local anvil fork     symbol() -> EVM error: OpcodeNotFound
```

anvil is vanilla revm. It forks *state*, and the behaviour here lives in the
node, not in state. **Tokenized equities cannot be traded on a fork at any
block.** Every stock trade this project ever makes will be a real mainnet
transaction with real money. That moves Phase 3 from "the strongest claim" to
"a hard prerequisite for the stocks demo".

---

## Phase 9 — The Claude connector, hardened *(added 2026-09-09)*

- **T9.1 — Lock the brain out of every tool.** *DONE*
  `desktop/main/voice.mjs`. The prompt embeds a Deepgram transcript and the
  pad's own journal — text the operator spoke and text other code wrote — and
  the CLI was being invoked with **default tool access** on a machine that holds
  a funded wallet. It now runs `--disallowed-tools Bash Read Edit Write Glob
  Grep WebSearch WebFetch Task NotebookEdit`, and
  `--dangerously-skip-permissions` is safe *only because* of that: headless with
  no tty, a permission prompt would hang until the timeout and read as a dead
  brain.

- **T9.2 — Parse the envelope, not the last stdout line.** *DONE*
  `--output-format json` with `is_error` honoured. The old code took the last
  non-empty stdout line, which would have turned a CLI error message into the
  pad's spoken answer.

- **T9.3 — Pin the model.** *DONE* — `CLAUDE_MODEL`, default `claude-opus-5`.

- **T9.4 — `think()` no longer throws on a partial brief.** *DONE*
  It dereferenced `brief.limits.allow.join()` unguarded. Closes gap 7.

Ported from `/Volumes/Extreme SSD/Projects/xorr` (`claude/claude_brain.py`,
`tui/brain.py`), which had solved this properly already. That project also
fails open to a deterministic fallback when the CLI is unavailable — worth
taking next (**T9.5, NOT STARTED**): right now a missing `claude` binary makes
the spoken answer fail rather than degrade.
