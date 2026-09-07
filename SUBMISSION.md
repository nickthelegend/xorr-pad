# xorr-pad — Sibyl hackathon submission

**An AI agent that trades on your desk.**

Repo: https://github.com/nickthelegend/xorr-pad

---

## What breaks when memory is deleted?

It forgets your risk limits, the positions you already hold, and every rule it
learned from your yes/no history — so it sizes blind against a built-in default
instead of your cap, it re-proposes trades you already rejected, and it refuses
to sell a bag it can no longer see.

## Memory walkthrough

**What we persist.** Risk limits and the token allowlist (`reference:risk/limits`),
open positions with average entry (`entity:position/<SYM>`), rules learned from
your yes/no history (`entity:rule/<id>`), the active agent (`state:baton`), and
a journal of every signal, decision and fill (`write_event`).

**How a fresh session recalls it.** One `recall_brief()` call returns limits +
positions + accepted rules + baton + recent journal. It runs before any trade is
priced, and the same brief is injected into the voice brain, so a cold start
already knows the book.

**The decision it changes.** `decide()` is built only from that brief: it clamps
size to the remembered cap, vetoes a signal that matches a learned rule, refuses
to sell an unremembered position, and subtracts today's journalled spend from the
daily budget. Wipe the store and the same signals produce different trades —
that is asserted in CI, not claimed.

```
$ node desktop/test/loadbearing.test.mjs

signal            WITH memory                              WITHOUT memory
A  DEGEN buy $80  REJECT  $0   vetoed by learned rule      EXECUTE $80
B  ETH buy $250   EXECUTE $40  clamped to remembered cap   EXECUTE $100  (default)
C  ETH sell $30   EXECUTE $30  position is remembered      REJECT  $0    (cannot see it)
D  cbBTC buy $20  EXECUTE $20  (control)                   EXECUTE $20   (control)

3 of 4 decisions changed when memory was deleted (control D unchanged).
memory is load-bearing: PASS
```

## Memory primitives used

`recall` · `entities` · `semantic search` · `temporal / time-travel` ·
`summarization` · `reflection` · `consolidation`

- **recall** — `recall_brief()` before every decision
- **entities** — positions, rules and the watchlist as first-class records
- **semantic search** — Sibyl's FTS5 `search()` across entities/state/reference/journal
- **temporal** — `write_event`/`read_events`; today's spend is computed from it
- **reflection / consolidation** — repeated rejections in the journal are mined into
  proposed rules you accept on the pad, after which `decide()` enforces them.
  (Sibyl's own `learn()` is wired but gated to a paid tier, so the loop is built
  on the journal and works on free.)

## Partner stacks

- **Base** — trades execute on Base through Uniswap V3. Development runs against a
  local **anvil fork of Base mainnet**, so fills use real contracts and real
  liquidity without spending real money. 1inch is wired behind `ONEINCH_API_KEY`;
  their aggregator is mainnet-only, which is exactly why the fork exists.
- **Virtuals** — not integrated.

## Honest limits

- The pad has at least one dead switch (`RUN`, matrix r2c1) and row 3 is unswept,
  so the desk app mirrors every key as a clickable control.
- Real-mainnet auto-trading is refused by design; it requires an explicit
  confirmation.
- Groq models are blocked at the project level on this account, so the spoken
  brain is the Claude Code CLI — which is also where Sibyl installs itself as a
  memory provider.
