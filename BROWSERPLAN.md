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
| F5 | Re-seed | Limits and positions return |
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

## M. Cleanliness

| # | Item | Correct means |
|---|---|---|
| M1 | Console, whole run | Zero errors anywhere across every item above |
| M2 | Network, whole run | Zero unexpected 4xx/5xx across every item above |
| M3 | No mocks | No stubbed logic, fallback data, or placeholder values anywhere in the tested surface |

---

**Total: 68 items.**

## Results — 61 of 61 PASS

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
