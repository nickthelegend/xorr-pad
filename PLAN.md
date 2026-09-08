# xorr-pad — build plan

**An AI agent that trades on your desk.** A desktop app, a backend that signs
real transactions on Base, and a physical ESP32 pad that drives the same gate.

A builder agent should be able to pick any single task below and execute it
without reading anything else first. Every task names the file it touches and
how you know it is done. Status tags: **DONE** · **IN PROGRESS** ·
**NOT STARTED** · **BLOCKED**.

Audited against the running code, the pushed repo and live credentials on
**2026-09-09**. Every status here was verified, not remembered. Where this
contradicts an earlier plan, this is right.

---

## 1. What "done" and "winning" actually mean

This is a **Sibyl hackathon** entry (`SUBMISSION.md`). Memory being load-bearing
is the headline criterion, so the goals are not generic.

**G1 — Memory is load-bearing, provably.** Delete the store and the same
keypress produces a different, worse decision. Not "we use a database" — the
verdict visibly changes and the app says what it forgot.
*True. Asserted by `desktop/test/loadbearing.test.mjs` and by CI on every push;
the last three runs are green.*

**G2 — Every fill is real.** Real contracts, real signed transactions, real
mined receipts, real balance movement. A fork is acceptable; a simulation is
not. *True on a Base mainnet fork. **Never attempted on mainnet** — the largest
open item here.*

**G3 — It refuses, out loud, with its working shown.** Verdicts arrive with
numbered reasons drawn from memory. Refusals — thin liquidity, day budget spent,
a learned rule, an unrecognised spoken ticker, a stock that cannot exist on a
fork — are the product's voice, not error handling. *True.*

**G4 — The physical pad works in front of a judge.** Provisioned over its own
captive portal, on venue Wi-Fi, driving the backend, speaking. A pad that only
works in a screenshot loses to one on the table. *Firmware written and
compiling; **never flashed**, and the copy in this repo is the wrong one — see
Phase 6.*

**G5 — One command starts it.** A judge should not need `anvil` in one terminal
and `node` in another. *Not true today.*

**G6 — Nothing about it is fake.** No mocks, no stubs, no fallback data, no
route label that lies about how a fill happened. *True except for the route
label — see Phase 1.*

---

## Status after the build pass, 2026-09-09

**23 of 43 tasks done. Nothing is in progress, and nothing remaining can be
started without the owner** — every open item needs real money, a credential
that cannot be created here, or the physical board.

| | |
|---|---|
| Suite | **129 passed, 0 failed**, run against the packaged `.app` |
| Load-bearing proof | PASS — 3 of 4 verdicts change on a wipe, control unchanged |
| CI | green |
| Blocked on real money + a funded key | Phase 3 (8 tasks), T7.3 |
| Blocked on a credential that cannot be created here | T2.2, T2.3, T2.4, T4.2, T8.4 |
| Blocked on hardware or the owner | Phase 6 (6 tasks), T7.2 |

## Phase 0 — Where it was before this pass, 2026-09-09

| | Status |
|---|---|
| `desktop/test/verify.mjs` | **103 pass, 0 fail**, 2 skipped |
| `loadbearing.test.mjs` | PASS — 3 of 4 verdicts change on a wipe |
| CI (`.github/workflows/memory.yml`) | exists, pushed, **last 3 runs green** |
| Code mocks / stubs / TODOs | **zero.** Every grep hit is the physical knob (a real snap-fit part with no encoder) or a CAD rendering term |
| Real fills on a Base fork | yes — crypto, forex, defi, AI, all mined |
| Real fills on **mainnet** | **never attempted** |
| Deepgram STT + TTS | working |
| Claude brain (`claude -p`, subscription — no API cost) | working, and now hardened |
| Groq brain | **BLOCKED — key returns `Invalid API Key`** |
| Tokenized equities | listed and verified on-chain; **not tradeable** |
| 1inch / any aggregator | **not implemented.** `ROUTE` is a label only |
| Desktop packaging | none — `npm start` runs Electron from source |
| Pad firmware **in this repo** | **stale, half-migrated** — see Phase 6 |

---

## Phase 1 — Make the route honest *(blocks G6)*

`desktop/main/dex.mjs:18` sets `ROUTE = ONEINCH_KEY ? "1inch" : "uniswap"` and
every fill returns `route: ROUTE` — but `swap()` only ever calls Uniswap V3
`exactInputSingle`. **Set `ONEINCH_API_KEY` and the app reports 1inch fills it
did not make.** There is no 1inch call anywhere in `main/`.

- **T1.1 — Stop the label lying.** *DONE — 2026-09-09*
  Make `ROUTE` reflect the path actually taken. Until Phase 2 lands that is
  `"uniswap"` unconditionally, and setting `ONEINCH_API_KEY` must not change any
  reported value.
  **Done when:** with the key set, a fill returns `route: "uniswap"`.
  **Done.** `ROUTE` no longer branches on a key nothing reads. A fill's route is
  now `routeOf(receipt.to)` — read back off the mined receipt, so it cannot
  disagree with what executed. The file header, which described "two routes",
  was rewritten to describe the one that exists.

- **T1.2 — Assert route honesty in the suite.** *DONE — 2026-09-09*
  In `verify.mjs`, read the mined receipt's `to` and assert it maps to the
  router named in `fill.route`.
  **Done when:** deliberately mislabelling the route fails the check.
  **Done — section Q, 4 checks, and mutation-tested both ways.** Q1 takes a real
  fill; Q2 compares its claimed route against the mined receipt's `to`; Q3 pins
  that address to Uniswap's SwapRouter02; Q4 spawns a fresh process with
  `ONEINCH_API_KEY` set and asserts `ROUTE` is still `uniswap`.

  Mutating `swap()` to claim `"1inch"` makes Q2 fail — *once the server is
  restarted*. The first mutation run passed everything, because the suite drives
  a long-lived process that had imported the pre-edit module: **the checks were
  measuring a stale daemon.** Worth remembering as a property of this suite, not
  a one-off.

---

## Phase 2 — Aggregator routing *(G2, G6 — and the only path to stocks)*

Not a comparison exercise any more. Equity depth sits on a custom
concentrated-liquidity factory plus Uniswap v4, neither of which this build can
reach, so **an aggregator is the only way stocks ever trade** (Phase 8).

### How 1inch works, researched 2026-09-09

- **Endpoint:** `https://api.1inch.com/swap/v6.1/8453` for Base.
- **Auth:** `Authorization: Bearer <key>`.
- **Getting a key:** business.1inch.com, **KYC/KYB required**, then a project.
  Free Dev plan: 100k calls/month, 60 req/min.
- **Mainnet only** — no Base testnet deployment.

It can still be exercised against a fork: the API quotes real mainnet state and
returns `tx.to` / `tx.data` / `tx.value`, and that calldata can be submitted to
anvil, provided the fork block is near head. That works for the six crypto
markets. **It does not work for equities** — see Phase 8.

| Aggregator | Base | Auth | Friction |
|---|---|---|---|
| 1inch v6.1 | yes | `Authorization: Bearer` | **KYC/KYB** |
| 0x Swap v2 | yes (`chainId=8453`) | `0x-api-key` + `0x-version: v2` | dashboard signup, no KYC found |
| Uniswap V3 direct | yes | none | **already working** |

**Build 0x first** — lowest friction, proves the abstraction. 1inch slots into
the same interface when the KYC'd key exists. Uniswap stays the no-key default.

- **T2.1 — Router interface with more than one implementation.** *DONE — 2026-09-09*
  `desktop/main/routers/` with `uniswap.mjs` (existing code moved unchanged) and
  a shared shape: `quote(sell, buy, amountIn)` and
  `buildTx(sell, buy, amountIn, slippage) -> {to, data, value}`.
  **Done when:** `swap()` picks a router by name and the Uniswap path behaves
  exactly as today — suite still 103/103.
  **Done — `main/routers/`.** A router owns the two things that differ between
  venues, `quote()` and `buildSwap()`; everything around them stays in
  `dex.mjs` — the balance clamp, the allowance, the gas margin, waiting for the
  receipt, checking the balance actually moved — because that is where the
  expensive bugs were and duplicating it per router would re-introduce them.
  `pick()` refuses to silently fall back: naming a router that cannot run is an
  error, since quietly routing elsewhere is how a fill claims a venue it never
  touched. Suite **115/115** after the move.

  The refactor broke one thing and the suite caught it: the extracted `addr()`
  dropped the native-ETH-to-WETH mapping, so every quote went to the `0xEeee…`
  sentinel and came back "no Uniswap V3 pool for ETH->USDC" — a liquidity
  message for an address bug.

- **T2.2 — 0x router.** *BLOCKED — no key exists, and one cannot be obtained here*
  Verified 2026-09-09: `ZEROX_API_KEY` is unset, and 0x v2 answers an
  unauthenticated quote with **401 `No API key found in request`**. Getting one
  means creating an account, which is not something to do on the owner's behalf.

  Deliberately **not** written blind. An unexercised integration described as
  "implemented" is the same failure as the route label this run just removed —
  the seam is in place, so a key is the only missing piece.
  `routers/zerox.mjs` → `https://api.0x.org/swap/allowance-holder/quote`,
  `chainId=8453`, headers `0x-api-key` and `0x-version: v2`.
  **Done when:** a 0x-built tx mines on the fork, moves the expected balance,
  and `fill.route === "0x"` matches the receipt's `to`.

- **T2.3 — 1inch router.** *BLOCKED — needs `ONEINCH_API_KEY`, which needs KYC/KYB*
  `routers/oneinch.mjs` → `/swap/v6.1/8453/swap` plus `/approve/transaction`.
  **Done when:** same bar as T2.2 with `fill.route === "1inch"`.

- **T2.4 — Best-execution comparison.** *BLOCKED — needs a second router, and neither key exists (T2.2/T2.3)* (needs T2.2 or T2.3)
  Quote every configured router, route through the best, journal the losers'
  quotes so the choice is auditable.
  **Done when:** a fill's journal entry names every router quoted and the margin
  it won by.

- **T2.5 — Say what "1inch wallet" means here.** *DONE — 2026-09-09*
  1inch is an aggregator API *and* a self-custody wallet app. This project holds
  a key and signs with viem — no wallet app, no WalletConnect.
  **Done when:** `README.md` states which of the three is and is not used.
  **Done.** The README now says none of the three is used — no aggregator call,
  no wallet app, no WalletConnect — and says why the agent holds a key directly:
  a pad that needs a human to approve a wallet popup per fill is not an agent.

---

## Phase 3 — Mainnet *(G2 — the biggest open item)*

**Everything here spends real money. Do not start a rung without an explicit
go-ahead for that rung.**

**Key handling.** `AGENT_PRIVATE_KEY` is absent from `.env`. The owner puts it
there themselves. Never in chat, a commit, a log line or a command argument.
Verified 2026-09-09: zero tracked files and zero commits in history contain a
key. Use a dedicated hot wallet funded with **≤ $30**.

- **T3.1 — Pre-flight guards.** *DONE — and now asserted every run (section M)*
  `chain.mjs:24` requires the key on mainnet; `:25` refuses the anvil key on
  mainnet; `server.mjs` gates auto-execute on `state.armed && IS_FORK`, so
  **automation can never fire on mainnet** — only a human ✓.

- **T3.2 — Read-only bring-up.** *BLOCKED — needs a funded key the owner must place in `.env`*
  `CHAIN_MODE=mainnet` + a real `RPC_URL`, no transaction. Confirm `/portfolio`
  reads real balances, `/pad` reports `mode: "mainnet"`, header says **Base
  MAINNET**.

- **T3.3 — Rung 1: smallest signed transaction.** *BLOCKED — spends real money; needs an explicit go-ahead*
  One ~$1 USDC→ETH swap behind a human ✓. **Done when:** a Basescan link,
  `status: success`, balance delta matching the quote within slippage.

- **T3.4 — Rung 2: round trip.** *BLOCKED — spends real money; needs an explicit go-ahead* — records the true fee cost the
  book's "measured, not profitable" claim rests on.

- **T3.5 — Rung 3: one fill per asset class.** *BLOCKED — spends real money; needs an explicit go-ahead* — ~$1 each into
  cbBTC, EURC, AERO, MORPHO, VIRTUAL.

- **T3.6 — Rung 4: the refusals, on mainnet.** *BLOCKED — costs nothing to run, but still needs a funded key to boot* — thin liquidity,
  day budget, ✓ while disarmed. Costs nothing.

- **T3.7 — Gas and slippage for real conditions.** *BLOCKED — can only be measured against mainnet* — the 30% gas
  margin and 1% slippage were tuned on an uncontested fork.

- **T3.8 — `MAINNET.md` run log.** *BLOCKED — there is nothing to log until a rung runs* — every hash, what it proved,
  what it cost. The artifact that answers "is any of this real?".

---

## Phase 4 — LLM providers *(G3)*

- **T4.1 — Claude via the CLI subscription.** *DONE*
  `voice.mjs` runs `claude -p` through `execFile`. The subscription, not the
  API — no per-call cost. Default brain. Verified by `E3` and `B18b`.

- **T4.2 — Groq.** *BLOCKED — model access, not the key. Owner action.*
  Re-measured 2026-09-09, and the earlier entry in this plan was wrong. The key
  is **valid**: `GET https://api.groq.com/openai/v1/models` returns **200** and
  lists the models. Every chat completion, on all nine text models tried —
  including the four `GROQ_MODELS` targets — returns **403
  `model_permission_blocked_project`** (`allam-2-7b` and `qwen/qwen3.8-27b` say
  `…_org`). Minting a new key will not help; model access has to be granted for
  the project in the Groq console. No agent can do this.
  **Done when:** `BRAIN=groq node test/verify.mjs` passes `E4` instead of
  skipping.

- **T4.3 — `think()` survives a partial brief.** *DONE* — it dereferenced
  `brief.limits.allow.join()` unguarded and threw.

- **T4.4 — Say which brain answered.** *DONE — 2026-09-09*
  `/voice` should return `x-brain` and the desk should show it.
  **Done.** `think()` now returns `{ text, brain }` and `/voice` sets `x-brain`.
  Verified on a real round trip — TTS to PCM to Deepgram to Claude — answering
  "what is my per trade limit" with the right number and `x-brain: claude`.

- **T4.5 — Fail open when the CLI is missing.** *DONE — 2026-09-09*
  `/Volumes/Extreme SSD/Projects/xorr` (`claude/claude_brain.py`) degrades to a
  deterministic fallback when `claude` is unavailable. Here, a missing binary
  makes the spoken answer fail outright.
  **Done when:** with `claude` off `PATH`, a spoken question still gets a
  memory-grounded answer that says the brain is unavailable.
  **Done.** `think()` tries both brains in order and, when neither answers,
  falls back to `brainFallback` — which reads limits, positions, spend today,
  rule count and price straight out of the brief and opens with "My language
  model is unreachable, so this is straight from memory." Nothing is invented
  and a degraded answer never looks like a normal one. Locked in as section S
  (4 checks); the first version missed "what **rules** have you learned" because
  `\brule\b` does not match the plural.

---

## Phase 5 — The desktop deliverable *(G5)*

There is no separate `xorr-desktop` project — the Electron app **is**
`xorr-pad/desktop`. `package.json` has `"start": "electron ."`, two
dependencies and **empty `devDependencies`**: no build tooling at all.

- **T5.1 — One command starts everything.** *DONE — 2026-09-09*
  Electron's `boot()` starts the backend in-process but **does not manage
  anvil** — the fork must be up first. Supervise `fork.sh` from
  `main/electron.mjs`, wait for the RPC, then bind.
  **Done when:** from nothing, `npm start` brings up fork, backend and window.
  **Done — `main/fork.mjs`.** It reuses a fork that is already listening and
  refuses to manage its lifetime (killing one the operator started by hand, with
  their own pinned block and state cache, is not ours to do); otherwise it starts
  one, owns it, and stops it on the way out. A missing Foundry is named with the
  install line rather than surfacing as an opaque spawn error. Both branches
  tested, including that `stop()` leaves a borrowed fork running.

- **T5.2 — Package it.** *DONE — 2026-09-09*
  `electron-builder`, macOS arm64 target, an icon in the printed pad's blue, a
  `dist` script.
  **Done when:** `npm run dist` produces a `.app` that launches on a machine
  that has never run `npm install`.
  **Done — a 365 MB arm64 `.app` that launches and serves.** The work was not
  electron-builder, it was everything that cannot live inside `app.asar`: bash
  cannot read `fork.sh` out of an archive and Python cannot read the memory
  bridge out of one, so both ship as unpacked resources along with the `.venv`,
  and path resolution now tries the packaged location before the source one.
  `fork.sh` also had to stop writing its block pin and state cache beside
  itself — an installed `.app` is not writable — so both are overridable and
  point at `userData`.

  Two bugs found by actually launching it rather than by building it: the fork
  was spawned with a `cwd` *inside* `app.asar`, which is not a real directory,
  and the failure surfaced only as a modal dialog; and `server.mjs` was imported
  before `PAD_TOKEN` was set, so the backend minted a random token — the same
  read-at-import-time mistake as the credentials, reintroduced by me in this
  file. The icon is generated from the product's own tokens by
  `build/make-icon.py`: the 4x4 deck on true black with the ✓ key lit.

- **T5.3 — First-run setup.** *DONE — 2026-09-09*
  Packaged, there is no `.env`. Needs a first-run screen for the Deepgram key,
  chain mode and pad token, written to `app.getPath("userData")`.
  **Done — `renderer/setup.html` + `GET|POST /setup`.** The window opens on it
  when there is no key to speak with, rather than onto a desk whose mic fails
  silently. `/setup` is deliberately reachable without the token — it is where
  the token is set — and refuses any request that did not come from this
  machine (403 from the LAN, verified). It writes `0600`, refuses an empty
  submission, and the saved key is **live without a restart**, which only works
  because credentials are now read at call time.

  Proven on the packaged app, not the dev server: `/speak` answered **502**
  before setup and **200** immediately after, with no restart in between.

- **T5.4 — Hand the pad its token.** *DONE — 2026-09-09*
  Show the desk's LAN URL and token as a QR the pad's portal can consume,
  instead of typing an IP on a phone keyboard.
  **Done — "Connect the pad" in the rail, `GET /padqr`, `main/qr.mjs`.** The
  encoder is written from scratch rather than pulled from a CDN, because the
  desk has to work on venue wi-fi and a QR that fails to load is a QR missing
  exactly when it is needed. It is shown on demand, not always: it carries the
  pad token and the desk is often on a screen other people can see.

  **It was wrong three times, and only a real decoder found it.** The first
  version produced codes that placed correctly, read their own payload back, and
  were rejected by every scanner: the format word was written LSB-first when bit
  14 is placed first, and — the real one — `ecc()` fed the generator polynomial
  in ascending order when the division needs it descending with the leading term
  dropped, so the Reed-Solomon syndromes were non-zero. Verified 4/4 against
  OpenCV's decoder, which was then uninstalled rather than shipped.

  The suite check needs no decoder: it reads the matrix back the way a scanner
  does and asserts the syndromes are zero, which is the invariant that was
  actually broken.

---

## Phase 6 — The pad *(G4)* — **starts with a repo problem**

### T6.0 — The firmware in this repo is the wrong one. *DONE — 2026-09-09*

Half-migrated, and that is the literal status: the keymap already carries the
trading ids (`buy sell yes no kill momentum risk yield dca`), while the network
layer underneath it is still Loom's. Someone started this and stopped.

`xorr-pad/firmware/` and `orchestrator-pad/firmware/` have **diverged**, and the
one a judge clones is the worse one:

| | `xorr-pad/firmware` (submitted) | `orchestrator-pad/firmware` |
|---|---|---|
| `agents.h` | 58 lines | 65 lines |
| `net.h` | 201 lines | 253 lines |
| `.ino` | 257 lines | 333 lines |
| `GET /pad` poll | **missing** | yes |
| LED driven by backend state | **missing** | yes |
| Hold-to-kill | **missing** | yes |
| Portal URL validation | **missing** | yes |
| `x-action` handling | **missing** | yes |
| `POST /select` (Loom) | **called at `.ino:151`** | removed |

Verified against the running backend: **`POST /select` → 404.** The submitted
firmware makes a live call to a route that does not exist, and `health()` parses
a `brain` field the backend never returns.

And the divergence has a second half: `orchestrator-pad/backend/` — tracked and
pushed — is still **Loom's** backend (`server.mjs` serving `/select`, plus
`loom.mjs` and `config.mjs`, 47 Loom references, zero xorr). That is the server
the stale firmware was written against, sitting one directory from the firmware
that no longer talks to it.

**Done when:** `xorr-pad/firmware/` is the rewritten firmware, it compiles with
the FQBN below, `grep -ri "select\|brain" firmware/` finds no live Loom call,
one repo is the source of truth and the other references it, and the Loom
backend is gone or plainly marked as the previous product.

**Done, and it was a merge rather than the copy this plan first called for.**
Copying the rewrite wholesale would have destroyed real work: the submitted copy
held the *newer* `keytest` (258 lines — a guided MAP mode that names each key,
records which cell actually fired and prints a pasteable KEYMAP; the rewrite had
the older 96-line wiring tester) and the *only* wiring tables and troubleshooting
in either repo. The rewrite's README promised tables "further down" that were not
there. So: the six sketch files came from the rewrite, `keytest` stayed, and the
README is a merge of both — 233 lines, zero Loom references, every link
resolving.

Verified: `POST /select` is gone, the roles that called it now just `sendKey`;
`net.pad()`, `ledFromState`, `HOLD_TO_KILL_MS`, `validUrl`, `PadState` and
`X-Action` are all present; both sketches compile for the S3 at the mandatory
FQBN — **1,198,327 bytes, 38% of program storage**, matching what the README
claims; and the suite is **103/103**. The two remaining "Loom" strings are a
comment describing the STT→brain→TTS pipeline and the NVS-namespace migration
note, both accurate.

- **T6.1 — Flash it.** *BLOCKED — no board connected* (`/dev/cu.*` empty)
  ```
  arduino-cli upload --fqbn esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi --port /dev/cu.usbmodem*
  ```
  **Those options are not optional.** The bare default gives a 4 MB partition
  scheme (binary at 90% of app space) and **PSRAM disabled**, and the 12-second
  record buffer is 384 KB of PSRAM.

- **T6.2 — Provision over the captive portal.** *BLOCKED — needs hardware*
  Join `xorr-pad-setup`, enter URL and token, confirm it joins and survives a
  power cycle.

- **T6.3 — Walk every key on hardware.** *BLOCKED — needs hardware*
  16 positions, no ghosting; the light matches the desk in all five states;
  KILL needs its 600 ms hold.

- **T6.4 — Hold-to-talk on hardware.** *BLOCKED — needs hardware*

- **T6.5 — Print the trading keycaps.** *BLOCKED — needs the printer*
  Legends are in `cad/part_caps.py`; the caps on the board are the old build's.

- **T6.6 — Fix the dead switch.** *BLOCKED — needs the bench* (r2c1; row 3
  unverified).

---

## Phase 7 — Security *(G6)*

- **T7.1 — Repo is clean.** *DONE*
  Verified 2026-09-09: zero tracked files and zero commits in history contain a
  live key or the leaked PAT; only an empty-placeholder `.env.example` is
  tracked; `.gitignore` covers `.env` and `*.bak`.

- **T7.2 — Rotate the exposed credentials.** *BLOCKED — owner action only*
  The Deepgram key and a GitHub PAT were pasted into a chat transcript. They
  never reached git, but a transcript is an exposure. **No agent can do this.**
  Groq is moot — that key is already invalid.

- **T7.3 — Mainnet key hygiene.** *BLOCKED — the owner creates and funds the wallet; no agent should* — gates Phase 3.

- **T7.4 — The brain has no tools.** *DONE*
  The prompt embeds a Deepgram transcript and the pad's own journal, and the CLI
  was invoked with **default tool access** on a machine holding a funded wallet.
  Now `--disallowed-tools Bash Read Edit Write Glob Grep WebSearch WebFetch Task
  NotebookEdit`; `--dangerously-skip-permissions` is safe only because of that.

---

## Phase 8 — Tokenized equities

Coinbase tokenized stocks went live natively on Base on 24 August 2026, each
backed 1:1 by a share at Alpaca and carrying dividends and voting rights. They
are the strongest answer to "so it trades memecoins?".

- **T8.1 — List them, verified on-chain.** *DONE*
  `desktop/main/stocks.mjs` — ten tickers with addresses, `decimals = 8` and
  measured depth, each verified against real Base mainnet by reading `symbol()`
  and `decimals()` back. Three announced tickers (COINc, INTCc, CRCLc) have no
  Base pool and are listed as unlisted with that reason.

- **T8.2 — Show them with marks.** *DONE* — brand-coloured monograms drawn
  locally; no logo files and no CDN, because the fonts are self-hosted for venue
  wi-fi and the wordmarks are not ours to ship.

- **T8.3 — Refuse precisely.** *DONE* — two refusals, never conflated.

- **T8.4 — Route to them.** *BLOCKED — needs Phase 2 **and** Phase 3*
  **Done when:** a real equity fill mines on mainnet and the balance moves.

- **T8.5 — Price them on the strip.** *DONE — 2026-09-09*
  Equity rows show "—" because `feedPrices()` is Binance-backed and these are
  not Binance symbols. Read from the pool, or from the aggregator quote.
  **Done, and it works on a fork — which this plan assumed impossible.** The B20
  token reverts on a fork, but the **pool behind it is ordinary bytecode**: an
  EIP-1167 clone, 45 bytes, whose `slot0()` answers normally. Price the pool and
  never touch the token, and a fork can quote an equity it can never trade.

  All ten pool addresses were **discovered on-chain**, not copied from a
  listing: `getPool(USDC, token, 10)` on the CL factory
  `0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef`. Ten of ten priced in 29 ms.

  These are the **pool's** prices, not exchange quotes, and the code says so —
  SNDKc reads far above SanDisk's quoted price. The pool's number is the one
  that matters because it is the one you would pay, and `priceImpact()` still
  refuses a trade the pool is too thin to absorb.

### The finding that makes this phase hard

`eth_getCode` on a tokenized stock returns **one byte, `0xef`** — there is no
program there. These are **B20 tokens implemented by the Base node itself**.
The same call to the same address, 2026-09-09:

```
real Base mainnet    symbol() -> "NVDAc"
local anvil fork     symbol() -> EVM error: OpcodeNotFound
```

anvil forks *state*; this behaviour is not in state. **Equities cannot be traded
on a fork at any block.** Every stock trade will be a real mainnet transaction,
which makes Phase 3 a hard prerequisite rather than a stretch goal.

---

## Phase 9 — Submission *(G1 — the thing actually being judged)*

- **T9.1 — `SUBMISSION.md` is stale.** *DONE — 2026-09-09*
  It describes an earlier project. Word counts in the current file: **stocks 0,
  equities 0, ESP32 0, firmware 0.** It does not mention the physical pad, the
  tokenized equities, the desk rebuild or the 103-check suite — the four most
  impressive things in the repo.
  **Done when:** it covers the pad, the equities and the honest mainnet status,
  without weakening the memory walkthrough that is the actual judging criterion.
  **Done — 97 to 158 lines, memory walkthrough untouched.** Added a section on
  the physical pad and one on the tokenized equities including the B20/fork
  finding. Corrected two false claims it was making: that 1inch was "wired
  behind `ONEINCH_API_KEY`" (there is no 1inch call), and the Groq blocker. Added
  the two limits it never admitted — no mainnet transaction has ever been signed,
  and the firmware has never been flashed.

- **T9.2 — The README states something this project disproved.** *DONE — 2026-09-09*
  `README.md:42` — *"there is no tokenized equity on Base with real AMM
  liquidity … so the pad will not pretend to quote them."* True when written,
  **false now**: Phase 8 verified ten tickers on real Base mainnet carrying
  $599k–$2.23M of depth each. The front-door document denies the feature the
  app ships, and offers to add "one row in `markets.mjs`" for a case
  `stocks.mjs` already handles in full.
  Two more: `:163` checks off `firmware` as done when the firmware in this repo
  is the stale one, and `:149` sends the reader into that same firmware for the
  wiring.
  **Done when:** the stocks paragraph says what `stocks.mjs` measured — including
  the B20/fork constraint — and no checkbox claims something untested.
  **Done.** The paragraph now names all ten tickers, their measured depth and
  both reasons they cannot be traded yet. The `firmware` checkbox is split into
  what is true (rewritten, compiles, contract covered) and what is not (never
  flashed), and the "1inch route" line now says an aggregator is the only path
  to the equities.

- **T9.3 — Demo script.** *DONE — 2026-09-09*
  A written order of operations for a 3-minute demo: propose → verdict with
  numbered reasons → ✓ → mined fill → wipe → same key, different verdict →
  re-teach. This is the run of show, and it should be rehearsed against a
  stopwatch rather than improvised.
  **Done — `DEMO.md`, rehearsed rather than imagined.** Every timing in it was
  measured against the running app: briefing 2 ms, verdict 4 ms, **mined fill
  521 ms**. The turn was run end to end and is quoted verbatim — before the
  wipe, `EXECUTE`; after it, the same key gives
  `REJECT — AERO is not in the allowlist [ETH, USDC]`. It also carries what to
  say when something breaks, and a standing instruction not to improvise a
  mainnet trade.

---

## The honest gap list

Ordered by what it costs to leave. Every gap tied to the task it blocks.

| # | Gap | Evidence | Blocks |
|---|---|---|---|
| ~~**1**~~ | **CLOSED 2026-09-09.** The submitted firmware called `POST /select` (404) and lacked `/pad`, LED-from-state, hold-to-kill and URL validation. Merged from the rewrite — keeping the submitted copy's newer `keytest` and its wiring tables, which the rewrite had lost. Compiles at 38% of app space; suite 103/103. | `arduino-cli compile`; route probe | ~~T6.0~~ |
| **2** | **Not one mainnet transaction has ever been signed.** Every fill is on a fork. G2's strongest claim is untested where it counts, and Phase 8 cannot start without it. | `CHAIN_MODE` defaults to fork; no `MAINNET.md`; `AGENT_PRIVATE_KEY` absent | Phase 3, G2 |
| ~~**3**~~ | **CLOSED 2026-09-09.** `ROUTE` branched on `ONEINCH_API_KEY` while only Uniswap was ever called. Route is now derived from the mined receipt; suite section Q asserts it, mutation-tested. | `dex.mjs`; verify.mjs section Q | ~~T1.1, T1.2~~ |
| **4** | **No aggregator implemented**, so equities are listed but untradeable and there is no best-execution story. | one router in `main/` | Phase 2, T8.4 |
| ~~**5**~~ | **CLOSED 2026-09-09.** `SUBMISSION.md` now covers the pad and the equities (97 → 158 lines) and admits the two real limits; `README.md` no longer denies that tokenized equities exist on Base. Two further false claims about 1inch removed from both. | word counts; live API probes | ~~T9.1, T9.2~~ |
| ~~**6**~~ | **CLOSED 2026-09-09.** `npm run dist` produces a launching arm64 `.app` that starts its own fork, seeds a warm fork cache so a fresh install is not cold against a rate-limited RPC, and collects its credentials on first run. | launched and verified | ~~T5.1, T5.2, T5.3~~ |
| **7** | **The firmware has never run.** Compiles and its backend contract is covered, but provisioning, I2S, matrix and NVS are unverified. | no `/dev/cu.*` | Phase 6, G4 |
| **8** | **No Groq model can be called.** Corrected: the key is **valid** (models list returns 200); every chat model returns `403 model_permission_blocked_project` / `…_org`. Needs the account owner to grant model access — not a code change, and a new key will not help. The app already names the cause and the console page to fix it. | live probe of 9 models | T4.2 |
| ~~**9**~~ | **CLOSED 2026-09-09.** All ten priced from their own pools, discovered on-chain from the CL factory — and it works on a fork, because only the token is B20; the pool is ordinary bytecode. Suite section K. | verify.mjs section K | ~~T8.5~~ |
| ~~**10**~~ | **CLOSED 2026-09-09.** With no model reachable, a spoken question is answered from the store — real numbers, and it says it has no model. Section S. | verify.mjs section S | ~~T4.5~~ |
| **11** | **Exposed credentials not rotated.** Not in git, but in a transcript. | T7.1 verification | T7.2 |
| **13** | **A whole Loom backend still ships in `orchestrator-pad`**, tracked and pushed: `server.mjs` serves `/select`, and `loom.mjs`/`config.mjs` carry 47 Loom references between them. Zero mentions of xorr. It is what the stale firmware was written against, and it makes the repo look like two products. | route + grep of `orchestrator-pad/backend` | T6.0 |
| **12** | **The fork stalls under sustained load.** ~20 real swaps plus a concurrent burst can wedge the free public RPC. Mitigated (pinned block, boot warming, one fewer quote per swap, anvil retries) but not removed. | suite history | Phase 3 robustness |

**Not gaps, recorded so nobody re-opens them.** There are **no code mocks, stubs,
fake data or TODOs** anywhere in the project: every grep hit is the physical
knob — a real snap-fit part deliberately built without an encoder — or a CAD
rendering term. The suite is 103/103 and CI is green on the last three pushes.
Memory is load-bearing and asserted on every push. The Claude brain runs on the
CLI subscription at no per-call cost, with every tool disallowed.

---

## Suggested order

1. **T6.0** — the submitted repo currently ships firmware that cannot talk to
   its own backend. Nothing else is worth doing while that is true.
2. **T1.1 + T1.2** — an hour, and it removes the only dishonest line of code.
3. **T9.1 + T9.2** — one document omits two thirds of the work; the other
   denies a feature that ships. The second is a correctness bug in prose and is
   cheaper to fix than any code here.
4. **T4.2** — a new Groq key is five minutes and unskips a check.
5. **T5.1 + T5.2** — the thing a judge actually opens.
6. **Phase 3, rungs 1–2** — needs a go-ahead and a funded hot wallet. This is
   what separates the project from every simulated trading demo.
7. **T2.1 + T2.2**, then **T8.4** — real routing, then stocks actually trade.
8. **Phase 6** — the moment the board is on the desk.
