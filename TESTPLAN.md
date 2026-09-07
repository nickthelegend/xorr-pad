# xorr-pad — test plan

Every component and flow, with an explicit definition of *correct*. Executed
against the running app in a real browser. A pass means the observed result
matches the stated expectation exactly, with a clean console and no failed
network requests.

Environment under test: `CHAIN_MODE=fork`, anvil fork of Base mainnet on :8545,
desk backend on :8080, `PAD_TOKEN=xorrpad-dev`, Sibyl store at
`/tmp/xorrpad-server.db`.

---

## A. Page / shell

| # | Item | Correct means |
|---|---|---|
| A1 | Load `/?token=…` | HTTP 200, `<title>xorr-pad</title>`, all four panes render (Signals+deck, Portfolio, Memory, Activity) |
| A2 | Header status | Shows `Base fork` (green), `armed`, the active agent name, `block <n>` where n>0, and the agent's 0x address |
| A3 | Deck renders | Exactly 14 buttons: 6 agents + base, portfolio, buy, sell, yes, no, mic, kill. BUY/YES green, SELL/NO/KILL red, BASE blue |
| A4 | Auto-refresh | Page polls every 4s; no unhandled rejection, no growing error count |
| A5 | Console | Zero errors and zero unhandled rejections across the whole session |
| A6 | Network | Zero non-2xx responses except the deliberate 401 in B3 |

## B. HTTP API

| # | Item | Correct means |
|---|---|---|
| B1 | `GET /health` no auth | 200 `{ok:true, mode:"fork", agent:<string>, armed:<bool>, pending:<bool>}` |
| B2 | `GET /memory` **no token** | 401 `{"error":"bad pad token"}` — auth is actually enforced |
| B3 | `GET /memory` with token | 200 with keys `limits, positions, rules, watchlist, baton, journal_recent` |
| B4 | `GET /portfolio` | 200; `chain.chainId === 8453`, `chain.mode==="fork"`, `route`, `balances` with numeric `amount`, no bigint serialisation error |
| B5 | `POST /key` each of 6 agents | 200 `{ok:true, agent:<kind>}`; `/health.agent` becomes that kind; `state:baton` in memory updates |
| B6 | `POST /key {id:"buy"}` | 200 with `signal` + `verdict`; verdict.why cites at least one remembered fact; `awaiting:"yes/no"` when EXECUTE |
| B7 | `POST /key {id:"yes"}` with pending | 200 `{ok:true, fill:{hash:0x…66 chars, status:"success", received>0}}`; position in memory increases; journal grows |
| B8 | `POST /key {id:"no"}` with pending | 200 `{ok:true, rejected:true}`; journal records a REJECTED entry; pending cleared |
| B9 | `POST /key {id:"yes"}` with **no** pending | 200 `{ok:false, error:"nothing pending"}` — no crash, no 500 |
| B10 | `POST /key {id:"nonsense"}` | 200 `{ok:false, error:"unknown key 'nonsense'"}` |
| B11 | `POST /key {id:"kill"}` | 200 `{ok:true, armed:false}`; `/health.armed === false` |
| B12 | `POST /panic` | 200 `{armed:false}`; pending cleared |
| B13 | `POST /tick` | 200 with `signals` array; if a signal fires and armed, a real fill or a reasoned REJECT — never an unhandled throw |
| B14 | `GET /reflect` | 200 `{proposals:[], sibylLearner:{ran:false,reason:…}, journalDepth:<n>}` |
| B15 | `POST /reflect/accept` | 200; the rule is persisted as `entity:rule/<id>` with `accepted:true`; `decide()` then vetoes a matching signal |
| B16 | `POST /memory/wipe` | 200 `{removed:[paths]}`; a following `GET /memory` returns `limits:null` and `positions:{}` |
| B17 | `GET /nope` | 404 `{"error":"no such route"}` |
| B18 | `POST /voice` with real PCM | 200, `content-type: application/octet-stream`, body >10KB, headers `x-transcript`, `x-reply`, `x-action` |

## C. On-chain (Base fork)

| # | Item | Correct means |
|---|---|---|
| C1 | Fork alive | `eth_chainId` = `0x2105` (8453); `eth_blockNumber` > 0; real Base state readable (USDC totalSupply non-zero) |
| C2 | Quote | `quote("ETH","USDC",0.05)` returns a fee tier from {500,3000,10000} and a USDC/ETH price within 500–20000 (sane band) |
| C3 | Real swap | Mined receipt `status==="success"`, and the destination token balance **actually increases** |
| C4 | Insufficient balance | Attempting to spend more than held throws a readable `insufficient <TOKEN>: need X, have Y` — **not** an opaque `STF` revert |
| C5 | Mainnet guard | With `CHAIN_MODE=mainnet` and no `AGENT_PRIVATE_KEY`, startup refuses; auto-execute is refused in mainnet mode |

## D. Memory (Sibyl)

| # | Item | Correct means |
|---|---|---|
| D1 | Real persistence | Data written by one process is readable by a **new** process (real SQLite on disk, not in-memory) |
| D2 | Journal grows | Each proposal/decision/fill appends an event; `read_events` count increases monotonically |
| D3 | Wipe | Deletes db + `-wal`/`-shm`; subsequent recall returns `limits:null`, `positions:{}` |
| D4 | Load-bearing proof | `loadbearing.test.mjs` exits 0; ≥3 of 4 verdicts change after a wipe; control item unchanged |
| D5 | Reflection | 3+ journaled rejections of the same symbol/side produce a proposal; accepting it makes `decide()` return REJECT for a matching signal |

## E. External integrations

| # | Item | Correct means |
|---|---|---|
| E1 | Deepgram TTS | Real HTTP 200 and >10KB of linear16 audio |
| E2 | Deepgram STT | Real HTTP 200; spoken "buy fifty dollars of ETH" transcribes to text containing buy/50/ETH |
| E3 | Claude Code brain | `claude -p` returns a single grounded sentence citing a remembered number |
| E4 | Groq | **Expected blocked** — every model returns `model_permission_blocked_project`. Mark untestable, not pass |
| E5 | 1inch | **No API key present** — route exists behind `ONEINCH_API_KEY`. Mark untestable, not pass |

## F. Browser UI flows

| # | Item | Correct means |
|---|---|---|
| F1 | Agent key click | Button gains the active outline; header agent name changes; no console error |
| F2 | BUY click | Signal panel shows `SIDE SYMBOL $size`, a verdict line, ≥1 memory citation, and YES/NO buttons appear |
| F3 | YES click | Activity log gains a `FILL 0x…` line; Portfolio USDC decreases and ETH increases; Memory positions qty increases |
| F4 | NO click | Pending clears; no fill; journal count increases |
| F5 | WIPE MEMORY | Memory pane limits becomes `NONE — forgotten` (red); positions `none`; activity logs the wipe |
| F6 | Post-wipe BUY | Verdict differs from the pre-wipe verdict for the same press — proving memory changed the decision **in the UI**, not just in a test |
| F7 | KILL click | `armed` pill flips to `disarmed` (red) |
| F8 | Reflection in UI | With ≥3 rejections, a proposal row appears with an ACCEPT button; clicking it persists the rule and it appears under "learned rules" |

## G. Edge cases

| # | Item | Correct means |
|---|---|---|
| G1 | Empty-state render | Straight after a wipe the UI renders `none`/`NONE — forgotten` — no `undefined`, no blank pane, no exception |
| G2 | Bad token in UI | `/?token=wrong` → data panes fail closed (visible error/empty), page still renders, and it is a 401 not a 500 |
| G3 | Mid-flow interruption | BUY → WIPE → YES: must not fill against forgotten limits; either refuses or re-gates against default limits, with no unhandled throw |
| G4 | Over-size order | Ask to spend more than the wallet holds → clamped to balance or refused with a readable message; never an `STF` revert |
| G5 | Double YES | YES twice in a row: second returns `nothing pending`, not a duplicate fill |

---

## Results

Run against the live app: backend on `:8080`, anvil fork of Base mainnet on
`:8545`, Sibyl store on disk, real Deepgram and real Claude Code calls. Browser
flows driven through Chrome against the running product.

**45 automated checks pass, 0 fail** (`node desktop/test/verify.mjs`), plus the
load-bearing proof (`node desktop/test/loadbearing.test.mjs`, exits 0) and the
browser flows below. 2 items are untestable for want of credentials and are
marked as such rather than passed.

| Section | Result |
|---|---|
| A. Page / shell | PASS — 4 panes, 14 keys, correct colours, header live. Console clean; every request 2xx in an authenticated session (75+ observed), the only non-2xx being the deliberate 401s of G2 |
| B. HTTP API (18) | PASS — all routes, including the two added this run (`/log`, `/arm`) |
| C. On-chain (5) | PASS — real Base state (USDC supply $4.19B read from the forked contract), live V3 quotes, mined swaps that move balances, buy→sell round trip, both mainnet guards |
| D. Memory (6) | PASS — survives a separate process, journal grows, wipe destroys db+wal+shm, store usable after, learned rule vetoes, fallback provably stricter |
| E. External (5) | 3 PASS (Deepgram TTS, Deepgram STT, Claude Code brain grounded in memory) · 2 UNTESTABLE (E4 Groq, E5 1inch) |
| F. Browser UI (8) | PASS — agent select, BUY verdict with citations, YES→real fill, NO, WIPE, post-wipe divergence, KILL, ACCEPT→veto |
| G. Edge cases (5) | PASS — all five, after fixes |

**Untestable, not passed:**
- **E4 Groq** — the key authenticates but every model returns
  `model_permission_blocked_project`. The brain runs on Claude Code instead;
  Groq remains wired as a fallback and will work when the project is unblocked.
- **E5 1inch** — no `ONEINCH_API_KEY` in the environment. `ROUTE` reports
  `uniswap` and fills go direct to Uniswap V3 on the fork. The 1inch path is
  written but has never executed, and is not claimed as working.

---

## Defects found and closed during this run

Every one was found by running the product, not by reading it.

| # | Defect | Why it mattered | Fix | Re-verified |
|---|---|---|---|---|
| G19 | **The kill switch did not stop the human path.** `KILL` gated only the automated `runOnce`; `BUY → YES` still executed. Proven with a real on-chain fill (`0x920fd363…`) while `armed:false` | The safety control the whole "agent on your desk" pitch rests on did not stop trades | `yes` is refused while disarmed, leaving `pending` intact | PASS — balance unmoved |
| G20 | **`armed` was a one-way latch** — nothing ever set it back to `true`; one KILL bricked the pad until restart | A demo that pressed the red key was over | `POST /arm` + the `disarmed` pill becomes the click target. KILL and `/panic` stay pure-disarm, so mashing red cannot re-arm | PASS — re-arms, held ✓ survives |
| G21 | `/reflect/accept` **500ed on a malformed body** | Inconsistent with every other route's readable failure | 400 with a readable message, on accept and reject | PASS |
| G22 | **The Activity pane was blind.** The server kept `state.log` and noted every action but never exposed it; the UI only rendered its own clicks | Physical pad presses and automated ticks were invisible, and a refresh erased the history — the pane was useless for the actual input device | `GET /log`, rendered from the server each poll | PASS — pad presses now appear |
| G23 | Two stale `note()` calls survived that refactor | Would have thrown `ReferenceError` on YES and on ACCEPT | Removed; the server logs those itself | PASS |
| G24 | The signal card **still showed YES/NO after filling** | Looked like a live order awaiting confirmation when the trade was already done | Card settles to `FILLED — … / tx …` or `REJECTED` | PASS |
| G25 | Raw floats (`0.020150567106751622`) in the activity log **and in spoken replies** | Deepgram reads out seventeen digits aloud | Rounded at both sites | PASS |
| G26 | `spendable("ETH")` **ignored WETH** | A buy of ETH settles in WETH, so the agent could not sell what it had just bought | Counts native (less gas) plus WETH | PASS |
| G27 | The "conservative defaults" used when memory is empty **were identical to the normal limits** | The code claimed a wiped memory was restrictive; it was equally permissive. Both a safety hole and a hollow demo | Split into `DEFAULT_LIMITS` (seeded) and `NO_MEMORY_LIMITS` ($10/trade, $25/day, ETH+USDC) | PASS — asserted stricter |
| G28 | A wipe **left the previous verdict on screen** | The one dishonest frame in the demo: reasoning displayed from memory that no longer existed | The pane states the verdict was voided | PASS |
| G29 | A wipe **did not void an outstanding ✓** — YES then filled against forgotten limits | Executing a decision whose basis has been deleted | The wipe clears `pending` and reports `pendingVoided` | PASS — refused, balance unmoved |
| G30 | A wrong token threw an **uncaught TypeError every 4s** and showed a blank app | Looked like a broken product; killed the rest of each refresh | Guarded fetches, a visible "bad pad token" banner, a poll loop that cannot die | PASS — zero exceptions |
| G32 | **A wipe was one-way until restart** — nothing could re-teach the limits, so the demo could only be run once | The judge cannot ask to see it twice | `POST /memory/seed` + a RE-TEACH button that appears only while the limits are missing | PASS |
| G31 | A **mis-heard ticker silently turned a spoken order into chit-chat** — Deepgram rendered "E T H" as "an e t", so "buy $40 of ETH" became a chat answer | The headline voice feature failing quietly, mid-demo | Glue spelled-out letters, alias common forms, and fall back to the active market when the verb and amount are unambiguous | PASS — 9/9 parse cases |

Two of the test artefacts were wrong rather than the product, and were corrected:
`loadbearing.test.mjs` fixtures assumed the old permissive fallback (DEGEN and
cbBTC began failing the allowlist for an unrelated reason, masking what the test
meant to show), and `verify.mjs` used `URL.pathname` for a spawn `cwd`, which
percent-encodes the space in "Extreme SSD".
