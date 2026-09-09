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

**Total with sections O and P: 95 items.**

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
