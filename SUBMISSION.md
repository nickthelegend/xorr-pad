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
that is asserted on every push by
[`.github/workflows/memory.yml`](.github/workflows/memory.yml), not claimed.

```
$ node desktop/test/loadbearing.test.mjs

signal            WITH memory                                  WITHOUT memory
A  ETH buy $80    REJECT  $0    vetoed by remembered rule       EXECUTE $10   clamped $80 -> $10
B  ETH buy $30    EXECUTE $30   within the remembered $40 cap   EXECUTE $10   clamped $30 -> $10
C  ETH sell $30   EXECUTE $30   the position is remembered      REJECT  $0    cannot see the bag
D  ETH buy $8     EXECUTE $8    (control)                       EXECUTE $8    (control)

3 of 4 decisions changed when memory was deleted (control D unchanged).
memory is load-bearing: PASS
```

Every signal is ETH, and that is deliberate: a token that drops off the
allowlist when memory goes would change verdict for a second reason, and the
test would stop measuring the thing it exists to measure. The control is a
trade small enough to clear both envelopes, so it must never move.

## Memory primitives used

Only what the code actually calls:

| primitive | where it runs |
|---|---|
| **recall** | `recall_brief()` before every decision, and injected into the voice brain |
| **entities** | positions, accepted rules and the watchlist (`entity:position/<SYM>`, `entity:rule/<id>`) |
| **references** | risk limits and the token allowlist (`reference:risk/limits`) |
| **state** | the active agent and market (`state:baton`) |
| **temporal** | `write_event` / `read_events` — the journal every decision is mined from |
| **semantic search** | FTS5 across every tier, used to answer spoken questions about your own history ("have I traded AERO before?") |
| **reflection** | rules mined from the journal and accepted on the pad |

**Not used, and not claimed:** summarization and consolidation. Sibyl's own
`learn()` is called and its report is surfaced, but on the free tier it returns
`TierGateError: self-learning requires a paid tier`, so the reflection that
actually ships is ours — mined from the journal the pad writes.

- **recall** — `recall_brief()` before every decision
- **entities** — positions, rules and the watchlist as first-class records
- **semantic search** — Sibyl's FTS5 `search()` across entities/state/reference/journal
- **temporal** — `write_event`/`read_events`; today's spend is computed from it
- **reflection / consolidation** — repeated rejections in the journal are mined into
  proposed rules you accept on the pad, after which `decide()` enforces them.
  (Sibyl's own `learn()` is wired but gated to a paid tier, so the loop is built
  on the journal and works on free.)

## The other half: a pad on the desk

The desk app is one half. The other is a real **ESP32-S3 macropad** that drives
the same gated loop — 16 keys, a status light, and hold-to-talk.

It provisions itself: first boot raises a captive portal (`xorr-pad-setup`),
takes a backend URL and pad token, validates the URL before saving it, and
remembers both in NVS. No recompile to change networks. It then polls
`GET /pad` once a second and drives its light from the **backend's** state, not
its own guess — worst state wins: unreachable, stopped, decision waiting, memory
wiped, armed.

**Nothing on the pad can move money by itself.** BUY and SELL raise a decision;
only ✓ executes it, only while the backend says it is armed. The same gate
answers whether the key was pressed on the pad or on screen. KILL requires a
600 ms hold, because a brush against the key that stops all trading is not
acceptable.

The firmware is 1,198,327 bytes — 38% of the app partition — and the suite's
section P exercises the contract it depends on: the `/pad` poll (single-digit milliseconds warm against a 150 ms budget,
and it stays 200 with `chainOk:false` when the node dies, so the light never
goes dark on a blip), `/speak` returning raw 16 kHz PCM, every key id, and a
voice round trip where one second of silence returns `UNHEARD` rather than an
invented answer.

## Tokenized equities, and an honest refusal

Coinbase put tokenized stocks live natively on Base on 24 August 2026. Ten are
listed in `desktop/main/stocks.mjs`, each verified against real mainnet by
reading `symbol()` and `decimals()` back, with $599k–$2.23M of measured depth.

They are **not tradeable yet, and the pad says exactly why** rather than failing
vaguely. These are **B20 tokens, implemented by the Base node rather than as EVM
bytecode** — `eth_getCode` returns one byte, `0xef`. anvil forks state, and there
is no state here to fork, so on a fork every call reverts with `OpcodeNotFound`.
Measured the same day, same address: real mainnet answers `symbol() -> "NVDAc"`;
the fork throws. Tokenized equities therefore **cannot be demonstrated on a fork
at any block** — they are the one part of this product that needs real money.

Separately, their depth sits on a concentrated-liquidity pool this build cannot
route to (a custom factory plus Uniswap v4); the Uniswap V3 pair it *can* reach
holds $11k, too thin to use. Those are two different refusals and the pad never
conflates them.

## Partner stacks

- **Base** — trades execute on Base through Uniswap V3 `exactInputSingle` or the
  KyberSwap aggregator, whichever quotes better.
  Development runs against a local **anvil fork of Base mainnet**, so fills use
  real contracts and real liquidity without spending real money. Every fill is a
  signed, mined transaction; the route a fill reports is read back off the mined
  receipt's `to`, so it cannot claim a router it did not use.
- **Coinbase tokenized equities** — ten are listed and verified on real mainnet,
  and honestly refused rather than faked. See below.
- **KyberSwap** — a real DEX aggregator, integrated and routing, with **no API
  key and no signup**. It was written after noticing that "0x needs a key and
  1inch needs KYC" does not imply that *every* aggregator does. Every fill
  quotes both routers and takes the better one, keeping the loser's quote so the
  choice is auditable: KyberSwap led by 0.42% / 0.023% / 0.082% on AERO / ETH /
  cbBTC. It is also the only thing that can price the tokenized equities, whose
  depth sits on a concentrated-liquidity pool a direct V3 call cannot reach.
  When it fails — it refuses some senders, and it quotes live mainnet while a
  fork drifts from it — the fill falls back to the direct pool and says so.
- **1inch** — **not integrated.** There is no 1inch call in this codebase. Their
  API needs KYC/KYB; KyberSwap did the same job without it.
- **Virtuals** — VIRTUAL is one of the six tradeable markets; nothing deeper.

## Honest limits

- The pad has at least one dead switch (`RUN`, matrix r2c1) and row 3 is unswept,
  so the desk app mirrors every key as a clickable control.
- Real-mainnet auto-trading is refused by design; it requires an explicit
  confirmation.
- The spoken brain is the **Claude Code CLI**, driven with `claude -p` on a
  subscription rather than a metered API key, and invoked with every tool
  disallowed — the prompt embeds a speech transcript, so it must not be able to
  reach the filesystem of a machine holding a funded wallet. Claude Code is also
  where Sibyl installs itself as a memory provider.
  The Groq path exists in code, and the key authenticates — `GET /v1/models`
  returns 200 and lists the models. But **every** chat model on this account
  answers `403 model_permission_blocked_project` (a few, `…_org`), so no Groq
  model can actually be called. Enabling model access is an account-owner action
  in the Groq console, not a code change.
- **No mainnet transaction has ever been signed.** Every fill in this project is
  on a fork. The guards for mainnet are in place — the anvil key is refused,
  automation cannot fire, only a human ✓ executes — but the claim "it trades for
  real" is proven against forked mainnet state, not against mainnet.
- The firmware **compiles and its backend contract is covered by the suite, but
  it has never been flashed** — no ESP32 is connected to this machine. Wi-Fi
  provisioning, I2S capture, amp playback and matrix scanning are untested and
  are not claimed otherwise.
