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

## M. Cleanliness

| # | Item | Correct means |
|---|---|---|
| M1 | Console, whole run | Zero errors anywhere across every item above |
| M2 | Network, whole run | Zero unexpected 4xx/5xx across every item above |
| M3 | No mocks | No stubbed logic, fallback data, or placeholder values anywhere in the tested surface |

---

**Total: 61 items.**

## Results

Filled in during Phase 2, corrected in Phase 3, re-run in Phase 4.
