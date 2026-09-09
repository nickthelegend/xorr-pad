# xorr-pad — build plan

**An AI agent that trades on your desk.** An Electron desk app, a backend that
signs real transactions on Base, and a physical ESP32-S3 macropad that drives
the same gate.

Any single task below can be picked up cold and executed without reading
anything else. Status tags: **DONE** · **IN PROGRESS** · **NOT STARTED** ·
**BLOCKED**.

Audited against the running code on **2026-09-09**, then **executed the same
day** — every status below was re-checked after the work, not remembered. Where
this contradicts an older doc, this is right and the other doc is a gap.

**Execution pass, 2026-09-09.** Phases 3, 4 and 5 are closed. Phases 1 and 2 are
untouched and blocked on things no agent can supply: real money, and a board on
the desk. Five of the eleven gaps are closed; one is met but not eliminated. The
task-by-task detail is in place below.

---

## 1. What "done" and "winning" mean for this project

This is a **Sibyl hackathon** entry. The sponsor's technology is a memory store,
so the judged question is not "does it trade" but **"is the memory doing real
work"**. That shapes every goal below.

**G1 — Memory is load-bearing, provably.** Delete the store and the same
keypress produces a different, worse decision. Not "we use a database" — the
verdict visibly changes and the app says what it forgot.
*Met. `decide()` is built only from `recallBrief()`; asserted by
`desktop/test/loadbearing.test.mjs` on every push.*

**G2 — Every fill is real.** Real contracts, real signed transactions, real
mined receipts, real balance movement. A fork is acceptable; a simulation is
not. *Met on a Base mainnet fork. **Never attempted on mainnet** — the largest
remaining item.*

**G3 — It refuses out loud, with its working shown.** Verdicts arrive with
numbered reasons drawn from memory. Refusals — thin liquidity, day budget spent,
a learned rule, an unrecognised spoken ticker, a stock that cannot exist on a
fork — are the product's voice, not error handling. *Met.*

**G4 — The physical pad works in front of a judge.** Provisioned over its own
captive portal, on venue Wi-Fi, driving the backend, speaking. A pad that only
works in a screenshot loses to one on the table. *Firmware written and
compiling; **never flashed**.*

**G5 — One command starts it.** A judge should not need `anvil` in one terminal
and `node` in another. *Met — `npm start` brings up fork, backend and window;
`npm run dist` produces a launching `.app`.*

**G6 — Nothing about it is fake.** No mocks, no stubs, no fallback data, no
route label that lies about how a fill happened. *Met — see "Not gaps".*

**Winning, specifically.** Most entries will *store* things in Sibyl. This one
**derives** from it: it mines rules out of its own journal, surfaces rules that
can never fire, archives what nothing needs rather than deleting it, replays
what it knew at a past timestamp, and distinguishes "no record" from "never
knew" via `VerdictCode`. The demo's centrepiece is deleting the store and
pressing the same key.

---

## 2. Where it actually is

| | Status |
|---|---|
| `desktop/test/verify.mjs` | **145 passed, 0 failed, 1 skipped** |
| `loadbearing.test.mjs` | PASS — 3 of 4 verdicts change on a wipe |
| CI (`.github/workflows/memory.yml`) | green, last 3 runs |
| Browser QA (`BROWSERPLAN.md`) | **68 of 68 PASS** |
| Mocks / stubs / fallback data in code | **zero** — see "Not gaps" |
| Real fills on a Base fork | yes, through two routers with best execution |
| Real fills on **mainnet** | **never attempted** |
| Aggregator | **KyberSwap, live, no API key** |
| Tokenized equities | listed, priced from their own pools, honestly refused |
| Firmware | compiles at 38% of app space; **never flashed** |
| Demo rehearsal | **twice, end to end** — 17.0 s and 16.8 s, the turn landed both times |
| Sustained load | **30 swaps, 0 failed, 39.2 s**, slowest single swap 3.4 s |
| Desktop packaging | `.app` builds and launches |

---

## Phase 1 — Mainnet *(G2 — the largest open item)*

**Everything here spends real money. Do not start a rung without an explicit
go-ahead for that rung.**

**Key handling.** `AGENT_PRIVATE_KEY` in `.env` is a throwaway used only for the
fork. Mainnet needs a **separate, funded** key the owner places themselves —
never in chat, a commit, a log line or a command argument. Use a dedicated hot
wallet funded with **≤ $30**.

- **T1.1 — Pre-flight guards.** *DONE, and asserted every run (suite section M)*
  `chain.mjs` refuses the anvil key on mainnet; mainnet with no key is
  **read-only** with `wallet === null`; `server.mjs` gates auto-execute on
  `state.armed && IS_FORK`, so **automation can never fire on mainnet**; a
  confirm on a read-only chain is refused *before* the balance check.

- **T1.2 — Read-only bring-up.** *DONE — and it needs no key*
  Verified against real Base mainnet: head read, `NVDAc.symbol()` returns
  `"NVDAc"` where a fork reverts, `/pad` reports `mode: "mainnet"` with a live
  ETH price, and a ✓ is refused naming the missing key.

- **T1.3 — Rung 1: the smallest signed transaction.** *BLOCKED — spends real money*
  One ~$1 USDC→ETH swap behind a human ✓.
  **Done when:** a Basescan link, `status: success`, and a balance delta
  matching the quote within slippage.

- **T1.4 — Rung 2: a round trip.** *BLOCKED — spends real money*
  Buy then sell the same ~$1. **Done when:** the true fee cost is recorded —
  the number the book's "measured, not profitable" claim rests on.

- **T1.5 — Rung 3: one fill per asset class.** *BLOCKED — spends real money*
  ~$1 each into cbBTC, EURC, AERO, MORPHO, VIRTUAL.

- **T1.6 — Rung 4: an equity fill.** *BLOCKED — spends real money*
  The route exists (KyberSwap reaches `aerodrome-cl`); a B20 token cannot exist
  on a fork at any block, so this is the one feature that **cannot** be
  demonstrated without mainnet. **Done when:** a real equity fill mines and the
  balance moves.

- **T1.7 — Gas and slippage for real conditions.** *BLOCKED — measurable only on mainnet*
  The 30% gas margin and 1% slippage were tuned on an uncontested fork.

- **T1.8 — `MAINNET.md` run log.** *BLOCKED — nothing to log until a rung runs*
  Every hash, what it proved, what it cost. The artifact that answers "is any of
  this real?".

## Phase 2 — The physical pad *(G4)*

- **T2.1 — Flash it.** *BLOCKED — no board attached (`/dev/cu.usb*` empty)*
  ```
  arduino-cli upload --fqbn esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi --port /dev/cu.usbmodem*
  ```
  **Those options are not optional.** The bare default gives a 4 MB partition
  scheme (binary at 90% of app space) and **PSRAM disabled** — and the
  12-second record buffer is 384 KB of PSRAM.

- **T2.2 — Provision over the captive portal.** *BLOCKED — needs hardware*
  Join `xorr-pad-setup`, enter URL and token, confirm it joins and survives a
  power cycle. `Provision::validUrl` is already unit-tested (15 cases).

- **T2.3 — Walk every key on hardware.** *BLOCKED — needs hardware*
  16 positions, no ghosting; the light matches the desk in all five states;
  KILL needs its 600 ms hold.

- **T2.4 — Hold-to-talk on hardware.** *BLOCKED — needs hardware*
  I2S capture to PSRAM, `POST /voice`, amp playback of the returned PCM.

- **T2.5 — Print the trading keycaps.** *BLOCKED — needs the printer*
  Legends are in `cad/part_caps.py`; the caps on the board are the old build's.

- **T2.6 — Fix the dead switch.** *BLOCKED — needs the bench*
  r2c1; row 3 unverified. `firmware/keytest` has a guided MAP mode that prints a
  pasteable KEYMAP, so a scrambled matrix is fixed in software.

## Phase 3 — Deeper Sibyl integration *(G1 — the judged axis)*

The store is used broadly across the four writable tiers. These are the
remaining places where going deeper strengthens the product rather than
decorating it.

- **T3.1 — Retire the dead `Memory` surface, or use it.** *DONE*
  Of the seven, two became real features — `listArchived` (T3.2, T3.4) and
  `setEntityStatus` (T3.3) — and five were removed with the reason recorded in
  the file: `getState`, `getReference`, `listEntities` and `searchEntities` were
  each redundant against `recallBrief()` / `fullStore()` / `searchTiers()`, and
  `deleteEntity` has no caller because **nothing deletes an entity any more** —
  closing a position archives it. `listArchived` also turned out to be hiding a
  real defect: it took a bare positional number where every sibling takes an
  options object, so calling it the way its siblings are called threw a
  `TypeError` out of the bridge. It now takes either, asserted by W1.

- **T3.2 — Show archived positions in the UI.** *DONE — and the plan overstated
  the gap, corrected here.* The archive was **already rendered**; what it was
  not was legible — one terse line per row, mixed in with retired rules under a
  single `archived — N` heading. Closed positions now get their own block ahead
  of the general archive, with quantity and entry formatted like every other
  number on the desk and a local-time close stamp. Verified in the running app.

- **T3.3 — `set_entity_status` for rule lifecycle.** *DONE*
  Accepting a rule writes `active` and rejecting writes `rejected` to **Sibyl's
  own status column**, not a flag inside the rule's JSON, and the store browser
  renders the badge. A rule the store holds but does not enforce no longer looks
  identical to one that is live. The body flag stays because `recallBrief()`
  filters on it; the status column is the truth the UI reads.

- **T3.4 — Let the spoken brain reach the archive.** *DONE — and the mechanism
  is not the one this task assumed.* `search_entities` would not have fixed it:
  `archived_entities` is a **separate table and is not in Sibyl's FTS index**, so
  no search of the tiers can reach it. Asked "have I ever held AERO?" with
  nothing open, the brain answered "no record" while the store held exactly that
  record. `recallHistory()` now reads the archive directly and matches on the
  **question's own words** rather than the alias table — so a position whose
  symbol is no longer a configured market is still recallable, which is the
  history an archive exists to keep. `VerdictCode` still separates `EMPTY_STORE`
  from `NO_MATCH` on the journal path. Suite section W, four checks, including a
  live brain round trip.

- **T3.5 — Multi-tenant.** *NOT STARTED, and should probably stay that way*
  `set_tenant` is not in the bridge. One pad, one operator — adding tenancy
  would be using the sponsor's API to look busy. Recorded so nobody re-opens it.

- **T3.6 — `lint()` / `Linter`.** *BLOCKED — paid tier*
  Not in the bridge, tier-gated, never called.

## Phase 4 — Documentation truth *(G6)*

Docs drift faster than code here, and two are now actively wrong.

- **T4.1 — `SIBYL-AUDIT.md` is stale.** *DONE*
  Its "Not used" table lists as **MISSING**: `archive_entity`,
  `search_entities`, `read_events(since/until)`, `set_entity(status)`,
  `VerdictCode`/`explain`, and the MCP server. **All six now ship** —
  `archiveEntity` runs when a position closes, `eventsBetween` drives decay,
  `VerdictCode` is read in `voice.mjs` (`EMPTY_STORE` vs `NO_MATCH`), and
  `.mcp.json` wires the MCP server, which the suite exercises. Its "honest
  weakness" #2 (hard-deleting positions) and #3 (MCP unwired) are both fixed.
  The "Not used" table is now split into *"Since first written — six of these
  now ship"* and *"Still not used"*, and the two fixed weaknesses are marked
  fixed rather than quietly deleted, so the document reads as a record that was
  corrected instead of one that was always right.

- **T4.2 — `TESTPLAN.md` and `PADPLAN.md` predate the current suite.** *DONE*
  Both now carry a dated header naming the run they describe, rather than being
  rewritten to look current. They are records of specific past runs and say so;
  the live number is in §2 of this file and in the suite's own output.

- **T4.3 — Keep `README.md` and `SUBMISSION.md` in step.** *DONE — re-verified this audit*
  Both name KyberSwap accurately, neither claims 1inch is integrated, and the
  equities section matches `stocks.mjs`.

- **T4.4 — Demo script.** *DONE — `DEMO.md`*
  Rehearsed twice against the running app. Every beat's timing is measured and
  tabulated, including the one that can overrun its slot: the spoken round trip
  takes **13.5–14.0 s** against a 20-second beat, and the script now warns about
  that in place of a guess.

## Phase 5 — Robustness before a live demo

- **T5.1 — The fork stalls under sustained load.** *DONE — bar met, cause not
  eliminated.*
  ~20 real swaps plus a concurrent burst can wedge the free public RPC: anvil
  hits the limiter, backs off, and stops answering any read needing an upstream
  fetch. Mitigated (pinned block, shipped warm state cache, boot warming, one
  fewer quote per swap, anvil retries) but **not removed** — it recurred twice
  during this session's testing.
  **The bar is met:** a 30-swap run finished **30 ok / 0 failed in 39.2 s**,
  slowest single swap 3,394 ms, no stall. Read honestly, that is the bar this
  task set, not proof the wedge is gone — it was met on a **warm fork against a
  pinned block**, which is exactly the demo's condition and exactly why the
  mitigations work. A cold fork on a contested public RPC can still wedge. The
  real fix is a credential, and it is T5.2.

- **T5.2 — A keyed RPC endpoint.** *NOT STARTED — needs a credential*
  The single highest-leverage fix for T5.1. `FORK_RPC` already overrides the
  upstream in `fork.sh`, so this is a credential, not a code change.
  **Done when:** `FORK_RPC` points at a keyed endpoint and T5.1's run passes.

- **T5.3 — Rehearse the demo end to end, twice.** *DONE*
  Two consecutive clean runs against the running app, wipe and re-teach
  included: **17.0 s** and **16.8 s** of machine time, and **the turn landed
  both times** — the same BUY going `EXECUTE → REJECT` across the wipe. Per-beat
  numbers are in `DEMO.md`.

## Phase 6 — Credentials and hygiene *(G6)*

- **T6.1 — The repo is clean.** *DONE — re-verified this audit*
  Zero tracked files and zero commits contain a live key; only an
  empty-placeholder `.env.example` is tracked; `.gitignore` covers `.env`,
  `*.bak`, `dist/` and the fork state.

- **T6.2 — Rotate the exposed credentials.** *BLOCKED — owner action only*
  A Deepgram key and a GitHub PAT were pasted into a chat transcript. They never
  reached git, but a transcript is an exposure. **No agent can do this.**

- **T6.3 — Groq model access.** *BLOCKED — account owner, not a code fault*
  The key is **valid** (`GET /v1/models` returns 200). Every chat model returns
  `403 model_permission_blocked_project`. The suite measures this and reports a
  skip rather than asserting it. A new key will not help; model access has to be
  granted in the Groq console.

- **T6.4 — The brain has no tools.** *DONE*
  `claude -p` is invoked with `--disallowed-tools Bash Read Edit Write Glob Grep
  WebSearch WebFetch Task NotebookEdit`. The prompt embeds a speech transcript
  and the pad's own journal, on a machine holding a funded wallet —
  `--dangerously-skip-permissions` is safe only because of that.

- **T6.5 — Mainnet key hygiene.** *BLOCKED — the owner creates and funds it*
  Gates Phase 1.

---

## The honest gap list

Ordered by what it costs to leave. Every gap tied to the task it blocks.
**Five of the original eleven were closed on 2026-09-09; they are listed below
the open ones rather than deleted, so this file records what moved.**

### Still open

| # | Gap | Evidence | Blocks |
|---|---|---|---|
| **G1** | **Not one mainnet transaction has ever been signed.** Every fill is on a fork. G2's strongest claim is untested where it counts, and the tokenized equities — the most distinctive feature here — cannot be demonstrated at all without it, because a B20 token does not exist on a fork at any block. | no `MAINNET.md`; `CHAIN_MODE` defaults to fork | Phase 1 |
| **G2** | **The firmware has never run.** It compiles at 38% of app space, is byte-identical to the `orchestrator-pad` copy, and its backend contract is covered by suite section P — but provisioning, I2S capture, amp playback, matrix scanning and NVS persistence are all unverified. | no `/dev/cu.usb*` | T2.1–T2.4 |
| **G3** | **The fork can still wedge on a cold start.** *Downgraded, not closed.* 30 consecutive swaps now run clean in 39.2 s, so the demo's condition is covered — but that was a warm fork on a pinned block. A cold fork against a contested free public RPC has no such guarantee, and the honest fix is a keyed endpoint. | 30/30 pass warm; two wedges earlier in the session | T5.2 |
| **G8** | **No Groq model can be called.** The key is valid; every model returns `403 model_permission_blocked_project`. Account-owner action; the app already names the cause and the console page that fixes it. | live probe of 9 models | T6.3 |
| **G9** | **The trading keycaps are unprinted**, the board carries the previous build's caps, one switch (r2c1) is dead and row 3 is unverified. | `cad/part_caps.py` | T2.5, T2.6 |
| **G10** | **Exposed credentials not rotated.** Not in git, but in a transcript. | T6.1 verification | T6.2 |

### Closed on 2026-09-09

| # | Gap | How it was closed |
|---|---|---|
| **G4** | `SIBYL-AUDIT.md` understated the integration | Table split into what now ships and what still does not; both named weaknesses marked fixed. **T4.1** |
| **G5** | Seven `Memory` methods were dead | Two became features, five removed with the reason recorded — and one of them was hiding a live `TypeError`. **T3.1** |
| **G6** | Archived positions stored and not shown | They *were* rendered, just illegibly; closed positions now have their own block, and — the real defect — the **spoken brain could not reach the archive at all**, because it sits outside Sibyl's FTS index. **T3.2, T3.4** |
| **G7** | The demo had never been rehearsed end to end | Twice, 17.0 s and 16.8 s, the turn landing both times. **T5.3** |
| **G11** | `TESTPLAN.md` / `PADPLAN.md` described an older run | Both dated and scoped to the run they describe. **T4.2** |

### Not gaps — recorded so nobody re-opens them

- **There are no mocks, stubs, fakes, TODOs, fixtures or canned data anywhere.**
  A whole-repo grep over every tracked non-binary file returns three code hits,
  all benign: a comment noting the pad's knob is a real printed part with no
  encoder, a comment in `voice.mjs` that literally reads *"Not a mock and not an
  invention"*, and a CSS `::placeholder` selector.
- **The knob is a deliberate hardware simplification**, not an unfinished part —
  a real snap-fit component with no potentiometer, documented in `SPEC.md`.
  This build is hold-to-talk.
- **The two firmware copies are in sync** — all six sketch files byte-identical
  to `orchestrator-pad`.
- **`learn()` is blocked, not faked.** It is called, its real `TierGateError` is
  surfaced, and journal-mined reflection ships instead.
- **Multi-tenancy and `lint()` are deliberately absent** (T3.5, T3.6).
- **The route a fill reports cannot lie** — it is read off the mined receipt's
  `to`, and the suite asserts it by mutation.

---

## What is left

Everything an agent could close on this machine is closed. What remains needs
money, hardware, or an account the owner controls.

1. **T5.2** — a keyed RPC endpoint. One credential, and G3 goes away rather than
   being merely survivable. The code already reads `FORK_RPC`.
2. **T6.2, T6.5** — rotate the exposed credentials; create and fund the mainnet
   hot wallet (**≤ $30**, placed in `.env` by the owner, never pasted anywhere).
   T6.5 gates all of Phase 1.
3. **Phase 1, rungs 1–2** — the ~$1 swap and the round trip. Needs an explicit
   go-ahead per rung. This is what separates the project from every simulated
   trading demo, and it is the largest remaining item in the whole plan.
4. **T1.6** — the equity fill, once mainnet is proven. The most distinctive thing
   here and the only one that **cannot** be shown on a fork at any block.
5. **Phase 2** — the moment a board is on the desk. T2.1's flash options are not
   optional; the default FQBN gives a 4 MB scheme and no PSRAM, and the record
   buffer is 384 KB of PSRAM.
6. **T6.3** — grant model access in the Groq console. Not a code fault, and the
   app already reports it accurately.
