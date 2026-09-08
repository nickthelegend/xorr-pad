# xorr-pad — test plan

Every component and every flow, each with an explicit definition of *correct*.
Executed against the running product: real backend, real anvil fork of Base
mainnet, real SQLite store on disk, real Deepgram and Claude Code calls, driven
through a real browser.

A pass means the observed result matches the stated expectation exactly, with a
clean console and no unexpected non-2xx response. "The button did something" is
not a pass.

**Environment under test:** `CHAIN_MODE=fork`, anvil fork of Base mainnet on
`:8545`, backend on `:8080`, `PAD_TOKEN=xorrpad-dev`, Sibyl store at
`/tmp/xorrpad-server.db`.

---

## A. Shell and design system

| # | Item | Correct means |
|---|---|---|
| A1 | Page loads | 200, `<title>xorr-pad</title>`, six panes render: Decision, Holdings, Markets+deck, The book, Memory, Activity |
| A2 | Header | Wordmark plus four legends: chain `Base fork`, state `armed` (green), agent, block `n>0`, and the agent's 0x address |
| A3 | Self-hosted fonts | Both `/fonts/*.woff2` return 200 `font/woff2`; `document.fonts` reports Archivo **and** Azeret Mono `loaded`. No CDN request for type |
| A4 | Font path traversal | `/fonts/../../package.json` does not serve a file |
| A5 | Type scale | Exactly the four declared sizes reach the page: 11 / 16 / 20 / 25px. Prose never below 16px, functional labels never below 11px |
| A6 | Tabular numerals | Every `.mono`, `.num`, `.trow` and `.stat b` computes `font-variant-numeric: tabular-nums` |
| A7 | Accent law | Only `#22C55E`, `#EF4444`/`#F26A6A` and `#D8A03A` appear as accents; no fourth hue |
| A8 | Deck | Exactly 15 keys in 5 columns; BUY/YES green, SELL/NO/KILL red, BASE/SCAN light; active agent outlined amber |
| A9 | Deck is stable | The deck's DOM is built once: node identity survives a 4s poll (a rebuild drops clicks and focus) |
| A10 | Ticker casing | The market rail shows `cbBTC`, not `CBBTC` — uppercase must not leak from the deck |
| A11 | Empty states | Decision reads "Nothing in hand…"; Activity reads "Nothing yet. Press a key." |
| A12 | Responsive | At 1600x1000 the deck, every market tab and the decision are fully visible without scrolling (panes with unbounded content — the Activity log — scroll internally, which is correct); <=900px wide single column; <=900px tall the grid releases and the page scrolls; no horizontal overflow at any width |
| A13 | Reduced motion | Under `prefers-reduced-motion` the scan stagger is removed |
| A14 | Console | Zero errors and zero unhandled rejections across the whole session |
| A15 | Network | Zero non-2xx except the deliberate 401s in G2 |
| A16 | Detector | `detect.mjs` returns zero findings across the repository |

## B. HTTP API

| # | Item | Correct means |
|---|---|---|
| B1 | `GET /health` no auth | 200 `{ok:true, mode:"fork", agent, armed, pending}` |
| B2 | Auth enforced | `GET /memory` with no token -> 401 `{"error":"bad pad token"}` |
| B3 | `GET /memory` | 200 with `limits, positions, rules, watchlist, baton, journal_recent` |
| B4 | `GET /portfolio` | 200; `chain.chainId===8453`, `chain.mode==="fork"`, numeric balances, `prices` for all six markets, no bigint crash |
| B5 | `GET /markets` | 200; 6 listed with class+fee+address, 6 delisted each with a reason string |
| B6 | `GET /log` | 200 `{log:[{t,m}]}` — server-side history, so pad presses appear |
| B7 | `GET /pending` | With a live decision: `{pending:true, signal, verdict}`. Without: `{pending:false}` |
| B8 | `POST /key` six agents | Each returns `{ok:true, agent}`; `/health.agent` follows; `state:baton` persists |
| B9 | `POST /key` market switch | `{id:"EURC"}` -> `{ok:true, market:"EURC", class:"forex"}`; case-insensitive; baton updates |
| B10 | `POST /key` delisted market | `{id:"DEGEN"}` -> `{ok:false}` with the measured reason in the error |
| B11 | `POST /key {id:"buy"}` | 200 with `signal` + `verdict`; `verdict.why` cites >=1 remembered fact; `awaiting:"yes/no"` when EXECUTE |
| B12 | `POST /key {id:"yes"}` | 200 `{fill:{hash:0x…64, status:"success", received>0}}`; position in memory increases; journal grows |
| B13 | `POST /key {id:"no"}` | 200 `{rejected:true}`; journal records it; pending cleared |
| B14 | `POST /key {id:"yes"}` no pending | 200 `{ok:false, error:"nothing pending"}` — no 500 |
| B15 | `POST /key` unknown | 200 `{ok:false, error:"unknown key 'nonsense'"}` |
| B16 | `POST /key {id:"kill"}` | 200 `{armed:false}`; `/health.armed===false` |
| B17 | `POST /arm` | 200 `{armed:true}`; any pending ✓ survives the disarm |
| B18 | `POST /panic` | 200 `{armed:false}`; pending cleared |
| B19 | `GET /scan` | 200 `{gate, markets[6], signals[], summary}`; every market carries rsi/emaGap/relVol/regime or an error |
| B20 | `POST /tick` | 200 with `signals` array; a real fill or a reasoned REJECT, never an unhandled throw |
| B21 | `GET /reflect` | 200 `{proposals, sibylLearner, journalDepth}` |
| B22 | `POST /reflect/accept` | 200; rule persists as `entity:rule/<id>` with `accepted:true`; `decide()` then vetoes a matching signal |
| B23 | `/reflect/accept` bad body | 400 `{error:"body must be {proposal:{id,…}}"}` — not a 500 |
| B24 | `POST /memory/wipe` | 200 `{removed:[3 paths], pendingVoided}`; subsequent `/memory` returns `limits:null`, `positions:{}` |
| B25 | `POST /memory/seed` | 200; limits restored to $100/$300 without a restart |
| B26 | `GET /nope` | 404 `{"error":"no such route"}` |
| B27 | `POST /voice` | 200, `content-type: application/octet-stream`, body >10KB, headers `x-transcript`, `x-reply`, `x-action` |

## C. On-chain (Base fork)

| # | Item | Correct means |
|---|---|---|
| C1 | Fork alive | `eth_chainId` = 8453; block > 0; real Base state readable (USDC totalSupply non-zero) |
| C2 | Quote | `quote("ETH","USDC")` returns a tier in `UNISWAP_V3.fees` and a sane USD price |
| C3 | Fee tier is the measured one | ETH quotes on the 0.01% tier recorded in markets.mjs, not a full 4-tier scan |
| C4 | Real fill, every class | A mined `status:"success"` fill on crypto (ETH, cbBTC), forex (EURC), defi (AERO, MORPHO) and ai (VIRTUAL); destination balance actually increases |
| C5 | Round trip | Buy then sell returns USDC to the wallet |
| C6 | Liquidity gate | A $100 DEGEN buy is refused **before signing** with `pool too thin: … would move the price N%` |
| C7 | Every listed market passes the gate | Impact at $200 <= 2% for all six |
| C8 | Insufficient balance | Over-spend throws `insufficient <TOKEN>: need X, have Y` — never an opaque `STF` |
| C9 | Over-size clamp | An ask above the wallet balance degrades to a real smaller fill, logged as `clamped to balance` |
| C10 | spendable("ETH") counts WETH | A buy settles in WETH, so it must be sellable |
| C11 | Mainnet guards | `CHAIN_MODE=mainnet` with no key refuses; with the anvil key refuses; auto-execute is fork-only |

## D. Memory (Sibyl)

| # | Item | Correct means |
|---|---|---|
| D1 | Real persistence | Data written by one process is read by a **new** process (real SQLite on disk) |
| D2 | Journal grows | Each proposal/decision/fill appends an event, monotonically |
| D3 | Wipe destroys | Removes db + `-wal` + `-shm`; a fresh process finds `limits:null`, 0 positions, 0 rules, 0 events |
| D4 | Store usable after wipe | A write immediately after a wipe succeeds |
| D5 | Load-bearing proof | `loadbearing.test.mjs` exits 0; >=3 of 4 verdicts change after a wipe; the control is unchanged |
| D6 | Fallback is stricter | `NO_MEMORY_LIMITS` < `DEFAULT_LIMITS` on both caps and allowlist |
| D7 | Reflection loop | 3+ journaled rejections produce a proposal; accepting it makes `decide()` REJECT a matching signal |

## E. External integrations

| # | Item | Correct means |
|---|---|---|
| E1 | Deepgram TTS | Real 200 and >10KB of linear16 |
| E2 | Deepgram STT | Real 200; synthesized speech transcribes back to text containing the order |
| E3 | Binance candles | 300 hourly OHLCV bars per market, volume > 0, `high >= low` |
| E4 | Claude Code brain | Answer tracks the remembered number and refuses to invent an untracked balance |
| E5 | Spoken order, any market | "buy twenty dollars of euro/bitcoin/virtuals" reaches `decide()` as the right symbol |
| E6 | Spoken question | A question is answered, never turned into a trade |
| E7 | Groq | **Expected blocked** — key valid, every model `model_permission_blocked_project/org`. Untestable, not pass |
| E8 | 1inch | **No API key** — route falls back to Uniswap V3. Untestable, not pass |

## F. Browser UI flows

| # | Item | Correct means |
|---|---|---|
| F1 | Agent key click | Button gains the amber outline; header agent changes; no console error |
| F2 | Market tab click | `aria-pressed` moves; amber top edge and amber price move; baton follows |
| F3 | SCAN click | The book renders a ruled table of six markets with a head row; summary and BTC gate line shown |
| F4 | BUY click | Decision shows `EXECUTE $n`, the order, and >=1 numbered footnote |
| F5 | Confirm click | Card settles to `FILLED <qty> <SYM>` + tx hash; Holdings and Memory update |
| F6 | Refuse click | Card settles to `REFUSED`; no fill; journal grows |
| F7 | WIPE click | Memory reads `none — forgotten`, positions none, journal 0; activity logs the wipe |
| F8 | Post-wipe decision | The same press yields a materially different verdict (size and reasons) |
| F9 | RE-TEACH appears | The button is hidden while limits exist, shown only when they are missing; clicking restores them |
| F10 | KILL click | State legend flips to `disarmed` (red) and becomes clickable |
| F11 | Re-arm via legend | Clicking the disarmed legend re-arms; the held ✓ still stands |
| F12 | Reflection in UI | With >=3 rejections a proposal row appears with ACCEPT; clicking persists the rule and it shows under learned rules |
| F13 | Pending survives refresh | Reload with a live decision: the card and its Confirm/Refuse return |

## H. The Electron desk app

| # | Item | Correct means |
|---|---|---|
| H1 | Launch | `electron .` boots the backend, binds :8080, prints the LAN URL and pad token, and opens the window |
| H2 | Port conflict | With :8080 already taken, the app shows a readable error and quits — it must never open a window onto a backend it did not start |
| H3 | Window loads | The window renders the same six-pane readout the browser does, at 1440x1000 on the `#0F100F` ground |
| H4 | Pad-triggered scan appears | A scan run from the pad (or any client) renders in the desk UI, not only in the tab that pressed it |
| H5 | Screenshot harness | `electron shots.mjs` drives the real app through eight states and writes real captures to `docs/images/app/` |

## G. Edge cases

| # | Item | Correct means |
|---|---|---|
| G1 | Empty-state render | Straight after a wipe every pane renders real text — no `undefined`, no blank pane, no exception |
| G2 | Bad token | `/?token=wrong` -> visible "Bad pad token" banner, panes fail closed, 401 not 500, **zero exceptions** |
| G3 | Wipe mid-flow | BUY -> WIPE -> YES must not fill against forgotten limits; `pendingVoided:true` and the balance is unmoved |
| G4 | Over-size order | Clamped to balance or refused readably; never an `STF` revert |
| G5 | Double confirm | Two confirms in a row: exactly one fill; the second says `nothing pending` |
| G6 | Concurrent confirm | Two simultaneous `yes` requests: exactly one fill, one `nothing pending` |
| G7 | Rapid market switching | Concurrent switches leave baton and the next proposal consistent |
| G8 | Kill stops the human path | While disarmed, Confirm is refused and the balance does not move |
| G9 | Malformed bodies | `/key` with no id, `/reflect/accept` with junk: 4xx or `{ok:false}`, never a 500 |

---

## Results

Run against the live product: backend on `:8080`, an anvil fork of Base mainnet
on `:8545`, a real SQLite store, real Deepgram and Claude Code calls, driven
through a real browser.

**94 of 96 items PASS. 2 are untestable for want of a credential and are marked
as such, not passed.**

- `node desktop/test/verify.mjs` — **80 pass, 0 fail**, 2 skipped, stable across
  three consecutive runs against the same accumulating store.
- `node desktop/test/loadbearing.test.mjs` — exits 0; 3 of 4 verdicts change on
  a wipe, control unchanged.
- Impeccable detector across the repository — **0 findings**.
- Browser sweep — **100/100 requests 200 OK, zero console messages** through
  scan, propose, confirm, refuse, wipe, re-teach, kill and re-arm.

| Section | Result |
|---|---|
| A. Shell and design system (16) | 16 PASS |
| H. Electron desk app (5) | 5 PASS |
| B. HTTP API (27) | 27 PASS |
| C. On-chain (11) | 11 PASS — a real mined fill on all four asset classes |
| D. Memory (7) | 7 PASS |
| E. External integrations (8) | 6 PASS, 2 UNTESTABLE |
| F. Browser UI flows (13) | 13 PASS |
| G. Edge cases (9) | 9 PASS |

**Untestable, not passed:**

- **E7 Groq.** The key is valid and lists 14 models, but every one returns
  `model_permission_blocked_project` or `_org`. That is a switch in the
  operator's Groq console, not something this repository can fix. The code tries
  the models the account actually exposes and, when they are all blocked, names
  the setting to change. Claude Code CLI is the brain meanwhile.
- **E8 1inch.** No `ONEINCH_API_KEY` exists in the environment. `ROUTE` reports
  `uniswap` and fills go direct to Uniswap V3. The 1inch path has never
  executed and is not claimed to work.

## Defects found and fixed in this run

| # | Found by | Defect | Fix | Re-verified |
|---|---|---|---|---|
| 1 | C4 | **A submitted transaction that never confirmed threw a raw viem timeout** and crashed the caller. A trading app cannot answer "did it fill?" with a stack trace. | `mined()` wraps every receipt wait, names the step and the hash, and states plainly that nothing was booked | PASS |
| 2 | B4 | **`balances()` made eight sequential RPC round trips** on every poll. Under concurrent trades this tipped the node over and `/portfolio` took 61s to fail. | All reads issued together | PASS — 61s to 4ms |
| 3 | B4 | The error path made **another RPC call before responding**, so a slow node produced an *empty* response instead of a readable one | Classify from the message; answer immediately with 503 | PASS |
| 4 | C6 | **The liquidity gate failed OPEN.** When a pool could not be quoted, `priceImpact` returned "fine" and the trade proceeded — exactly the trade the gate exists to stop. | A risk control that cannot measure now refuses, and says why | PASS — DEGEN refused at 56.4% |
| 5 | E2 | **"Buy" transcribed as "By" killed a real spoken order.** Deepgram returns the homophone often enough to matter. | "by" is accepted as the verb only when immediately followed by an amount; "by the way" and "I sat by the desk" still parse as not-orders | PASS — 7/7 cases |
| 6 | A15 | **A 503 emptied the Holdings pane silently**, which reads as "you hold nothing" rather than "we could not ask" | The node-unavailable state gets its own banner | PASS |
| 7 | A12 | The Memory pane overflowed its row by 17px, which reads as a clipped row rather than a scrolling pane | Tightened; the pane scrolls with a themed scrollbar, as the Activity log does | PASS |

**Infrastructure, diagnosed and documented rather than worked around:** the fork
kept dying mid-run. `base-rpc.publicnode.com` answers archive reads with HTTP 403
("Archive requests require a personal token") and **anvil panics on that**, so
the node died and every balance read began failing. `base.llamarpc.com` returns
525. `mainnet.base.org` serves archive but rate-limits hard. `desktop/fork.sh`
now starts the fork on the archive-capable upstream with anvil's request rate
throttled below the limit and the block pinned, and records why each alternative
fails.

## Defects found in the Electron pass

| # | Defect | Fix | Re-verified |
|---|---|---|---|
| 8 | **`start()` reported success before the port was bound.** It called `listen()` and returned, so with :8080 already taken the desk app printed its LAN URL, opened a window, and loaded *someone else's* backend — meaning the operator would confirm trades against a server they did not start. `EADDRINUSE` had no handler at all, so the error event was an uncaught exception. | `start()` awaits the bind and rejects with a readable message; Electron shows it and quits rather than opening a window it cannot back | PASS — conflict refused, clean launch binds and serves |
| 9 | **A scan run from the pad never appeared on the desk.** The server recorded it; the UI only rendered a scan the tab itself pressed — the same blind spot the Activity log had. | `GET /scan/last`, polled and rendered | PASS — the book fills in from a pad-triggered scan |
| 10 | Pane headings scrolled out of view, so a scrolling table lost the label saying what it was | Headings stick to the top of their pane | PASS |

## Defects found in the Sibyl-integration pass

Every one of these was found by running the product, not by reading it. All six
now have a check in `desktop/test/verify.mjs` section N, so they cannot come
back quietly.

| # | Defect | Fix | Re-verified |
|---|---|---|---|
| 11 | **`recall_brief` computed today's spend and then dropped it from the returned dict.** `decide()` fell back to summing "the last 10 journal events" — right today, wrong the moment a day holds more than ten trades, and silently so. | The bridge returns `spent_today`, measured over a bounded `read_events(since=local midnight)`. The window is local midnight, not UTC, so it agrees with the JS fallback instead of disagreeing by up to a day. | PASS — N1, `spent_today=125` straight from the store |
| 12 | **A closed position was never archived.** The close test was `newQty <= 1e-12`, but a round trip priced in USD never lands on exactly zero: buying $50 of ETH and selling $50 back left ~7e-7 ETH of dust, so the branch never fired. The pad went on claiming to hold 0.0000007 ETH forever, and `archived_entities` stayed empty. | Closed means *economically* nothing left — under a cent of value, or under a thousandth of what was held. | PASS — N2, a real round trip lands in the archive and the brief reports flat |
| 13 | **Selling an entire position reverted with the opaque string `STF`.** A JS double cannot hold an 18-decimal balance: `spendable()` rounded 201017173684167191602 wei to `201.0171736841672`, and parsing that back asked the router for **8398 wei more than the wallet owned**. | The swap clamps its input to the on-chain raw balance, and an `STF` is reported as what it is — the router could not pull the input — rather than as a liquidity problem. | PASS — N3, the full balance sells to the last wei, leaving 0.000000000000000000 |
| 14 | **Swaps intermittently ran out of gas.** viem sends exactly what `eth_estimateGas` returned; the swap then executes a block later against state that can cost more. One reverted at **145851 gas of a 147653 limit — 98.8% used**, no fill, gas burned. Replaying the identical call with a normal budget succeeded. | Every swap, approval and wrap estimates its own gas and adds a 30% margin. | PASS — N5, 12 consecutive swaps at 71–79% of limit, 0 failures |
| 15 | **A reverted swap reported the symptom, not the cause** — "swap mined but USDC balance did not move" — sending an operator hunting through liquidity. | A non-success receipt says the swap reverted on chain, names the hash, and says nothing was booked. | PASS — surfaced defect 14 in one run |
| 16 | **The store browser separated a heading from its rows.** Headings and rows were separate children of a two-column layout, so `archived — 1` sat at the foot of column one while its only row appeared at the head of column two, under the journal's heading. | Each tier is one block that cannot break; the journal, which may exceed a column, breaks internally but keeps its heading. | PASS — N4, and the captured screenshot |
| 17 | **A fresh fork could not trade at all.** anvil's account #0 holds no USDC in Base mainnet state, so the only quote asset the wallet ever had was whatever an earlier session left in `--state`. Round-trip a few times and it drained to dust; the next buy failed with "insufficient USDC", which reads as an app bug. | `fundOnFork` tops up the quote asset through the app's own Uniswap route, and the server does it at boot. | PASS — C0, and the boot line reports the balance |

**Two test-harness defects, which mattered as much:** one throwing section
**killed the remaining 30 checks** — each section is now guarded, so a crash is
a FAIL and the run continues. And `B7` asserted on ETH without ever selecting
it, so it depended on whichever market the *previous* run happened to end on:
it passed against a fresh store and failed on the second run against the same
one. It now names its market. Three consecutive runs against one accumulating
store: **80 passed, 0 failed** each time.
