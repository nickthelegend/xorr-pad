# xorr-pad — build plan

**An AI agent that trades on your desk.**

A builder agent should be able to pick any single task below and execute it
without reading anything else first. Every task names the file it touches and
how you know it is done. Status tags: **DONE** · **IN PROGRESS** ·
**NOT STARTED** · **BLOCKED**.

Audited against the code on 2026-09-08, not against the README.

---

## 1. What "done" and "winning" mean here

This is a Sibyl Labs hackathon entry (hack.sibyllabs.org, slot 0x0D), judged
**40% on whether memory is load-bearing**, with Builder Score raised by the
**Base** and **Virtuals** partner stacks.

**Done** means all five of these hold at once:

1. **A physical keypress on the pad moves real money on Base.** Not a
   simulation: a signed transaction, a mined receipt, a balance that changed.
2. **Deleting the memory demonstrably changes the trade.** Not a slogan — the
   same signals, run with and without the store, produce different verdicts,
   asserted by a test that fails if they ever converge.
3. **Every number on screen can be traced to where it came from.** A verdict
   shows the remembered facts it rests on; a market shows its measured
   liquidity; a strategy shows its t-statistic.
4. **A judge can run it.** Clone, three commands, working app — without the
   operator present and without hitting the failure modes we already found.
5. **The honest facts stay in.** The negative performance result, the blocked
   credential, the delisted market, the dead switch. Removing them to look
   better is a failure condition, not a polish step.

**Winning** additionally means: the memory story is the *demo*, not a feature
list; the pad is visibly a real object that was actually built; and nothing in
the repo contradicts the product being pitched.

**Explicit non-goals.** Profitability (the ported edges are measured and do not
pay for their fees — that stays stated). Real-mainnet autonomous trading. A
hosted multi-user service. Showing xorr-eth, which is a separate product.

---

## 2. Phases

### Phase A — The trading core  ·  DONE

| Task | Status | Where |
|---|---|---|
| A1 Base client, fork/mainnet modes, key guards | **DONE** | `desktop/main/chain.mjs` |
| A2 Token + market registry with measured liquidity | **DONE** | `desktop/main/markets.mjs`, `tokens.mjs` |
| A3 Uniswap V3 quote + swap, real signed fills | **DONE** | `desktop/main/dex.mjs` |
| A4 Price-impact gate, fails closed when unmeasurable | **DONE** | `dex.mjs: priceImpact()` |
| A5 Balance guard + over-size clamp | **DONE** | `dex.mjs: spendable()`, `server.mjs` yes-path |
| A6 Receipt waits that fail readably, never hang | **DONE** | `dex.mjs: mined()` |
| A7 Market data: real hourly OHLCV per market | **DONE** | `desktop/main/candles.mjs` |

### Phase B — Memory, the judged 40%  ·  DONE

| Task | Status | Where |
|---|---|---|
| B1 Sibyl sidecar over stdio JSON | **DONE** | `desktop/memory/sibyl_bridge.py` |
| B2 Node client, no in-memory fallback by design | **DONE** | `desktop/main/memory.mjs` |
| B3 Schema: limits, positions, rules, baton, journal | **DONE** | `sibyl_bridge.py: recall_brief` |
| B4 `decide()` built only from the recalled brief | **DONE** | `desktop/main/decide.mjs` |
| B5 Memoryless fallback that is strictly *stricter* | **DONE** | `memory.mjs: NO_MEMORY_LIMITS` |
| B6 Wipe that really destroys db + wal + shm | **DONE** | `sibyl_bridge.py: wipe` |
| B7 Wipe voids any outstanding confirmation | **DONE** | `server.mjs: /memory/wipe` |
| B8 Re-teach, so the demo can be run twice | **DONE** | `server.mjs: /memory/seed` |
| B9 Journal-mined rule proposals + accept/reject | **DONE** | `desktop/main/reflect.mjs` |
| B10 Load-bearing proof as an executable test | **DONE** | `desktop/test/loadbearing.test.mjs` |

### Phase C — The strategy book  ·  DONE

| Task | Status | Where |
|---|---|---|
| C1 Port the six measured-edge strategies verbatim | **DONE** | `desktop/main/strategies.mjs` |
| C2 Shared gates: BTC 200-day trend, no falling knives | **DONE** | `strategies.mjs`, `candles.mjs` |
| C3 Scan the book across every market | **DONE** | `desktop/main/scan.mjs` |
| C4 Carry each strategy's provenance to the UI | **DONE** | `strategies.mjs: PROVENANCE` |

### Phase D — The desk app  ·  DONE

| Task | Status | Where |
|---|---|---|
| D1 HTTP surface the pad talks to (19 routes) | **DONE** | `desktop/main/server.mjs` |
| D2 Bearer auth; generate a token when unset | **DONE** | `server.mjs` |
| D3 Electron shell; refuse to open on a port it lost | **DONE** | `desktop/main/electron.mjs` |
| D4 Six-pane readout, every pad key clickable | **DONE** | `desktop/renderer/index.html` |
| D5 Server-side activity log, so pad presses show | **DONE** | `server.mjs: /log` |
| D6 Pending decision survives a refresh | **DONE** | `server.mjs: /pending` |
| D7 Last scan renders whoever ran it | **DONE** | `server.mjs: /scan/last` |
| D8 Committed visual system + DESIGN.md | **DONE** | `DESIGN.md`, `index.html` |

### Phase E — Voice and the brain  ·  IN PROGRESS

| Task | Status | Where |
|---|---|---|
| E1 Deepgram STT + TTS, 16 kHz PCM end to end | **DONE** | `desktop/main/voice.mjs` |
| E2 Spoken orders gated by the same `decide()` | **DONE** | `server.mjs: /voice` |
| E3 Intent parsing incl. tickers and homophones | **DONE** | `voice.mjs: parseIntent` |
| E4 Claude Code CLI as the brain, grounded in memory | **DONE** | `voice.mjs: brainClaude` |
| E5 Groq as the alternate brain | **BLOCKED** | `voice.mjs: brainGroq` — see G1 |

### Phase F — Hardware  ·  IN PROGRESS

| Task | Status | Where |
|---|---|---|
| F1 Parametric CAD, printable, watertight | **DONE** | `cad/` |
| F2 Per-filament print batches + Bambu 3MF | **DONE** | `cad/export_print_batches.py`, `export_3mf.py` |
| F3 Firmware posts key presses to `/key` | **DONE** | `firmware/orchestrator_pad/net.h` |
| F4 Keymap re-indexed to scanned matrix cells | **IN PROGRESS** | `firmware/orchestrator_pad/agents.h` — see G4 |
| F5 Complete the matrix sweep; fix the dead switch | **BLOCKED** | needs the operator at the bench — see G4 |
| F6 Print the trading keycaps and fit them | **NOT STARTED** | `cad/exports/print/` — see G5 |

### Phase G — Verification  ·  DONE

| Task | Status | Where |
|---|---|---|
| G1 Explicit test plan with per-item pass criteria | **DONE** | `TESTPLAN.md` (96 items) |
| G2 End-to-end suite against the live product | **DONE** | `desktop/test/verify.mjs` (74 checks) |
| G3 Load-bearing proof exits non-zero on regression | **DONE** | `desktop/test/loadbearing.test.mjs` |
| G4 Design-slop detector clean across the repo | **DONE** | Impeccable `detect.mjs` |
| G5 Reproducible product screenshots from the real app | **DONE** | `desktop/shots.mjs` |

### Phase H — Submission readiness  ·  NOT STARTED

This is the phase with the most open work. Everything below is a real gap.

| Task | Status | Where |
|---|---|---|
| H1 Delete or quarantine the dead `backend/` tree | **NOT STARTED** | see G2 |
| H2 Rewrite `SPEC.md` for the trading pad | **NOT STARTED** | see G3 |
| H3 Correct `SUBMISSION.md`'s stale test output + CI claim | **NOT STARTED** | see G6, G7 |
| H4 Fix `package.json`'s `fork` script to match `fork.sh` | **NOT STARTED** | see G8 |
| H5 Add CI that runs the load-bearing proof on push | **NOT STARTED** | see G7 |
| H6 Give trade size a real control | **NOT STARTED** | see G9 |
| H7 Let the pad switch markets | **NOT STARTED** | see G10 |
| H8 Record the demo walkthrough | **NOT STARTED** | see G11 |
| H9 Rotate the leaked credentials | **BLOCKED** | operator-only — see G12 |

---

## 3. Gap list

Every gap below was found by reading the code, and each names the task it
blocks. Ordered by how much damage it does to the submission.

### G1 — Groq is blocked at the account level  ·  blocks **E5**
`GROQ_API_KEY` authenticates and lists 14 models, but **every one** returns
`model_permission_blocked_project` or `_org`. This is a switch in the operator's
Groq console (Settings → Model permissions), not a code defect: `brainGroq()`
already walks the models the account exposes and, when all are blocked, names
the setting to change. Claude Code CLI is the brain meanwhile.
**Operator action required. Untestable until then — do not mark it working.**

### G2 — `backend/` is dead code from the pre-pivot product  ·  blocks **H1**
~500 lines describing a *coding-agent* voice backend: a Loom-daemon bridge,
`/select` and `/speak`, "an agent key is a handoff". Nothing in `desktop/`
imports it; the only live reference is `desktop/run-dev.sh` sourcing
`../backend/.env` for credentials. A judge reading the repo finds a whole
backend arguing for the product this one explicitly stopped being.
**Fix:** move the credentials to a top-level `.env`, delete `backend/`, update
`run-dev.sh`. Keep `backend/.env` out of git (it already is).

### G3 — `SPEC.md` documents the old product  ·  blocks **H2**
Opens with *"Open-source ESP32 macropad for orchestrating coding agents: lock a
target agent (Grok / Codex / Claude Code / Antigravity / opencode / Kiro /
Cursor) … a dial that sets model effort low → ultracode."* Every dimension in it
is still correct; every word about what the pad *is* is wrong.
**Fix:** keep the dimensional tables, rewrite the framing and the key table for
the 15-key trading deck.

### G4 — The pad's key mapping is partly guessed  ·  blocks **F4, F5**
`agents.h` marks row 2 cols 0–1 and **all of row 3** as `UNVERIFIED`, and records
`r2c1` as **DEAD — cold joint, never fired**. Row 3 holds `kill`, `mic`, `sell`
and `portfolio`, so the kill switch and the entire voice feature sit on cells
nobody has confirmed.
**Fix:** flash `firmware/keytest`, run the guided MAP mode, paste the emitted
KEYMAP back into `agents.h`. Re-solder the dead joint.
**Needs the operator at the bench.** Mitigation already shipped: every key is
clickable in the desk app.

### G5 — The printed caps are the old legends  ·  blocks **F6**
`cad/partlib.py: key_layout()` is the v8 trading deck, but the pad physically
wears the **LoomPad caps** (CURSOR/CODEX/CLAUDE/…). The colours are bought
(green/red/white filament) and the exports exist; nothing has been printed.
**Fix:** print `exports/print/caps-*.stl` + legends, fit them.

### G6 — `SUBMISSION.md` prints test output that no longer exists  ·  blocks **H3**
The walkthrough shows the *old* load-bearing fixtures (`DEGEN buy $80 →
EXECUTE $80`, `ETH buy $250 → EXECUTE $100 (default)`). The test now runs
ETH-only signals against a timid `$10` fallback, because DEGEN was delisted for
liquidity and the fallback was made stricter. The judged document misreports
its own headline evidence.
**Fix:** paste the current output of `node desktop/test/loadbearing.test.mjs`.

### G7 — `SUBMISSION.md` claims CI that does not exist  ·  blocks **H3, H5**
It states the memory divergence *"is asserted in CI, not claimed."* There is no
`.github/` directory and no CI anywhere in the repo. The claim is false as
written.
**Fix:** either add a workflow that runs `loadbearing.test.mjs` (and drop the
env-dependent suites, which need credentials), or reword the sentence. Adding
the workflow is better — the claim is worth making true.

### G8 — The README's fork command is the one that breaks  ·  blocks **H4**
`README.md` says `npm run fork`, and `desktop/package.json` defines that as
`anvil --fork-url https://mainnet.base.org --port 8545 --silent` — no pinned
block, no rate throttle. That exact command is what wedged and then killed the
node repeatedly during testing. `desktop/fork.sh` has the working invocation and
documents why each upstream fails, but nothing points at it.
**Fix:** point the `fork` script at `./fork.sh`.

### G9 — Trade size cannot be changed  ·  blocks **H6**
`state.sizeUsd` is initialised to `50` in `server.mjs` and **never written
again**: no route, no key, no UI control sets it. The physical knob is a *mock*
snap-fit part with no encoder (`cad/part_knob.py`: "there is no
potentiometer/EC11 in this build"), and nothing replaced it in software. The
operator cannot size a trade.
**Fix:** a `POST /size {usd}` route plus a control in the Decision pane, clamped
by the remembered per-trade limit. Optionally map it to a key.

### G10 — The pad cannot switch markets  ·  blocks **H7**
The desk app supports six markets and the server accepts a market id on `/key`,
but `agents.h`'s KEYMAP has no market keys and no `scan` key — 14 bindings for a
15-key deck. From the hardware you can only trade whichever market the desk app
last selected, which undercuts the four-asset-class story in a hardware demo.
**Fix:** bind a spare cell to `market` (the server already cycles markets on
that id), or add market ids to the long-press layer.

### G11 — No demo recording  ·  blocks **H8**
Eight real screenshots exist (`docs/images/app/`, captured from the live
Electron window by `desktop/shots.mjs`), but there is no walkthrough video. The
memory demo — wipe, press, watch the verdict change — is a *motion* argument and
loses most of its force as stills.
**Fix:** record the wipe → press → re-teach loop against the running app.

### G12 — Leaked credentials are still unrotated  ·  blocks **H9**
A GitHub PAT was pasted into a chat, and Groq + Deepgram keys were briefly in a
`backend/.env.bak`. They were never committed (`*.bak` and `.env` are
gitignored, and GitHub's push protection was respected, never bypassed), but
they are still live.
**Operator action required:** rotate the GitHub token and the Groq and Deepgram
keys.

### G13 — 1inch has never executed  ·  blocks nothing; keep stated
`ROUTE` reports `1inch` only when `ONEINCH_API_KEY` is set; it is not, so every
fill goes direct to Uniswap V3. The 1inch path is written and has never run.
**Do not claim it works.** Either obtain a key and test it, or leave the code
and the honest note as they are.

### G14 — Virtuals is a listed market, not an integration  ·  blocks nothing
`VIRTUAL` is one of the six tradeable markets, which is a genuine Base-native
touchpoint, but no Virtuals *protocol* feature (agent tokens, ACP) is used.
Partner-stack credit is therefore thin.
**Optional:** deepen it, or state the scope plainly.

---

## 4. What a builder should pick up first

In order, by value per unit of effort:

1. **G8** — one line, and it stops a judge hitting the failure we spent hours
   diagnosing.
2. **G6 + G7** — the judged document currently misstates its own evidence.
3. **G2** — deleting the dead backend removes the loudest contradiction in the
   repo.
4. **G9** — a fixed $50 trade size is the most visible functional hole.
5. **G3** — SPEC.md is the last document still describing the old product.
6. **G11** — the demo video is what the memory argument actually needs.

**G1, G5, G12 and the bench half of G4 need the operator**, not a builder agent.
