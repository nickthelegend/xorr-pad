# DEMO.md — the three minutes

The run of show. Every line below was rehearsed against the running app on
2026-09-09; the timings and the quoted output are what it actually did, not what
it should do.

**The one thing to land:** *delete the memory and the same keypress produces a
different, worse decision.* Everything else is setting that up.

---

## Measured, not estimated

Two full rehearsals against the running app on 2026-09-09, back to back:

| beat | run 1 | run 2 |
|---|---|---|
| briefing | 3 ms | 2 ms |
| BUY → verdict with reasons | 4 ms | 3 ms |
| ✓ → real mined fill | 1,472 ms | 1,616 ms |
| wipe → the diff | 17 ms | 17 ms |
| briefing after the wipe | 2 ms | 3 ms |
| **the turn — the same BUY** | 6 ms | 6 ms |
| re-teach | 5 ms | 5 ms |
| spoken round trip | 14,018 ms | 13,451 ms |
| **total** | **17.0 s** | **16.8 s** |

Both runs landed the turn: `EXECUTE → REJECT`. The whole script runs in under
20 seconds of machine time — the three minutes are yours to talk in.

## Before anyone is watching

```bash
cd desktop && npm start
```

That is the whole setup. The app starts the Base fork itself (warm from a
shipped cache — about a second), starts the memory bridge, and opens the window.
First run asks for a Deepgram key; after that it does not.

Check three things and nothing else:

| Check | Want to see |
|---|---|
| `curl -s localhost:8080/health` | `"mode":"fork"` |
| the rail, bottom left | a block number, and a wallet address |
| press **SCAN** once | the book runs and reports |

If the block number is blank the fork did not come up — quit and relaunch before
anyone sits down. **Seed the store first** (`POST /memory/seed`) so there is a
history to forget; a demo of forgetting needs something to forget.

---

## 0:00 — What it is (20 seconds)

> "This is a trading agent that lives on a desk. It runs on Base, it signs real
> transactions, and the whole point is that it remembers you. There is a
> physical pad" — *hold it up* — "and every key on it does exactly what the
> screen does."

Do not explain the architecture. Show it.

## 0:20 — It tells you what it knows (20 seconds)

Press **PORTFOLIO**, or just read the note strip at the bottom of the desk.

> *"I remember your limits: $100 a trade, $300 a day. You are holding 75.2197
> AERO. $50 has already gone out today."*

> "It says that before it is trusted with anything. If it remembered nothing it
> would say *that* instead — and it does, in about a minute."

## 0:40 — A trade, with its reasons (40 seconds)

Take **AERO** in hand, size **$25**, press **BUY**.

The verdict comes back in **4 ms** with numbered reasons, every one of them
drawn from the store — the cap it clamped to, the position it already holds,
what has gone out today.

> "It has not done anything yet. Nothing on this pad can move money on its own."

Press **✓**.

**About a second and a half** later there is a mined transaction: a hash, a
block, a real balance movement. The route on the fill is read back off the receipt, so it cannot claim
a venue it did not use.

> "Real contracts, real liquidity, a real signed transaction on a Base mainnet
> fork — the only thing that is not real is the money. It quoted two routers and
> took the better one; the card says which, and by how much."

## 1:20 — **The turn.** Delete the memory (50 seconds)

Memory tab → **Wipe**. Let them watch the diff: what was lost, and what it cost.

Read the briefing again:

> *"I remember nothing — no limits, no positions, no rules. Until you teach me
> again I will refuse anything but the smallest trade."*

Now press **exactly the same BUY**.

> **REJECT — AERO is not in the allowlist [ETH, USDC]**

> "Same key. Same market. Same size. It executed a minute ago and it refuses
> now, because the only thing that changed is what it remembers. That is not a
> slogan on a slide — it is a test that runs on every push, and it fails the
> build if the verdicts stop diverging."

**This is the moment the demo exists for.** Do not rush it and do not talk over
it.

## 2:10 — Teach it back (30 seconds)

Re-seed, or accept a rule from the Memory tab. Show a proposal mined from the
journal — *"mined from 3 of your own refusals"* — accept it, then watch the next
trade get vetoed by the rule you just accepted, cited by name.

> "It does not just store what you told it. It reads its own history back and
> proposes the rule, and once you accept it, it is cited by name in the refusal."

## 2:40 — Say it out loud (20 seconds)

Hold **MIC** and say: **"Buy fifty dollars of ETH."**

It comes back spoken, as a decision waiting on a ✓ — same gate as the key.

> **Budget this honestly.** Rehearsed twice on 2026-09-09, the spoken round trip
> took **13.5 s and 14.0 s** — speech out, Deepgram back, the brain, then speech
> back again. Every other beat in this script is milliseconds; the fill is about
> 1.5 s. So this single step is most of a 20-second slot and can overrun it.
> Start talking while it works, or drop the beat.

If the room is loud, skip this. **Never re-run a failed voice take**; move on to
the close.

## 3:00 — Close

> "Six strategies ported from a measured book. Ten Coinbase tokenized equities,
> priced live from their own pools. A pad on the desk. And a memory you can
> delete to prove it was doing the work."

---

## If something breaks

| Symptom | Do this, out loud |
|---|---|
| A fill hangs | "The fork is fetching from a free public RPC." Press **SCAN** and keep talking; it recovers. |
| Voice mishears the ticker | It answers `UNCLEAR` and says which word it did not recognise — **that is the feature**. Say so and move on. |
| The chain reads stall | The rail shows it. Switch to the Memory tab; the whole memory story works with no chain at all. |
| Something is genuinely broken | Say so plainly and go to the Memory tab. The judged criterion is memory, and it does not need the chain. |

**Do not** improvise a live mainnet trade. There is no mainnet run behind this
build, and saying otherwise is the one thing that would undo the rest.

## The questions that will be asked

**"Is this actually on-chain, or simulated?"**
A fork of Base mainnet. Real contracts at their real addresses, real pool
liquidity, real signed transactions, real receipts. Not mainnet — no mainnet
transaction has been signed by this project, and that is in the README.

**"So why is memory more than a database?"**
Because the app derives from it rather than reading it back: it proposes rules
mined from its own journal, surfaces rules that can never fire, archives the
ones nothing needs, and can replay what it knew at a past timestamp. And because
deleting it changes the verdict — which is asserted, not asserted-to.

**"Can it trade stocks?"**
Ten tokenized equities are listed and priced from their own pools. It refuses to
trade them and says exactly why: they are B20 tokens implemented by the Base
node rather than as bytecode, so a fork answers `OpcodeNotFound` for every call
to one. The route exists — KyberSwap reaches the concentrated-liquidity pool
their depth sits on — so the only thing missing is mainnet.

**"What does the pad do that the screen doesn't?"**
Nothing — deliberately. Same backend, same gate, same refusals. The pad is where
the decision lands, not a second set of rules.
