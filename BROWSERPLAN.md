# BROWSERPLAN.md — every component and flow, and what "correct" means

The checklist this QA run is measured against. Written **before** testing, from
the code, so nothing here is shaped by what happened to pass.

**Surface under test:** the desk app served by the packaged `xorr-pad.app` at
`http://127.0.0.1:8080`, driven in a real browser. 31 HTTP routes, 5 screens,
6 agents, 6 crypto markets, 10 tokenized equities, 15 interactive controls.

**A pass requires all three:**
1. the observed result matches the stated expectation exactly — not "close";
2. **zero console errors** on that item;
3. **zero failed network requests** (no 4xx/5xx that the flow did not explicitly
   ask for) on that item.

A stated expectation of the form "refuses with X" means the refusal itself is
the correct behaviour; the item fails if it succeeds instead.

---

## A. Screens render with real data

| # | Item | Correct means |
|---|---|---|
| A1 | Portfolio loads | Total value is a dollar figure > 0, not "—"; sub-line names an asset count and "via <router>"; Coins list shows ≥ 5 holdings each with qty and price |
| A2 | Markets loads | Exactly 6 crypto rows (ETH, cbBTC, EURC, AERO, MORPHO, VIRTUAL), each with a non-"—" price and a fee tier; the delisted note names DEGEN |
| A3 | Markets: equities | Exactly 10 stock rows; **all 10 show a dollar price** (not "—"); each shows depth; each carries a "not yet" tag; one explanatory note, not ten |
| A4 | Agents loads | 6 agent cards (dca, grid, momentum, rebalance, yield, risk); exactly one marked Active; the rest Paused |
| A5 | Trade loads | Shows the market in hand, the size, and a control to propose; no placeholder text left rendering |
| A6 | Memory loads | Shows limits ($100/trade, $300/day), positions, and a journal with ≥ 1 event |
| A7 | Rail | chain = "Base fork", block = a number matching `/pad`, wallet = a 0x address, both buttons present |
| A8 | Every screen, console | Zero console errors across all five screens |

## B. Navigation and history

| # | Item | Correct means |
|---|---|---|
| B1 | Click each of 5 tabs | The matching pane becomes visible, the others hidden; the title in the topbar changes to match |
| B2 | URL hash follows | Selecting a tab pushes a hash (`#markets` etc.) |
| B3 | Browser Back | Returns to the previously selected tab, not to a blank page |
| B4 | Deep link | Loading `/?token=…#agents` directly opens the Agents pane |
| B5 | Reload mid-session | State (agent, market, size) survives a reload because it is server-side |

## C. Agents

| # | Item | Correct means |
|---|---|---|
| C1 | Click a paused agent | That agent becomes Active, the previous one becomes Paused, and `/pad` reports the new agent |
| C2 | Click the active agent | Stays active; no error |
| C3 | All 6 selectable | Each of the 6 can be made active in turn |

## D. Markets

| # | Item | Correct means |
|---|---|---|
| D1 | Click a crypto market | It becomes "in hand", `/pad` reports it, the Trade screen shows it |
| D2 | All 6 selectable | Each of the 6 becomes the market in hand |
| D3 | Click an equity row | Either it is not selectable, or it is refused with the B20 reason — it must **never** silently become the market in hand |
| D4 | Equity prices are real | The displayed price for NVDAc matches `/markets` `equityPrices.NVDAc` to the cent |

## E. The trade flow — the product's core

| # | Item | Correct means |
|---|---|---|
| E1 | Size stepper | Changing size updates the displayed size and `/pad.sizeUsd` |
| E2 | Propose BUY | A verdict card appears with an action (EXECUTE/REJECT) and **≥ 1 numbered reason drawn from memory** |
| E3 | Confirm ✓ | A real transaction mines: a hash, a block number, and the position/balance changes |
| E4 | Fill names its route | The fill states the router used, and it is one the build ships |
| E5 | Refuse ✗ | The pending decision clears and nothing is executed |
| E6 | ✓ with nothing pending | Refused with "nothing pending" — not a crash, not a silent no-op |
| E7 | Propose while stopped | Allowed to propose; ✓ is refused while stopped |
| E8 | Over-limit size | A size above the remembered per-trade cap is clamped or rejected, citing the cap |
| E9 | Sell with no position | Refused, citing that there is no remembered position |

## F. Memory — the judged criterion

| # | Item | Correct means |
|---|---|---|
| F1 | Briefing | States limits, positions and today's spend in one sentence |
| F2 | Wipe | Store empties; the diff names what was lost and its cost; loss is never negative |
| F3 | Briefing after wipe | Says it remembers nothing, explicitly |
| F4 | Same BUY after wipe | The identical proposal now produces a **different, more conservative** verdict |
| F5 | Re-seed | Limits return. **Positions do not, and must not** — a position is the record of a real fill, so seeding one would fabricate a holding no trade ever produced. Chain balances are unaffected by a wipe; remembered positions are. *(Corrected during the third run: the original expectation said "limits and positions return", which would have required the app to invent holdings.)* |
| F6 | Reflect | Offers ≥ 1 proposal mined from journal events, naming how many it came from |
| F7 | Accept a rule | The rule is stored, and a matching trade is vetoed citing that rule by name |
| F8 | Reject a proposal | It is not stored |
| F9 | Contradictions | Surfaces a rule that can never fire |
| F10 | Decay | Archives a rule nothing needs; keeps one that is firing; `days:0` honoured as 0 |
| F11 | Replay | Shows a past state that differs from now, and refuses a junk timestamp with 400 |

## G. The pad-connect QR

| # | Item | Correct means |
|---|---|---|
| G1 | Open the panel | A QR renders as an SVG, with the LAN URL and token shown as text |
| G2 | The code is valid | Its payload decodes to exactly `<lan-url>\|<token>` |
| G3 | Close | Panel closes via the button and via Escape |

## H. Setup screen

| # | Item | Correct means |
|---|---|---|
| H1 | `/setup` renders | Three fields (Deepgram key, pad token, chain) with labels and hints |
| H2 | Empty submit | Refused with "nothing to save"; nothing written |
| H3 | Partial save | Saving one field preserves the others already stored |
| H4 | Save and open | Redirects to the desk with the token applied |

## I. Kill switch

| # | Item | Correct means |
|---|---|---|
| I1 | Stop all trading | Disarms: `/pad.armed` false, the button reflects it, pending clears |
| I2 | ✓ while stopped | Refused |
| I3 | Re-arm | Trading resumes and a ✓ works again |

## J. Voice

| # | Item | Correct means |
|---|---|---|
| J1 | MIC control exists | Present and clickable |
| J2 | Spoken question | Real audio in → transcript, spoken reply, and `x-brain` names the brain |
| J3 | Silence | `x-action: UNHEARD`; nothing invented |
| J4 | Mis-heard ticker | An unrecognised ticker is refused, never substituted with the market in hand |

## K. API surface, directly

| # | Item | Correct means |
|---|---|---|
| K1 | Every authed route without a token | 401 |
| K2 | `/health` without a token | 200 (deliberately open) |
| K3 | `/setup` from a non-local address | 403 |
| K4 | Wrong method on a GET-only route | 405, not 404 or 500 |
| K5 | Unknown route | 404 with a JSON error |
| K6 | Malformed JSON body | 400 or a handled error — never an unhandled 500 |
| K7 | Unknown key id | Refused by name |
| K8 | `/memory/at` junk timestamp | 400 |
| K9 | `/speak` empty text | 400 |
| K10 | `/speak` over-long text | 400 naming the ceiling |

## L. Failure and interruption

| # | Item | Correct means |
|---|---|---|
| L1 | Bad token in the URL | The page says the token is wrong rather than rendering empty panes silently |
| L2 | Backend dies mid-session | The UI says it cannot reach the backend; it does not show stale numbers as current |
| L3 | Chain unreachable | `/pad` still returns 200 with `chainOk:false`; the UI degrades without going blank |
| L4 | Rapid double-confirm | Exactly one fill, not two |

## N. Routing and best execution — added after the first run, when the aggregator landed

| # | Item | Correct means |
|---|---|---|
| N1 | Two routers are built and usable | `uniswap` and `kyberswap` both usable, with **no** `ZEROX_API_KEY` or `ONEINCH_API_KEY` set |
| N2 | The aggregator quotes for real | A live quote naming ≥ 1 venue, within 5% of the direct pool's quote |
| N3 | A fill records the comparison | The fill carries every router quoted and the margin the winner won by |
| N4 | The fill card shows the route | The verdict card names the router, and when it won a comparison, by how much |
| N5 | A fallback is visible, never silent | When the aggregator fails, the fill routes through the direct pool **and the card says what it fell back from and why** |
| N6 | The aggregator prices an equity | KyberSwap returns a route for USDC → NVDAc, which a direct V3 call cannot reach |
| N7 | Read-only mainnet refuses to sign | With `CHAIN_MODE=mainnet` and no key: reads work, `wallet` is null, a confirm is refused naming the missing key — **before** any balance check |

## O. Surface added after the second run — the archive, rule lifecycle, tuned execution

Written before this third run, from the code, for the same reason as everything
above: so nothing here is shaped by what happens to pass.

| # | Item | Correct means |
|---|---|---|
| O1 | Closed positions render | The Memory screen shows a **"closed positions"** block, separate from and ahead of the general archive, with quantity, entry price and a local-time close stamp — not one terse line mixed in with retired rules |
| O2 | Closed is not deleted | A position closed through the UI appears in that block; `/memory/full` returns it with `category: "position"` |
| O3 | Rule status is visible | An accepted rule shows an **active** badge; a rejected one shows **rejected** — the two never look identical |
| O4 | Status comes from Sibyl | The badge reflects the store's own `status` column, not a flag inside the rule body |
| O5 | The brain reaches the archive | Asked about a position no longer held, the spoken/text brain answers from the archive rather than "no record" — the archive is outside the FTS index, so this cannot come from a tier search |
| O6 | Mainnet slippage is not the fork's | With `CHAIN_MODE=mainnet`, the default tolerance is 0.3%, not the fork's 1% |
| O7 | The fork refuses a bad upstream | `fork.sh` rejects an upstream that cannot serve state at the pinned block and falls through to one that can, rather than handing anvil a node that fails at the first trade |

**Total with sections O, P, Q, R and S: 116 items.**

## P. The routes and flows the plan never covered

Added on the fourth run. Phase 1 says "every API endpoint and every distinct
flow"; a route-by-route diff of `server.mjs` against this file found that three
real flows had **no item at all** across three full runs — the book scan, the
panic key, and the automation tick. The tick is the most safety-critical path
in the product: it is the only one that can trade **without a human ✓**, and
until now the browser plan never exercised it live.

| # | Item | Correct means |
|---|---|---|
| P1 | The book actually runs | `GET /scan` returns 200 having considered **all six** crypto markets, with a `summary` string. It is honest when it finds nothing — a scan with no signal says so rather than inventing one |
| P2 | The scan is remembered | `GET /scan/last` returns the result of the run just performed, without re-running the book |
| P3 | The SCAN control reports it | Pressing SCAN in the UI runs the book and shows its result on screen — the desk never silently swallows a scan |
| P4 | Panic disarms in one action | `POST /panic` sets `armed:false` **and** clears any pending decision in the same call, and the log records `PANIC` |
| P5 | Panic never re-arms | Calling `/panic` twice leaves it disarmed. Re-arming is a separate deliberate act via `/arm` — mashing the kill key can never re-enable trading |
| P6 | Automation executes only when armed | `POST /tick` with `armed:true` on a fork may execute and, if it does, returns a real `fill` with a mined hash. With `armed:false` it **must not** execute, no matter what the book says |
| P7 | Automation can never fire on mainnet | The execute gate is `state.armed && IS_FORK`. With `CHAIN_MODE=mainnet` a tick must not sign, even armed — this is the single property that keeps the pad from trading real money unattended |
| P8 | A tick is honest about doing nothing | When the book finds no signal, `/tick` returns `signals: []`, `verdict: null`, `fill: null` — not a fabricated trade |
| P9 | The log is a real journal | `GET /log` shows the actual sequence of what the pad did — a fill, a baton change and a panic all appear, timestamped, in order |
| P10 | One source of truth for the briefing | `GET /briefing` and the briefing strip on screen say the same thing; the UI never renders a briefing the backend would not give |

**Section P: 10 items.**

## Q. What each agent actually produces

Added on the fifth run. Sections A–P test which agent holds the baton, never
what any of them *emits*. The tick bug found on the fourth run lived inside an
agent, so this is the axis that had been carrying a real defect all along — and
it was carrying a second one.

An agent's output is only correct if the pad can act on it. These are properties
checked against book states chosen to fire each agent, **including a book that
holds cash** — the state that hid the yield bug.

| # | Item | Correct means |
|---|---|---|
| Q1 | No agent names the quote asset | Everything settles in USDC, so a signal naming USDC becomes `swap("USDC","USDC")` — untradeable at any size. **No agent may emit one, in any book state** |
| Q2 | Every signal names a real market | The symbol is one of the six tradeable markets — never a delisted, unlisted or equity symbol the pad refuses anyway |
| Q3 | Every signal is well-formed | `side` is BUY or SELL, `sizeUsd` is finite and > 0, `confidence` is within 0..1, and `reason` is non-empty — a signal the operator cannot read is not a signal |
| Q4 | No agent sells what is not held | A SELL only ever names a symbol the book has a remembered position in |
| Q5 | Each agent fires only on its own condition | dca on elapsed interval · grid on drift past a rung · momentum past its threshold · rebalance out of band · yield above the cash buffer · risk past the stop. On a flat, empty book the four **position-dependent** agents (grid, rebalance, yield, risk) must all stay silent — they have nothing to reason about. *(Corrected during the fifth run: this first read "none fires on a flat book", which was wrong. dca and momentum are **entry** strategies — opening a position from flat is exactly their job, and demanding silence would have been demanding a bug.)* |
| Q6 | A reason never claims more than the build does | No agent's text implies a capability the build lacks — there is no lending venue here, so nothing may describe itself as earning yield |

**Section Q: 6 items.**

## R. The controls no item ever touched

Added on the sixth run. Every previous section tested the controls it happened
to name. Enumerating the live DOM across all five panes found **47 distinct
interactive controls**, and six of them had no item at all — including three
that are the only UI path to features the plan otherwise tested solely through
the API.

| # | Item | Correct means |
|---|---|---|
| R1 | The activity expander goes somewhere | The `and N more ›` link under the Portfolio activity list opens the **Agents** pane, where the full list lives — it is a navigation link, not a dead label, and N matches the number of events not shown |
| R2 | Retire-rules is reachable from the desk | Pressing **Retire rules nothing has needed** runs the same decay the API does (14-day window) and renders a result panel on screen — the operator never has to call an endpoint to use it |
| R3 | Retiring nothing says so sensibly | With no rules in the store the panel must **not** read "Checked 0 rules. Every rule has either fired or is younger than the window." An empty store and a store with nothing to retire are different facts and must read differently |
| R4 | Replay refuses an empty time | Pressing **Replay** with the picker empty shows "Pick a time first." and makes **no** request — an empty input is the operator's slip, not a reason to query |
| R5 | Replay echoes the operator's own clock | Replaying a chosen local time shows that same wall-clock time back. The picker takes local time and the API takes UTC, so a correct replay of 09:15 says 09:15 — never the UTC-shifted hour |
| R6 | **Now** replays the present | Pressing **Now** replays the current instant and shows state consistent with what the store holds right now |
| R7 | The journal collapses and returns | The **hide** / **show** toggle sits in the `journal — N events` heading and gates **the journal entry list only**, not the tier browser. Collapsed, the entries go and the heading keeps its count so you still know what is hidden; expanded, every row returns intact. Not one-way. *(Corrected during the sixth run: this first said it toggles the tier-by-tier browser. It does not — `storeOpen` gates only the journal rows.)* |

| R8 | Replaying the future is refused or empty | A timestamp after now cannot describe a past the store had. It must either be refused, or replay to the present state — never invent events that have not happened |
| R9 | Replaying before any history is honest | A timestamp older than the whole journal replays to an empty book — 0 events, flat, nothing spent — rather than showing today's positions under a past date |

**Section R: 9 items.**

## S. The strategies' arithmetic

Added on the seventh run. Sections A–R establish that every signal is
*tradeable* and *well-formed*; none of them checks whether a single threshold,
drift or sizing number is **numerically right**. Each formula below was computed
by hand and checked against real recorded output.

| # | Item | Correct means |
|---|---|---|
| S1 | `dca` honours its own interval | It proposes at most once per configured window. "Recurring buy every 24h" must describe what it does — silent a minute after buying, silent at 23h, proposing again at 25h |
| S2 | A dca buy records when it bought | A filled DCA buy stamps `dca_last_ms`, **merged** into the baton so the agent, market and size the desk restores on boot survive it |
| S3 | `grid` drift is a true percentage from entry | `((px − entry) / entry) × 100`, BUY below the rung and SELL above it, with no division by a zero entry |
| S4 | `momentum` confidence stays in range | `min(1, ch / (th × 3))` — ⅓ at the threshold, saturating at 1.0 by 3× threshold, never above 1 |
| S5 | `rebalance` sizing lands the weight on target | `usd = |drift/100| × total` must move the asset to **exactly** its target weight, not approximately |
| S6 | `risk` cuts the whole position at the stop | `dd = ((px − entry)/entry) × 100` fires at ≤ −stop, and `sizeUsd = qty × px` closes all of it |

**Section S: 6 items.**

## M. Cleanliness

| # | Item | Correct means |
|---|---|---|
| M1 | Console, whole run | Zero errors anywhere across every item above |
| M2 | Network, whole run | Zero unexpected 4xx/5xx across every item above |
| M3 | No mocks | No stubbed logic, fallback data, or placeholder values anywhere in the tested surface |

---

**Total, sections A–N: 78 items.** *(This line read "68" for two runs. It was
never counted — the section tables hold 78 rows. Corrected on the third run,
which counted them.)*

## Second full run — 68 of 68 PASS, 2026-09-09

The plan was re-executed end to end after the aggregator, best execution and
read-only mainnet landed, with seven new items (section N) covering that
surface. Every item re-verified; three new defects found and fixed, all of them
in the **test harness rather than the product** — which is its own finding, and
the same class of fault the product's own standards reject:

1. **Two SKIP lines printed unconditionally** and the footer carried a
   hardcoded `(2 skipped: credentials unavailable)`. One still claimed "route
   falls back to Uniswap V3", written before an aggregator existed. E4 now
   really calls Groq; E5 became a real check and passes. The count is counted.
2. **`chk()`'s message is evaluated before the assertion**, so a momentarily
   bad response threw inside a template literal and aborted a whole section —
   "R crashed" with nine unrelated checks never run. Eleven such expressions
   now read the response optionally; the assertions stay strict.
3. **The habit-loop section inherited its precondition.** Reflection mines
   operator refusals, and a sell only reaches the operator if it clears the
   gate — with no remembered position there was nothing minable, and the
   section had four journalled events instead of twelve. It now establishes
   its own position first.

**On the browser.** Claude in Chrome still cannot drive this environment, and
this run proved it is not the app: on a **trivial page** — one button, a
document-level capture listener, nothing else — its click produced "never
clicked". The run was completed in the in-app Chromium browser, which delivers
input to the same pages at the same coordinates.

**Confirmed at the end of this run:** suite **141 passed, 0 failed, 1 skipped**
(the skip being Groq's account-level model block, measured and reported rather
than assumed); load-bearing proof PASS; **zero mocks, stubs, fakes, TODOs,
fixtures or canned data** anywhere in `main/`, `renderer/` or the firmware; and
a clean browser session across all five screens with **zero console errors and
60+ network requests all 200**.

## First full run — 61 of 61 PASS

Run against the packaged `xorr-pad.app` in a real Chromium browser on
2026-09-09. Every item was executed, every failure fixed at the root, and the
whole plan re-run top to bottom afterwards.

**On the browser used.** The goal named Claude in Chrome. Its input delivery is
broken in this environment: after `navigate`, a synthetic click produces **no
event at all** at `document` in capture phase — not pointerdown, not mousedown,
nothing — while a DOM `.click()` on the same element at the same coordinates
works. A native event cannot be blocked by page code in capture phase, so this
is the extension, not the app. Confirmed on two fresh tabs, then confirmed the
opposite way: the same URL and the same coordinates in the in-app Chromium
browser deliver the click and the page responds. The run was completed there.

| Item | Status | Note |
|---|---|---|
| A1–A8 | **PASS** | 5 holdings, 6 markets, 10 equities all priced, 6 agents, zero console errors |
| B1–B5 | **PASS** | five tabs, hash, Back, deep link, server-side state across reload |
| C1–C3 | **PASS** | all six agents selected in turn; `/pad.agent` tracked each |
| D1–D4 | **PASS** | all six markets; equities not selectable and refused by API; NVIDIA $225.80 matches the API to the cent |
| E1–E9 | **PASS** | real mined fills, 3 numbered reasons from memory, $250 clamped to the $100 cap, sell-with-no-position refused |
| F1–F11 | **PASS** | wipe diff named 14 events + AERO + risk/limits + baton; same BUY went EXECUTE → REJECT |
| G1–G3 | **PASS** | QR hidden on load, payload exactly `url\|token`, closes on Escape |
| H1–H4 | **PASS** | H2's fully-empty submission is unreachable through the UI (the chain select always has a value); the server-side refusal is asserted by suite check T4 |
| I1–I3 | **PASS** | stop disarms and clears, ✓ refused while stopped, re-arm honours the held proposal |
| J1–J4 | **PASS** | real TTS→STT→brain round trip, silence → `UNHEARD`, unknown ticker → `UNCLEAR` |
| K1–K10 | **PASS** | 12 authed routes 401, `/setup` 403 off-host, wrong verb 405 with `Allow` |
| L1–L4 | **PASS** | bad token, dead backend and dead chain all stated plainly; double-confirm fills once |
| M1–M3 | **PASS** | zero console errors and zero unexpected non-2xx in a clean session; no mocks, stubs or fallback data |

Alongside: the automated suite is **140 passed, 0 failed** against this build.

## The 14 defects found, and what each actually was

1. **The pad-connect panel was open over the app on every load**, pad token on
   show. `#padcode{display:grid}` — an id selector — outranks the UA
   stylesheet's `[hidden]{display:none}`. It was the only element with that
   combination.
2. **The nav swallowed clicks.** `drawTabs()` replaced `#nav.innerHTML` every
   4 seconds; a click landing between mousedown and mouseup lost its element and
   the browser never fired `click`. Now built once, patched in place.
3. **The agent cards swallowed clicks**, same cause, no guard at all.
4. **The market rows swallowed clicks**, worst of the three: their cache key
   included the price, so they rebuilt every few seconds regardless, and four
   call sites additionally forced a rebuild by clearing the key first. 2
   rebuilds per 9 seconds → 0.
5. **Six unnamed buttons.** The agent labels live in child spans that never
   become the accessible name.
6. **The market in hand was this tab's opinion, not the backend's.** `/markets`
   is fetched once, so a market chosen on the physical pad never reached the
   desk: the backend held AERO while the screen highlighted ETH.
7. **A fill said nothing about where it filled** — no route, no margin, no
   fallback, with two routers and best execution between them.
8. **"Retire rules" showed its result and then hid it**, because the decay path
   never stamped `ttDrawnAt` and the next refresh compared against a stale one.
9. **The time machine echoed UTC** while its picker takes local time: 00:10 was
   answered "what it knew at 18:40".
10. **A sub-dollar entry price was `Math.round()`ed** — AERO at $0.6154 cited as
    "@ $1", anything under fifty cents as "@ $0" — in the sentence the verdict
    rests on. Three of the six markets trade under a dollar.
11. **A wrong verb on a real route answered 404**, claiming the route did not
    exist. Now 405 with `Allow`.
12. **Clearing the pad-token field in setup locked you out**: it redirected to
    `/?token=` with the blank, opening the desk with every pane empty.
13. **A mis-heard ticker became the market in hand.** Spoken "Zorblax" came back
    from Deepgram as "Absorb Locks" — no preposition, no alias — so the guard
    (which required an "of") never fired and the pad proposed **BUY $50 of ETH**.
    The worst failure this product has, and the exact bug the earlier "ETA" fix
    was supposed to have closed. The guard now works from the words left after
    the verb, the amount and the fillers.
14. **A dead backend looked like a healthy one.** `refresh()` returned early on a
    failed health poll and left the last render standing — a confident total, a
    block number and a wallet, minutes stale, presented as current.

## Confirmed

- **Zero mocks, zero stubs, zero fallback data** in the tested surface. The only
  greps that hit are a comment describing the physical knob (a real printed part
  deliberately built without an encoder) and a CSS `::placeholder` selector.
- **Real persisted database** — SQLite at `~/.sibyl-memory/memory.db`, read and
  written by the running app.
- **Real signed transactions** on a Base mainnet fork, against real contract
  addresses, with mined receipts and balances that move.
- **Real external APIs with real credentials**: Deepgram for speech in and out,
  the Claude CLI as the brain, KyberSwap's aggregator for quotes and routing.
- **Zero console errors and zero unexpected non-2xx** across a clean session.
  Errors seen mid-run were my own deliberate 401/403/404/405/400 probes and the
  connection-refused entries from restarting the app between fixes.

---

## Third full run — 2026-09-09, 85 items

Re-executed end to end after the archive, rule lifecycle and tuned-execution
work landed, with seven new items (section O) written before testing.

**Three defects found in the product, all fixed and re-verified.**

### 1. `POST /markets` answered 200 and quietly did a GET's work — **K4**

The 405 check sat at the *bottom* of the router, so it only ever saw requests
that no handler had matched. Seven handlers matched on the path alone without
looking at the method, so every one of them accepted any verb: `POST /pad`,
`POST /portfolio`, `POST /health`, `POST /padqr`, `POST /scan`, `POST /pending`
and `POST /markets` all returned 200.

Fixed at the root rather than per-handler: `ROUTE_METHODS` is now enforced
**before any handler runs**, so a handler cannot accept a verb the table does
not list and a new route cannot reintroduce the hole by forgetting to check.
The now-unreachable bottom check was removed rather than left as dead code.
Verified: all ten GET-only routes return 405 with `Allow: GET`, all POST-only
routes return 405 on GET, and every correct verb still works.

### 2. A failed aggregator was invisible on the fill card — **N5**

`fellBack` only covers a router that *wins* and then fails to build. When one
fails at the **quote** instead, `wonBy` is null and `fellBack` is null, so both
render branches were skipped and the card showed a bare `route uniswap` — which
reads exactly like a fair comparison uniswap won, when in truth nothing else was
standing. Execution quality had silently degraded.

Proved by making the aggregator genuinely unreachable (`KYBER_TIMEOUT_MS=1`).
The card now reads `route uniswap · sole quote` followed by
`not quoted · kyberswap — could not reach the KyberSwap aggregator (timeout)`.
The healthy path still shows `best of 2, by 0.9636%`, with no false failure line.

### 3. A malformed body reported the wrong cause — **K6**

`POST /key` with broken JSON answered `unknown key ''` — true about the
consequence, useless about the cause. An unparseable body now returns 400 naming
the parse error; an empty body is still `{}`, because several routes take none.

### One expectation in this plan was wrong, not the app — **F5**

It said a re-seed restores "limits and positions". Positions must **not** come
back: a position is the record of a real fill, so seeding one would fabricate a
holding no trade ever produced — the exact mock this project forbids. Chain
balances survive a wipe; remembered positions do not, and that gap is what makes
the demo's turn mean anything. The expectation is corrected above.

### On the browser

Claude in Chrome **did** deliver input this time, and drove most of this run:
navigation, all six agents, all six markets, the size stepper, propose/confirm/
refuse, two mined fills, the kill switch, the QR panel and the whole memory
cycle including the wipe. It was verified with a document-level capture probe
before being trusted, not assumed.

It then became unusable partway through — tabs were recreated with `innerWidth`
and `innerHeight` of **0**, `visibilityState: "hidden"`, and clicks delivering
zero events (`doc: 0, btn: 0` on a capture listener). That is the same symptom
the second run recorded, and this run isolated the discriminator: input reaches
only the **active, non-zero-viewport** tab. It is an environment fault, not an
app fault — the same pages, at the same coordinates, took input normally in the
in-app Chromium browser, where the remaining items (H4, J1–J4, L2–L4, N5, O5 and
the clean-tab console/network sweep) were completed.

**H4 in particular looked like a product defect and was not:** "Save and open the
desk" appeared dead in Chrome purely because the button's rect was at
`x: -125, y: -183` in a 0x0 viewport. In a real viewport it redirects to the desk
with the token applied and authenticating.

### Verified, not assumed

- **The QR was decoded by OpenCV**, independently of the encoder that drew it:
  `http://192.168.1.19:8080|xorrpad-dev`, exactly `<lan-url>|<token>`.
- **Both routers were proved on-chain.** A KyberSwap fill's receipt shows
  `to = 0x6131b5fa…37b5` (MetaAggregationRouterV2) and a Uniswap fill's shows
  `to = 0x2626664c…e481` (SwapRouter02). The route label is read off the receipt,
  so it cannot lie about the venue.
- **Best execution is real, not decorative.** KyberSwap genuinely beats the
  direct pool on the thinner pairs — MORPHO by 1.856%, VIRTUAL by 0.944% — and
  loses on the deep ones.
- **The equity price cross-checks two independent paths**: the displayed $225.80
  (from the pool's own `slot0`) against a live KyberSwap quote of 0.110538 NVDAc
  for $25 — 0.16% apart.

---

## Fourth full run — 2026-09-09, 95 items

Phase 1 says *every API endpoint and every distinct flow*. So this run began by
diffing `ROUTE_METHODS` in `server.mjs` against this file rather than re-reading
the checklist — and found the checklist was **incomplete**, not merely
miscounted. Three real flows had no item at all across three full runs: the book
scan, the panic key, and the automation tick. Section P covers them.

The tick is the one that mattered. It is **the only route that can trade without
a human ✓**, and nothing in three QA passes had ever pressed it.

### The defect that had been hiding behind the gap — **P6**

`POST /tick` answered **500 on every armed call**. The rebalance agent's default
target is `{ ETH: 0.5, USDC: 0.5 }` and it measures each symbol's share of
*remembered positions*. USDC is never a position — it is the cash you buy with —
so its share was permanently 0, its drift permanently −50%, and it emitted
`BUY USDC` forever. Since everything settles against USDC, that became
`swap("USDC","USDC")`: a self-swap with no pool. `runOnce` takes `signals[0]`
without looking, so this was the **first** thing every armed tick tried.

It hid this long because the failure is invisible unless you actually press it:
a *disarmed* tick returns a clean 200, because `execute:false` never reaches the
swap. The bug only exists on the path that trades unattended.

Two category errors, both fixed at the root:

1. The quote asset can never be the thing a signal names. `rebalance()` now
   skips it, and `runOnce` drops any such signal before the gate so no future
   strategy can take the automation route down the same way.
2. Wanting more cash is **a sale, not a purchase**. The cash leg now sells the
   largest over-weight holding: `AERO SELL — "cash is 0.00 vs target 0.5 —
   selling AERO, the largest holding, to raise it"`.

Re-verified: an armed tick now returns 200 and mines a real fill —
`0x1b026ca4…517b`, status `0x1`, block 51060692, to `0x6131b5fa…37b5`
(KyberSwap MetaAggregationRouterV2), 19 events, 24.977947 USDC received. That is
the automation path trading correctly, end to end, for the first time in testing.

Suite section **X** was added so this cannot come back: no strategy may name the
quote asset, a tick must complete rather than throw, and a quiet book must
invent nothing even when it is allowed to trade.

### The safety property, now actually exercised

`P7` was the reason to care. The execute gate is `state.armed && IS_FORK`, and
it holds twice over: with `CHAIN_MODE=mainnet` and execution forced, `runOnce`
refuses with *"refusing to auto-execute on mainnet — needs explicit
confirmation"* and returns no fill. Disarmed on a fork, it computes the verdict
and still does not execute. Both were verified live rather than by reading the
source.

---

## Fifth full run — 2026-09-09, 101 items

The fourth run's lesson was that the checklist itself was the defect: three
"zero tolerance" passes all went green while the automation path was completely
broken, because no item listed it. So Phase 1 audited coverage again, on the
axis still unaudited — **what each agent produces**, not which one holds the
baton. That is where the fourth run's bug had been living.

It was carrying a second one.

### `yield` emitted a self-swap too — **Q1**

```
yield  SELL USDC $400
```

The same defect class as the rebalance bug, in a second agent. `SELL USDC`
becomes `swap("USDC","USDC")` — untradeable at any size.

**It survived the fourth run's fix because the check written to catch that bug
could not reach it.** X1 ran one agent sweep against whatever the live store
held, and `yieldAgent` only fires when the book actually holds cash. The book it
tested held none, so yield returned null and X1 passed on a state that never
exercised the property.

The fix required deciding what the agent can honestly do. There is no lending
venue in this build — the only place a trade can go is the DEX — so "park idle
stables" cannot mean earning protocol yield here. It now deploys the excess into
an asset and says exactly that:

```
yield  BUY ETH $400 — "500 USDC idle above the 100 buffer — deploying the excess into ETH"
```

No text implies interest is being earned somewhere it is not (**Q6**).

X1 was rewritten from a single sweep into a property driven across five book
states chosen to fire each agent — including a book holding cash. **19 signals
across 5 states × 6 agents, 0 malformed.**

### An expectation of mine was wrong again — **Q5**

Q5 first said "none fires on a flat, empty book". On a flat book `dca` and
`momentum` fire, and they should: they are **entry** strategies, and opening a
position from flat is exactly their job. Demanding silence would have been
demanding a bug. Corrected to what actually matters — the four
**position-dependent** agents (grid, rebalance, yield, risk) must stay silent
with nothing to reason about, and all four do.

That is the third run in a row where a plan expectation, not the app, was the
thing that was wrong (F5, then Q5). Worth saying plainly: the checklist has now
been a source of error as often as the code.

### The suite could hang forever, and did

Mid-run the suite stopped at 75 checks and sat there. Nothing was wrong with the
product: the chain answered in 0.3 ms, `/portfolio` in 3.6 ms, and the very
`/speak` call it was stuck on returned 200 in 1.0 s to twelve consecutive direct
requests. One socket had stalled, and `fetch` has no default timeout, so the
whole run hung with no output and no exit.

"No result" is the one outcome that looks like neither a pass nor a fail, and a
suite that can produce it cannot be trusted to report. Every request the suite
makes now carries a 90-second deadline — far above the slowest real call here, a
~14 s voice round trip — so a stall becomes a loud failure attributed to the
check that caused it, rather than silence.

Worth recording alongside it: while chasing that stall I twice concluded "still
running" from `pgrep -f verify.mjs`, which was matching **my own polling loops**
— their command lines contain the string. The suite had finished long before.
The measurement was wrong, not the thing measured, which is the same mistake in
a different coat.

---

## Sixth full run — 2026-09-09, 110 items

The axis named at the end of the fifth run: **the renderer's interactive
controls**. Every section before this tested the controls it happened to name.
Enumerating the live DOM across all five panes found **47 distinct interactive
controls**, and six had no item at all — three of them the only UI path to
features the plan otherwise reached solely through the API.

Section R covers them, plus two realistic edge cases on the control that turned
out to be carrying a defect.

### "Pick a time first." deleted itself while you read it — R4

The time-machine panel is hidden by the 4-second refresh whenever the last wipe
is newer than `ttDrawnAt`. `showAt()` and `decay()` both stamp that clock — the
comment in `decay()` says exactly why, having been bitten once already. But
`replay()`'s early return did not, so the one message whose entire job is to
tell the operator what to do next appeared and then vanished a few seconds
later, with no trace and no explanation.

It had never been caught because no item pressed **Replay** with an empty
picker, and because catching it requires waiting past the refresh — checking
within a second shows the message sitting there looking correct.

Both early returns now go through a `ttSay()` helper that stamps the clock.
Verified the way it has to be: the message is still on screen **7.6 seconds**
later, and still makes no request.

### A future replay is now refused — R8

The picker had no `max`, so a future timestamp was accepted and answered "what
it knew at \<a date that has not happened\>". Arithmetically defensible — every
event is before it, so it returns the present — but it reads as a claim about
knowledge nobody has. The picker now carries a local-time `max`, and a typed
future time is refused in the handler.

### And an expectation of mine was wrong, for the fourth run running — R7

R7 said the hide/show toggle collapses the tier-by-tier store browser. It does
not: `storeOpen` gates **the journal entry list only**, and the button lives in
that block's heading. The behaviour is right and useful — the count stays
visible so you know what is hidden — and only my description of it was wrong.

Suite check **X4** added: nothing may write to the time-machine panel without
stamping the refresh clock, asserted against the renderer source.

---

## Seventh full run — 2026-09-09, 116 items

The axis named at the end of the sixth run: **the strategies' arithmetic**.
Every section before this establishes that a signal is tradeable and
well-formed; none checks whether a single threshold, drift or sizing number is
numerically right. Section S covers it.

Five of the six formulas were correct, verified by hand against real output:

- `grid` drift 25% on entry 2000 → px 2500, SELL, reason cites 25.0% ✓
- `momentum` confidence ⅓ at threshold, 1.0 at 3×, capped at 1.0 for 50% ✓
- `rebalance` $1200 on a 2600 book — and the post-trade weight is **exactly
  0.5000**, not approximately ✓
- `risk` −39% drawdown → SELL the whole position, $61 = qty × price ✓
- `yield` `usdc − buffer`, dimensionally loose but numerically right because
  USDC is a dollar stablecoin, consistent with `rebalance` pricing it at 1 ✓

### The sixth agent: `dca`'s interval was decorative — S1

```js
const last = brief.baton?.dca_last_ms ?? 0;
if (Date.now() - last < everyMs) return null;
```

**`dca_last_ms` appeared exactly once in the entire codebase — in that read.**
Nothing ever wrote it. So `last` was always 0, `Date.now() - 0` always cleared
the 24-hour window, and "recurring buy every 24h" proposed a buy on *every*
evaluation. Armed, that is every tick rather than once a day, and the reason
string stated a schedule the code did not keep.

It is the same shape as the two self-swap bugs: a mechanism that reads state
nobody maintains. And it was the most-fired agent in every tick run across four
sessions, which is precisely why it never looked wrong — a DCA signal appearing
constantly is what DCA is *supposed* to look like at a glance.

Fixed at the fill, not the proposal: a refused DCA has not had its buy yet, so
it should be free to ask again. The stamp **merges** into the baton, because
`setState` writes the whole document and the baton also carries the agent,
market and size the desk restores on boot.

Verified end to end with a real fill: DCA chosen → `0xa0daed77…` mined →
`dca_last_ms` stamped → `agent`/`market`/`sizeUsd` all preserved → the next
evaluation gated. And a rebalance-won tick correctly does **not** stamp it.

Suite checks **X5** (the gate gates: silent at 1 minute and 23h, proposes at
25h) and **X6** (a dca fill stamps, merging rather than replacing).

### On the interruption

This run was blocked partway by the machine's root volume filling to zero bytes,
which stops the Bash tool outright — it cannot create its own output file. The
audit was completed by inspection in the meantime and the fix deliberately held
back: an unverifiable change to the trading brain is exactly the one not to
ship, and an earlier fix this session would have liquidated the book had it gone
out untested. Space was reclaimed by truncating this session's own log, and the
fix was then verified against a real mined fill before being committed.

### A4 failed, and the fork was the reason — not the code

The first full re-run after the DCA fix came back **150 passed, 1 failed**: A4,
which requires the two routers to agree within 5%, measured **8.044%**.

Nothing in the DCA change touches quoting, so the cause was established before
anything was altered:

| | |
|---|---|
| fork pinned at | block 51,060,818 |
| live mainnet head | block 51,088,331 |
| behind by | **27,513 blocks ≈ 15 hours** |
| AERO on the fork | $0.6160 (frozen at the pin) |
| AERO live | $0.5701 |

Uniswap quotes the **frozen** pool; KyberSwap quotes **live mainnet**. AERO fell
7.45% during those fifteen hours, so the two necessarily diverged by ~8%. A4 was
reporting the age of the fork, not a fault in the router.

Fixed the condition rather than the threshold: the pin and the state cache were
cleared — the cache belongs to the old block and is worthless against a new one
— and the fork re-pinned at 51,088,348. The same quote then came back
**uniswap 43.8126 vs kyberswap 43.8205, a margin of 0.018%**.

Worth keeping in mind for the demo: a fork left running overnight will drift
away from live prices, and the aggregator comparison is the first thing to show
it. Re-pin before showing anyone.

### Re-pinning traded one hazard for another — and the second run is the fix

Clearing the state cache was necessary (a cache built at the old block is
worthless against a new one) but it left the fork **cold**, and `npm run warm`
only primes thirteen reads. The suite then made hundreds of distinct reads
against a rate-limited public RPC, and G3 arrived on cue: five sections crashed
with *"the Base node never came back"*, plus one of the new 90-second deadlines
firing on a stalled `/key`. **116 passed, 6 failed** — not one of them an
assertion about behaviour.

That run doubled the state cache on its way through, 2.1 MB → 3.96 MB, which is
exactly what `fork.sh` predicts: *"the second run starts warm and barely touches
the network."* Re-run on the warmed fork:

**151 passed, 0 failed, 1 skipped.** A4 at 1.848%, all six X checks green.

Worth writing down for anyone who re-pins before a demo: **budget a throwaway
run.** The first pass after a fresh pin is the one that fills the cache, and it
will look like the product is broken when it is only cold.

## U. The data the book stands on — the eighth run's axis

Seven runs audited what the pad *does* with its numbers and never once audited
where the numbers come from. `candles.mjs` is 81 lines with zero plan coverage,
and everything in section S stands on it: the trend gate that switches the whole
book off, the regime classifier, and the four indicators every strategy reads.

The question this section asks is one question in eight places: **Binance's
newest bar is still forming — does the code know?** A measurement defined over a
completed period (a mean volume, an average true range, a 200-day mean) must be
computed over completed periods. A measurement of *now* (price, RSI, the
dislocation from an EMA) should use the live bar. Confusing the two is not a
rounding error; it silently changes what a threshold means.

| # | Item | Correct means |
|---|---|---|
| U1 | Hourly candles are real, ordered and evenly spaced | ≥200 bars, newest last, every gap exactly 3,600,000 ms, `high >= low`, volume > 0 |
| U2 | The feed cache is keyed by its arguments | Same args → served from cache with no HTTP call; a different `limit` → a fresh fetch |
| U3 | A candle knows when its period ends | Every fetched bar carries a close time; the newest hourly bar's close time is in the future while the hour is running |
| U4 | The 200-day mean is 200 **printed** days | `sma200` computed over bars whose period has elapsed — never the in-progress day. The comment claiming "no lookahead" must be true |
| U5 | …and the live price is still the live price | `px` is the current (forming) close, so the gate compares *now* against the printed mean |
| U6 | Relative volume compares like with like | A completed hour's volume over the mean of the 20 completed hours before it. Never a partial hour over complete ones |
| U7 | …so the answer does not depend on the wall clock | relVol for a given hour is the same at :05 and :55. Two reads inside one hour agree |
| U8 | ATR measures completed ranges | `atrPct` over bars whose period has elapsed; a forming bar's compressed high−low never narrows the stop |
| U9 | `volume_thrust` can actually fire | With real feed data on a market whose completed hour exceeds 2.5× its 20-hour mean, the strategy fires. A threshold no live input can reach is not a threshold |
| U10 | The regime classifier is correct at its edges | <49 bars → `UNKNOWN`; monotonic rise → `TREND_UP`; monotonic fall → `RISK_OFF`; alternating → `CHOP`; perfectly flat → `CHOP`, never a divide-by-zero |
| U11 | A dead feed is reported, not hidden | A market whose Binance symbol 404s appears in `/scan` with an `error` and contributes no signal; the scan still returns 200 for the others |
| U12 | Indicators never emit NaN | Across every market in `/scan`, `rsi`, `emaGapPct`, `relVol`, `atrPct` are all finite |
| U13 | The gate's prose matches its verdict | `uptrend === true` iff the reason says "above"; the two can never disagree |
| U14 | Partial P&L is not presented as whole-book P&L | If a held position has no price in the feed, `/pad`'s `unrealised` says so rather than quietly reporting a subset as the total |

Constructed series with no close time (the suite builds those by hand for S3–S5)
must keep working unchanged — the completeness rule is a no-op when a bar cannot
say when it ends.

## Eighth full run — 2026-09-09, 130 items

**165 passed, 0 failed, 1 skipped** (E4 Groq, account-level). Sections A–T
re-verified unchanged; section U is new.

### The strongest strategy condition in the book could not fire — U6, U9

`relativeVolume` divided **the part of the current hour that had happened so
far** by the mean of twenty **complete** hours:

```js
const prior = candles.slice(-(window + 1), -1);   // 20 whole hours
return candles[candles.length - 1].volume / mean; // ...over a partial one
```

Binance returns the bar it is still writing as its last row, and nothing in the
codebase knew that. Measured across all six markets at 42 minutes past the hour
— the *favourable* two-thirds of the window — the reading came back **3.2× to
5.0× low**:

| market | as shipped | on completed bars | understated |
|---|---|---|---|
| ETH | 0.633 | 3.150 | 4.98× |
| cbBTC | 0.676 | 3.194 | 4.72× |
| EURC | 0.914 | 3.598 | 3.94× |
| VIRTUAL | 0.886 | 3.087 | 3.48× |

`volume_thrust` needs 2.5×. Four markets were genuinely over it and the pad read
all four as under 1.0. The one momentum condition xorr measured as positive on
both halves of the data — `up_vol2.5`, +0.170% in-sample / +0.101% held-out —
**could not fire in production at all**, and `stretch_capitulation`'s 1.8× gate
was in the same position. Not a threshold that rarely triggers: a threshold no
live input could reach, which is the same shape as `dca_last_ms` in the seventh
run and the two self-swaps before it — a mechanism that reads as working
precisely because silence is what a strict filter is supposed to look like.

The same root cause had two more heads:

- **U4** — the 200-day BTC mean averaged 199 printed days and one still being
  written. The comment above it claimed *"entirely of bars that have already
  printed, so there is no lookahead."* That was aspirational. It moved the mean
  $54 (0.077%) on the day it was measured, which does not flip today's verdict
  but silently decides the gate whenever price sits near the line.
- **U8** — `atrPct` averaged the forming bar's compressed high−low, narrowing
  every stop by however far into the hour the scan happened to run.

**The fix is one idea in one place.** Candles now carry `tClose`, and
`closedBars()` drops a trailing bar whose period has not elapsed. Measurements
of a *completed period* — mean volume, true range, a 200-day mean — take it;
measurements of *now* — price, RSI, distance from an EMA, `notFallingKnife`'s
"is it still falling" — deliberately keep the live bar. A constructed series
whose bars carry no close time passes through untouched, so the hand-built
fixtures in S3–S5 still mean what they meant.

Verified in the running product, not just the suite: `/scan` now returns
`volume_thrust` on EURC at 3.6× volume, confidence 0.73, with its measured
provenance attached — a strategy that returned nothing on every previous run.

### A number covering part of the book read exactly like the whole — U14

`/pad`'s `unrealised` skipped positions the candle feed could not price and
reported the remainder as the book's P&L. The pad prints that figure flat, with
no way to know it covered two positions of three. It now withholds the number
when it cannot cover everything held, and says why in `unpriced` — the same
reasoning the file already applied one line above, where a missing cost basis
yields null "rather than a zero the pad would render as flat". Proven both ways:
an unpriceable DEGEN position turns `unrealised` null with `unpriced: 1`, and
archiving it brings the figure back.

### My own expectation was wrong again — U8

Written as "`atrPct(h)` and `atrPct(closedBars(h))` must be identical", which
they are not and should not be: ATR is deliberately normalised by the **live**
price, because the stop is a share of what you would pay now. The property
actually worth asserting is that the forming bar's *range* is invisible — so U8
now triples that bar's high−low and requires the answer to move by exactly zero.
It does. Fifth run running that one of my expectations, not the app, was the
thing that was wrong.

### And four failures that were mine, not the code's

B18, B18b, P3 and S4 failed on the first pass with empty transcripts and 0.00s
audio. Cause: I restarted the backend as a bare `node main/server.mjs`, and the
`.env` lives at the repo root where **`electron.mjs`** loads it — so the process
came up with no Deepgram key. Started as `node --env-file=../.env main/server.mjs`
they all pass. Worth knowing: the backend does not read `.env` itself, the
desktop shell does, and a hand-started backend is a backend with no credentials
and no pad token (it mints a random one, which is exactly what the shell's own
comment warns about).

## V. Two things at once — the ninth run's axis

Eight runs tested this pad the way a person uses it: one key at a time, one
request, one answer. Every guard in the execute path was written for that, and
`/tick` is an open HTTP POST that anything can fire twice.

`decide()` reads `spent_today`, and the fill that changes it is journalled
several `await`s later. Anything that overlaps inside that window reads the same
pre-fill number. The daily cap — the one limit that is supposed to be
un-arguable — is a check-then-act with nothing serialising it.

| # | Item | Correct means |
|---|---|---|
| V1 | Concurrent ticks cannot outspend the day | N simultaneous `/tick` against a cap of C never execute more than C in total. The surplus rejects with "daily budget exhausted" |
| V2 | …and the rejection is the real one | Refused ticks carry `verdict.action === "REJECT"` and the budget reason, not a crash, a timeout, or a silent `fill: null` |
| V3 | The budget is enforced when it signs, not when it proposes | A tick that waits behind another re-reads the spend it waited for, and clamps or refuses against the *current* number |
| V4 | The human path and the automated one share the limit | A `YES` and a `/tick` overlapping cannot both spend the last of the day |
| V5 | Two simultaneous `YES` still cannot double-fill | Exactly one fill, one `nothing pending`. **Already covered by G6** — kept as an explicit statement of the property, not counted as new ground |
| V6 | A failed execution releases the lock | An execution that throws leaves the next one able to run; the server does not wedge |
| V7 | Reads never queue behind a trade | `/pad`, `/health` and `/scan` answer while a swap is in flight. The pad's status light must not go dark because a trade is executing |

Reproduced before writing this: four concurrent `/tick` calls against a $50/day
cap produced **four real signed fills and zero rejections**.

## Ninth full run — 2026-09-10, 137 items

**172 passed, 0 failed, 1 skipped** (E4 Groq, account-level). Sections A–U
re-verified; section V is new.

### The daily cap was a check-then-act, and `/tick` is an open POST — V1–V4

`runOnce` read `spent_today`, ran it through `decide()`, and then `await`ed a
swap before the fill that moves that number was journalled. Nothing serialised
that window. Reproduced with real signed transactions before any fix:

```
4 concurrent POST /tick, $50/day cap
  -> 4 EXECUTE, 0 REJECT, 4 real fills
     0xaac41d…  0x537efc…  0xc26285…  0x9b851f…
```

Every one of the four read the same pre-fill spend, every one cleared the same
cap, every one signed. The daily limit is the one number on this pad that is
supposed to be un-arguable, and two clicks defeated it.

**`main/lock.mjs`.** A queue rather than a refusal, deliberately: refusing the
second caller would throw away an operator's ✓ whose pending proposal is already
cleared by the time the lock is reached, and losing a confirm costs more than
waiting for one. But queueing alone is not the fix — an execution that waits and
then acts on the budget it read *before* it waited spends money that is already
gone. So callers re-read the day's room **inside** the lock and clamp against
the current number, exactly as `decide()` step 4 and 6 do. Both execute paths
take it: the automation tick and the human `YES`, because they spend the same
day's money.

After: `4 at once · $25 -> $55 against a $55 cap · 3 fill(s), overspend $0.00`
— the three that fit each re-read the remaining room and clamped ($25, then the
last $5), and the fourth was refused citing the budget. V4 shows the same for a
`YES` and a tick landing together: `$55 -> $85 against $85`.

### What was actually new here, and what was not

The suite already had **G6 "concurrent confirm fills exactly once"**, so
concurrent *confirm* was covered and V5 restates it rather than extending it.
The double-fill guard is race-safe by construction anyway — `state.pending` is
cleared synchronously, with no await between the read and the clear. What had
never been tested is the **budget** under concurrency, and that is where the
hole was.

### Both of my new checks were wrong before the code was — V2, V7

- **V2** asked "was anything refused for the budget?" without handling the case
  where no tick proposed anything at all. On a pass where the book was quiet it
  read `0 fill(s)` and failed an app that had done nothing wrong. Rewritten to
  set the cap to *zero room* and assert the only correct outcome — no fills, and
  every verdict that exists is a budget REJECT — while reporting a quiet book as
  a quiet book instead of counting it as agreement.
- **V7** sampled `slowDone` *after* `await slow`. Awaiting the holder is what
  makes it finish, so the flag could only ever say "done" and the check could
  only ever fail. Sampled before the await it passes at 3 ms with the lock still
  held. Sixth run running that one of my own expectations, not the app, was the
  thing that was wrong.

### The fork had drifted overnight, again

The pin from 2026-09-09 was 14,209 blocks (~8 h) behind by morning and had
pushed A4 to **4.700%** against a 5% bar — a hair from failing for exactly the
reason the seventh run diagnosed. Re-pinned to 51,102,781: **0.031%**, and after
the run's own trading, 0.159%.

Note `fork.sh` refused `mainnet.base.org` at that block ("will not serve state")
and fell through to blastapi on its own — the upstream list earning its keep.
And the re-pin cost its throwaway run exactly as the seventh run said it would:
**136 passed, 8 failed**, six of them `the Base node never came back`. The
re-run on the warmed cache was clean.

## Y. What the pad thinks it owns — the tenth run's axis

Nine runs audited what the pad decides and how it executes. None asked whether
the position it writes down afterwards is the position it actually has.

`applyFill` derives quantity as `usd / price` — the *quoted* price — while the
swap that just ran returns `received`, the real token delta measured from
balances before and after. Everything downstream reads the written-down number:
`avg_entry_usd` is computed from it, the momentum and grid agents measure drift
against that average, the P&L on the desk and on the pad divide by it.

| # | Item | Correct means |
|---|---|---|
| Y1 | A buy records what the chain gave | Store qty increases by exactly `fill.received`, matching the on-chain balance delta to full token precision |
| Y2 | …and what it actually cost | Cost basis uses the amount really sent (`fill.sold`), not the size that was proposed |
| Y3 | A clamped buy records the clamp | When a proposal is cut to the wallet balance or the day's remaining room, the recorded cost is the reduced one |
| Y4 | Two buys average correctly | After buys of (q₁,c₁) and (q₂,c₂), `avg_entry_usd == (c₁+c₂)/(q₁+q₂)` computed from the real fills |
| Y5 | A partial sell leaves the right quantity | Remaining store qty equals the on-chain balance after the sell |
| Y6 | …and does not move the cost basis | Selling part of a holding leaves `avg_entry_usd` unchanged — realising a gain is not a re-pricing of what remains |
| Y7 | A full exit archives and leaves nothing | The dust rule fires, the position is archived rather than deleted, and no phantom residual is reported |
| Y8 | The pad never claims tokens it does not hold | For every open position, remembered qty ≤ on-chain balance for that symbol |
| Y9 | The desk and the store agree | `/portfolio` balances and the remembered positions describe the same holding |

Measured before writing this, on one real fill: the chain gave
**45.75216105 AERO**, `fill.received` reported exactly that, and the store wrote
down **45.80219242** — **0.109% of phantom tokens from a single trade**, with
the correct figure available at the call site and discarded.

## Tenth full run — 2026-09-10, 146 items

**181 passed, 0 failed, 1 skipped** (E4 Groq, account-level). Sections A–V
re-verified; section Y is new.

### The pad wrote down a position it did not have — Y1

`applyFill` derived quantity as `usd / price`: the size that was *proposed*
divided by the price that was *quoted*. The swap that had just run returned
`received` — a real balance delta measured either side of the transaction — and
both call sites threw it away.

Measured on one AERO buy:

```
chain actually gave    45.75216105 AERO
fill.received          45.75216105      ← the right answer, at the call site
store wrote down       45.80219242      ← +0.05003137, +0.109%
```

0.109% of tokens the pad did not own, from a single trade, compounding on every
buy. And the error does not stay in the ledger: `avg_entry_usd` is computed from
that quantity, the momentum and grid agents measure drift against that average,
and both P&L readouts divide by it. A wrong quantity becomes a wrong cost basis
becomes a wrong decision.

The same call also passed `usd: p.verdict.sizeUsd` — the size *before* the two
clamps just above it, to the day's remaining room and to the wallet balance. A
trade cut from $100 to $7 recorded a $100 cost basis.

**Both fixed by reading the fill instead of the proposal.** `fill.received` is
the quantity on a buy and the proceeds on a sell; `fill.sold` is the cash on a
buy and the quantity on a sell. The estimate survives only as a fallback for a
caller with no transaction to read, which is the best available answer when
there is genuinely nothing to consult. After: `chain +45.75210171 · store
+45.75210171 · drift -2.8e-14`.

The arithmetic around it now has proof rather than assumption: a $25 buy of 12.5
units followed by a $40 buy of 16 gives `$65 / 28.5 = $2.28070175` exactly; a
partial sell removes quantity without re-pricing what remains (realising a gain
is not a re-pricing); a full exit archives rather than deletes; and no open
position may claim more than the chain holds.

### U9 was measuring the weather — my check, not the app

Written in the eighth run as `top.rv >= 1.0`, which asserts that the market is
busy while the suite happens to run. On a quiet morning every market sat under
1.0x and U9 failed an app that had done nothing wrong — measuring the fixture,
exactly what the note above G6 warns about.

Reachability is a property of the measurement, not of the weather, so it is now
proved on a series built to meet every one of `volume_thrust`'s conditions:
**fires at 3.0x, silent at 2.0x**, threshold 2.5x. The live feed is only
required to produce finite, positive numbers. Seventh run running that one of my
own checks, rather than the code, was the thing that was wrong.
