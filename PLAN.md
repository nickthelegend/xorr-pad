# xorr-pad — build plan

**An AI agent that trades on your desk.**

A builder agent should be able to pick any single task below and execute it
without reading anything else first. Every task says where the code goes and how
to prove it works.

Repo: `/Volumes/Extreme SSD/Projects/xorr-pad` · GitHub `nickthelegend/xorr-pad`
Reference (read-only, do NOT ship): `/Volumes/Extreme SSD/Projects/agent-lab/_references/xorr-eth`

Status legend: **DONE** · **IN PROGRESS** · **NOT STARTED** · **BLOCKED**

---

## 1. What "done" and "winning" mean here

### 1.1 The product claim, in one sentence
A physical deck on your desk runs an autonomous agent that trades on **Base**
through **1inch**, and it **remembers** — positions, limits, and every decision
you approved or rejected — so it never starts cold.

### 1.2 The hackathon bar (Sibyl Labs, hack.sibyllabs.org, slot 0x0D)
Four milestones, each self-marking when its artifact is added:

| Milestone | State |
|---|---|
| Public repo URL | **DONE** — github.com/nickthelegend/xorr-pad |
| Demo video URL | NOT STARTED |
| 2+ build-in-public posts (X / Farcaster) | NOT STARTED |
| Memory fields (what breaks + walkthrough + primitives) | NOT STARTED |

**40% of the score is "is memory load-bearing".** Judges explicitly reject
decorative memory. The memory walkthrough is three lines: what you persist, how
a fresh session recalls it, and *the decision it changes*. Partner stacks
**Base** and **Virtuals** each raise the Builder Score.

### 1.3 Done — the product bar
1. The pad is a working input device: every key press reaches the backend and
   does something visible.
2. Sibyl memory is **load-bearing**: delete `~/.sibyl-memory/memory.db` and the
   agent demonstrably behaves worse — wrong size, forgotten limits, re-asking
   what it already learned. This must be *demonstrable on camera*.
3. A real swap executes on a **Base mainnet fork** through **1inch**, with a tx
   hash you can show.
4. The Electron desk app mirrors every pad control, so a dead switch never
   breaks a demo.
5. No secret is ever committed. `.env` only.

### 1.4 The rule that settles arguments
**If deleting memory doesn't change what the agent does, it isn't memory — it's
a database.** Every feature below is subordinate to that.

---

## 2. Hard constraints (learned, do not re-litigate)

- **1inch has no testnet.** No Base Sepolia 1inch exists. That is why xorr-eth
  runs a *Base mainnet fork* "where fills actually execute". xorr-pad does the
  same. Do not waste a day rediscovering this.
- **Sibyl is Python-only** — `sibyl-memory-client`, no JS SDK, no HTTP API.
  Node must reach it via a Python sidecar and/or the MCP server.
- **Sibyl works with no auth** on the free tier (5 MB local SQLite).
  `sibyl init` (browser) is only needed for the hackathon Pro tier.
- **The pad's hardware is partly broken.** At least `RUN` (matrix r2c1) is a
  dead joint. Execution must therefore be **automatic on the fork**, and the
  desk app must be able to drive everything without the pad.
- **Real mainnet always requires an explicit ✓.** Auto-trade is fork-only.
- Voice stays **Deepgram (STT/TTS) + Groq (LLM)**. Both existing keys are
  compromised and must be rotated before use.

---

## 3. Where the project actually is right now

*(updated after the build run — verified, not assumed)*

| Area | State |
|---|---|
| CAD / keycaps | **DONE** — v8 caps, 5 filament batches, Bambu 3MF |
| Case (tray/plate/deck/knob) | **DONE** — unchanged, already printed |
| Physical pad | **IN PROGRESS** — `RUN` dead, row 3 unswept |
| keytest firmware | **DONE** — map builder + per-key beeps + raw pin monitor |
| Main firmware | **DONE (code)** — posts every press to `/key`; compiles at 90% flash |
| Memory (Sibyl) | **DONE** — sidecar, Node client, recallBrief, journal, reflection |
| Load-bearing proof | **DONE — PASSES** (3 of 4 decisions change when wiped) |
| Base chain + swaps | **DONE** — anvil fork of Base mainnet, real Uniswap V3 fills |
| Agent loop | **DONE** — 6 agents, decide(), executor, journal writeback |
| Desk app | **DONE** — Electron + 4 panes, every key clickable |
| Voice | **DONE** — Deepgram STT/TTS + Claude Code brain, memory-grounded |
| 1inch route | **BLOCKED** — no API key on this machine |
| Submission artifacts | **PARTIAL** — README + memory fields written; video/posts are the operator's |

---

## 4. Phases

### Phase 0 — Finish the hardware  ·  IN PROGRESS
Blocks the demo video, nothing else.

- [DONE] Design v8 trading keycaps (buy/sell/base/6 agents/portfolio/mic/kill).
- [DONE] Export per-filament STL batches + `xorr-pad-keycaps.3mf`.
- [IN PROGRESS] Print caps: white ×9, green ×2, red ×3, legends ×14. 3MF +
  per-filament STLs exported and opened in Bambu Studio; printing is the
  operator's step.
- [IN PROGRESS] keytest sweep. Flashed and run live: 8 of 14 cells mapped,
  `RUN` (r2c1) confirmed DEAD, row 3 never observed. keytest now also beeps
  per key (pitch encodes the cell) and has a raw pin monitor (`x`).
- [IN PROGRESS] Diagnose the dead region. Evidence so far: rows 0 and 1 fully
  alive (cols 0–2), row 2 partly (c2, c3), row 3 never observed. Suspect a
  single broken **row-3 wire (GPIO 13)** plus a joint on r2c1.
- [BLOCKED — needs the operator at the bench] Re-solder or re-map. Prefer re-mapping in software; only open
  the case if a whole row is gone.
- [IN PROGRESS] agents.h now carries the 8 MEASURED cells; the rest are
  marked UNVERIFIED pending the finished sweep.

### Phase 1 — Memory core (the judged 40%)  ·  NOT STARTED
Build this **first**. Everything else is a consumer of it.

- [DONE] `desktop/memory/sibyl_bridge.py` — a long-lived Python process
  wrapping `MemoryClient`, speaking newline-delimited JSON on stdin/stdout.
  Verified API: `Storage(db_path)` → `MemoryClient(storage)`, then
  `set_state/get_state`, `set_entity/get_entity/list_entities/search_entities`,
  `set_reference/get_reference`, `write_event/read_events`, `search`, `learn`.
- [DONE] Define the memory schema and write it into this file:
  - `state:baton` — active agent, active market, size
  - `entity:position/<SYMBOL>` — qty, avg entry, opened_at
  - `entity:rule/<id>` — a learned rule + accepted/rejected
  - `reference:risk/limits` — max per trade, max per day, token allowlist
  - `entity:watchlist/<SYMBOL>`
  - journal via `write_event` — every signal, decision and fill
- [DONE] `desktop/main/memory.mjs` — Node client: spawns the sidecar,
  request/response by id, auto-restart on crash.
- [NOT STARTED — needs `sibyl init`] MCP path: register `sibyl-memory-mcp` so Claude Code shares the
  same store (this is Sibyl's blessed integration — say so in the submission).
- [DONE] `recallBrief()` — one call returning limits + open positions +
  active agent + accepted rules, formatted for prompt injection.
- [DONE, via the journal] Reflection loop: periodically call `learn()`, surface
  `SkillProposal`s as rules the operator accepts/rejects (YES/NO on the pad).
- [DONE — PASSES] **Proof test** `desktop/memory/test_loadbearing.mjs`: run a
  decision with memory present, wipe the db, run the identical input, assert the
  outputs differ. This test IS the 40%.

### Phase 2 — Market + trading core  ·  NOT STARTED

- [DONE] `desktop/main/chain.mjs` — viem client. `CHAIN_MODE=fork` →
  local anvil fork of Base mainnet; `CHAIN_MODE=mainnet` → real Base.
- [DONE] Fork runner script: `anvil --fork-url <BASE_RPC> --chain-id 8453`,
  documented in the README with a one-liner.
- [DONE] Agent wallet from `AGENT_PRIVATE_KEY` (.env, gitignored). On
  fork, fund it via `anvil_setBalance`. Never log the key.
- [BLOCKED — no ONEINCH_API_KEY] 1inch route (in dex.mjs, activates with the key) — 1inch Swap API v6 on Base
  (chain 8453): `/quote`, `/swap`, allowance + approve. Needs `ONEINCH_API_KEY`.
- [DONE] Token registry: ETH/WETH, USDC, cbBTC, DEGEN with decimals +
  Base addresses. This is the allowlist enforced from memory.
- [DONE] `quote()` and `swap()` and `executeSwap(...)` returning a
  tx hash. On the fork, assert the balance actually moved.
- [DONE, on-chain] Price feed for signals + the portfolio pane (1inch spot price or
  a public price API), with an explicit `SIMULATED` tag if a price is unavailable.

### Phase 3 — The agent loop  ·  NOT STARTED
Where memory becomes load-bearing rather than decorative.

- [DONE] `desktop/main/agents.mjs` — one signal generator per kind, matching
  xorr's real roster: `dca`, `grid`, `momentum`, `rebalance`, `yield`, `risk`.
  Each exports `evaluate(market, memory) -> Signal | null`. Deterministic and
  explainable — no LLM invention.
- [DONE] `Signal` shape: `{agent, side, symbol, sizeUsd, reason, confidence}`.
- [DONE] `decide(signal, memory)` — the load-bearing step. Must:
  reject a token not in the remembered allowlist; clamp size to remembered
  limits; veto if an accepted rule matches; adjust for existing position.
  Return `{action, sizeUsd, why[]}` where `why` cites the memory it used.
- [DONE] Executor: on the fork, auto-execute. On mainnet, require ✓.
  Journal the outcome with `write_event` either way.
- [DONE] Kill switch — `/panic`: halt the loop, cancel pending, and
  (mainnet) require a signed action. Wire it to the red KILL key.

### Phase 4 — Electron desk app  ·  NOT STARTED
Hosts the backend the pad talks to, and is the thing on camera.

- [DONE] Scaffold Electron in `desktop/` (main + preload + renderer),
  `npm start` runs everything including the Sibyl sidecar and the HTTP server.
- [DONE] Embed the HTTP server (Phase 5) in the main process, bound to
  `0.0.0.0` so the pad can reach it over Wi-Fi. Print the LAN URL on screen.
- [DONE] Pane 1 **Signals** — live signals with YES/NO buttons mirroring
  the pad.
- [DONE] Pane 2 **Portfolio** — balances, open positions, P&L, tx links.
- [DONE] Pane 3 **MEMORY** — what Sibyl knows: limits, positions, rules,
  recent journal, plus a **Wipe memory** button for the demo.
- [DONE] Pane 4 (the deck doubles as the agent roster) — the six agents, active one highlighted,
  arm/disarm.
- [DONE] Every pad control is clickable in the UI (the pad has dead keys).

### Phase 5 — Pad ↔ backend protocol + firmware  ·  NOT STARTED

- [DONE] Replace the Loom-era API with the trading one:
  `POST /key {id}`, `POST /voice` (PCM in → PCM out), `GET /health`,
  `GET /portfolio`, `POST /signal/:id/{yes,no}`, `POST /panic`.
- [DONE] Keep `PAD_TOKEN` bearer auth; keep `/health` open.
- [IN PROGRESS] Rewrite `firmware/orchestrator_pad/agents.h` for the new deck
  (6 agents + buy/sell/yes/no/base/portfolio/mic/kill) using the **verified**
  map from Phase 0.
- [DONE] LED feedback: agent colour on select, green/red flash on
  fill/reject.
- [DONE] Keep the captive-portal provisioning (already works) — it asks
  for backend URL + token, which now point at the Electron app.

### Phase 6 — Voice  ·  NOT STARTED

- [DONE] Port the speech pipeline from `backend/` into the
  desk app. It already does mic PCM → STT → LLM → TTS → PCM.
- [DONE] Rewrite the system prompt for trading, and inject
  `recallBrief()` so spoken answers use memory.
- [DONE] Intent parsing: "buy fifty dollars of ETH" → a Signal that goes
  through the same `decide()` gate as an automated one.
- [DONE — it is now the default brain] **Claude Code CLI layer**: route reasoning turns to
  `claude -p`, which has the Sibyl MCP memory attached natively. Strong
  submission story; keep Groq for low-latency chat.
- [BLOCKED — operator action] Rotate the compromised GROQ + DEEPGRAM keys before any demo.

### Phase 7 — Safety  ·  NOT STARTED

- [DONE] Caps enforced server-side from memory, not the UI.
- [DONE] `CHAIN_MODE=mainnet` refuses auto-trade unless an explicit
  opt-in flag is set, and always requires ✓.
- [DONE] Never log private keys or full API keys.
- [DONE, gitignore] Secret scan; `.env`, `*.bak` gitignored (already true).

### Phase 8 — Submission  ·  NOT STARTED

- [NOT STARTED] Demo video (≤3 min): pad on desk → signal → YES → fill on Base
  fork with tx hash → **wipe memory live** → same signal now mis-sized/blocked
  → restore. That single beat wins the memory score.
- [NOT STARTED] Two build-in-public posts (hardware shot + memory demo clip).
- [DONE — see SUBMISSION.md] Memory fields:
  - *What breaks when memory is deleted?* — it forgets your risk limits, open
    positions and every rule it learned from your YES/NO history, so it sizes
    blind, re-proposes trades you already rejected, and treats a held position
    as a new entry.
  - *Walkthrough* — persist limits/positions/rules/journal; a fresh session
    recalls them via `recallBrief()`; that changes whether a trade executes,
    at what size, and whether it is vetoed.
  - *Primitives* — recall, entities, semantic search, temporal/time-travel,
    summarization, reflection, consolidation.
- [DONE] README rewrite for the trading product.
- [BLOCKED — interactive browser login] `sibyl init` for the Pro tier; star the Sibyl repo.

### Phase 9 — Stretch: Virtuals  ·  NOT STARTED
- [NOT STARTED] Register the agent on Virtuals for the second partner stack.

---

## 5. Gap audit — closed, and still open

*(re-verified after the build run)*

| # | Gap | State |
|---|---|---|
| G1 | No trading code at all | **CLOSED** — viem + Uniswap V3; real fill `0xabcc2986…` (0.05 ETH → 123.96 USDC) |
| G2 | No Sibyl integration | **CLOSED** — sidecar + Node client, real SQLite writes |
| G3 | `desktop/` was three empty dirs | **CLOSED** — Electron app with four panes, runs |
| G4 | Backend was the wrong product | **CLOSED** — `/key /portfolio /memory /tick /panic /voice /reflect` |
| G5 | Firmware was the wrong product | **CLOSED (code)** — posts to `/key`, compiles; map partly UNVERIFIED |
| G6 | Hardware not verified | **OPEN** — `RUN` (r2c1) dead, row 3 unswept. Needs the operator at the bench |
| G7 | No fork infrastructure | **CLOSED** — anvil fork of Base mainnet, chainId 8453, agent wallet funded |
| G8 | No load-bearing proof | **CLOSED** — `loadbearing.test.mjs` PASSES; 3 of 4 verdicts change on wipe |
| G9 | Compromised secrets | **PARTLY** — never committed and gitignored, but **not rotated** (operator action) |
| G10 | Sibyl venv in the wrong repo | **CLOSED** — `xorr-pad/.venv` |
| G11 | No Pro tier | **OPEN** — `sibyl init` is an interactive browser login. This also gates Sibyl's own `learn()` (TierGateError on free), so reflection is done from the journal instead |
| G12 | Docs describe the old product | **CLOSED** — README rewritten |
| G13 | Stale `CAP_IDS` in render_video | **CLOSED** |
| G14 | No Virtuals work | **OPEN** — stretch, untouched |
| G15 | No price feed | **CLOSED** — prices come from the same pools we trade against |
| G16 *(new)* | 1inch route unusable | **OPEN** — no `ONEINCH_API_KEY`. The keyless Uniswap route keeps fills real meanwhile |
| G17 *(new)* | Every Groq model blocked | **OPEN** — key authenticates, all models `model_permission_blocked_project`. Claude Code CLI is the brain instead |

### Non-gaps (deliberate, don't "fix")
- The `mock` hits in `cad/` are the **mock knob** — a snap-fit display dial,
  intentional because there is no potentiometer in this build.
- `plate/tray/switch-deck` geometry is intentionally byte-identical to the
  LoomPad so the already-soldered pad still fits. Do not regenerate them.

---

## 6. Suggested order of attack

1. **P1 memory core** — it is the score, and everything consumes it.
2. **P2 chain + 1inch on a fork** — proves a real fill.
3. **P3 decide()** — the join where memory changes the trade. Build G8's proof
   test the moment this lands.
4. **P4 Electron shell** — makes it visible.
5. **P5 protocol + firmware** — connects the box.
6. **P0 finish** in parallel whenever the printer/soldering iron is free.
7. **P6 voice**, then **P8 submission**, then **P9** if time remains.
