# Sibyl Memory — usage audit

Audited 2026-09-08 against `sibyl-memory-client 0.8.0`, schema v4, free tier.
Every "GENUINELY USED" row below was confirmed by running the real flow against
the live app and observing the store change — not by grepping for the package
name.

---

## 1. What the sponsor actually ships

Four packages are installed in `.venv`:

| package | version | what it is |
|---|---|---|
| `sibyl-memory-client` | 0.8.0 | the SDK: SQLite-backed, FTS5, multi-tenant |
| `sibyl-memory-mcp` | 0.2.0 | an MCP server exposing 8 memory tools |
| `sibyl-memory-hermes` | 0.4.0 | credentials + `SibylMemoryProvider` |
| `sibyl-memory-cli` | 0.4.0 | `sibyl init/status/whoami/memory/health/…` |

**The schema has more tiers than the client exposes.** Tables present at v4:
`entities`, `entity_relations`, `state_documents`, `reference_documents`,
`journal_events`, `revenue_events`, `error_events`, `archived_entities`,
`flagged_actors`, `skill_proposals`, `learning_runs`, `search_shadow`, plus
FTS5 shadows for four of them.

`search()` accepts `tiers=("entity","state","reference","journal")` — four
searchable tiers. `entity_relations`, `revenue_events`, `error_events` and
`flagged_actors` have **no MemoryClient API** and are written by the SDK's own
subsystems; they are not reachable from an integration.

**Tier-gated on free:** `learn()`, `lint()`, `list_skill_proposals()` — all
raise `TierGateError`. **Works on free:** everything else, including
`archive_entity()` and `free_tier_status()`.

**The MCP server's 8 tools:** `memory_remember`, `memory_recall`,
`memory_search`, `memory_list`, `memory_forget`, `memory_set_state`,
`memory_get_state`, `memory_record_event`.

**`VerdictCode`** is a canonical vocabulary for *why* a search returned nothing:
`OK · ABSTAINED_ON · NEGATION_ABSTAIN · GATED · EMPTY_STORE · NO_MATCH`. The
distinction between `EMPTY_STORE` and `NO_MATCH` is the difference between "the
agent never knew" and "the agent knows, and the answer is no."

---

## 2. Honest status: is it genuinely used?

**Yes — deeply, and it is load-bearing rather than decorative.** Sibyl is not a
logging sink here: `decide()` in `desktop/main/decide.mjs` is built *only* from
what `recall_brief()` returns, so deleting the store provably changes what the
agent trades. That is asserted by a test that fails if the verdicts ever stop
diverging.

Architecture: `desktop/memory/sibyl_bridge.py` is a long-lived Python sidecar
speaking newline-delimited JSON over stdio; `desktop/main/memory.mjs` is the
Node client. **There is no in-memory fallback, on purpose** — if the store is
gone the agent must visibly degrade, because that is the product claim.

### Confirmed live

| capability | status | evidence from the run |
|---|---|---|
| `recall_brief()` | **GENUINELY USED** | 17 call sites; gates every decision. Recalled `$100/trade` |
| `set_reference` / `get_reference` | **GENUINELY USED** | `reference:risk/limits`, seeded and read back |
| `set_state` / `get_state` | **GENUINELY USED** | `state:baton` followed an agent change to `grid` |
| `set_entity` (position) | **GENUINELY USED** | fill `0x1d96dbe1…` wrote `entity:position/ETH` qty 0.02001 |
| `set_entity` (learned rule) | **GENUINELY USED** | `entity:rule/no-eth-sell-over-49` accepted on the pad |
| `delete_entity` | **GENUINELY USED** | closing a position removed the entity; `list_entities` → 0 rows |
| `list_entities` | **GENUINELY USED** | drives the store browser: `position`, `rule` |
| `write_event` / `read_events` | **GENUINELY USED** | journal 0 → 1 on a refusal; mined for rules |
| `search()` (FTS5) | **GENUINELY USED** | spoken *"Have I traded ETH before?"* → answered from the journal |
| `free_tier_status()` | **GENUINELY USED** | rendered in the store browser: bytes + tier |
| wipe (the demo) | **GENUINELY USED** | removes db + `-wal` + `-shm`; a fresh process finds nothing |

### Since first written — six of these now ship

This table listed the following as MISSING. They are live, and the evidence is
in the code rather than in this document:

| capability | status | evidence |
|---|---|---|
| `archive_entity()` | **GENUINELY USED** | closing a position archives it (`trader.mjs`), and decay retires a rule instead of destroying it (`reflect.mjs`). Three call sites |
| `read_events(since/until)` | **GENUINELY USED** | `eventsBetween()` gives decay a real window instead of "the last N and hope" |
| `set_entity(status=…)` | **GENUINELY USED** | a rule is `active` or `rejected` on Sibyl's own status column, not a flag inside its JSON, and the store browser shows it |
| `search(tiers=…)` filter | **GENUINELY USED** | `searchTiers(q, { tiers })` scopes the search |
| `VerdictCode` / `explain()` | **GENUINELY USED** | the spoken brain reads it: `EMPTY_STORE` produces "nothing has ever been recorded", `NO_MATCH` produces "no record of that" — two different sentences |
| MCP server (8 tools) | **GENUINELY USED** | wired in `.mcp.json`; the suite starts it over stdio, lists its 8 tools, and reads back an entity the pad wrote |

### Still not used

| capability | status | why |
|---|---|---|
| `learn()` | **BLOCKED, not faked** | `TierGateError: self-learning requires a paid tier`. Called, its report surfaced honestly, and journal-mined reflection ships instead |
| `lint()` / `Linter` | **MISSING** | tier-gated; never called |
| `list/accept/reject_skill_proposal` | **MISSING** | tier-gated. **We reimplemented this** in `reflect.mjs` rather than use the SDK's own proposal store |
| `search_entities()` | **DELIBERATELY DROPPED** | the client wrapped it with zero call sites, and `search_tiers` already searches entities *and* returns the verdict. An unused wrapper reads as integration that is not there, so it was removed rather than left to imply depth |
| `write_event(ts=…)` backdating | **MISSING** | never used. The suite backdates rules through `set_entity` instead |
| Multi-tenant (`set_tenant`) | **DELIBERATELY ABSENT** | one pad, one operator. Adding tenancy would be using the sponsor's API to look busy |
| Hermes `SibylMemoryProvider` | **MISSING** | installed, never imported |
| `sibyl` CLI | **MISSING** | never invoked by the app |

**Nothing is faked.** There is no mocked Sibyl response anywhere: the one
capability that cannot run (`learn()`) reports its real `TierGateError` to the
UI rather than pretending to have learned something.

### The honest weakness

The integration is **broad on the four writable tiers and shallow on the
paid-gated ones**. Two of the three weaknesses this section originally listed
have since been closed; the honest remainder is:

1. **We reimplemented Sibyl's own skill-proposal system.** `reflect.mjs` mines
   the journal for rules because `learn()` is paid-gated — defensible, but it
   means the SDK's `skill_proposals` table sits empty while we keep rules in
   `entity:rule/*`. This is the one that stands.
2. **The archive is outside the FTS index.** Closed positions are archived
   rather than destroyed (fixed), but `archived_entities` is a separate table,
   so `search()` cannot reach it. The spoken brain reads the archive directly
   for exactly this reason — a workaround, not a use of the search tier.
3. **Two shipped artifacts remain unimported** — the Hermes
   `SibylMemoryProvider` and the `sibyl` CLI. Neither has an obvious job here,
   but "installed and unused" is still a fair criticism.

**Closed since first written:** `archive_entity()` is now used — a closed
position is archived with what it was and what it closed at, the desk shows a
"closed positions" block, and the spoken brain can answer "have I ever held
AERO?" from it. And the MCP server is wired in `.mcp.json`, with the suite
starting it over stdio and reading back an entity the pad wrote.

---

## 3. Where deeper integration genuinely fits

Four surfaces where Sibyl would strengthen the product rather than decorate it:

- **Closed positions.** `archive_entity` instead of `delete_entity` gives a
  trade history the agent can reason over. Natural, free, currently thrown away.
- **The voice brain.** It already searches the journal; `VerdictCode` would let
  it say *"I have no record"* differently from *"I never knew"*.
- **Time-travel.** `read_events(since/until)` maps exactly onto "what did I do
  yesterday?" and onto per-day budget accounting, which currently re-scans.
- **The MCP server.** Pointing Claude Code at the same store the pad writes
  makes the memory genuinely shared between the agent and the operator's tools.

**Where it would be forced, and I am not proposing it:** wrapping chain state,
market candles or price history in Sibyl. That data is not the operator's
memory, it is public and re-fetchable, and storing it would be using the
sponsor's tech as a database to look busy.

---

## 4. Fifty features, ranked by how load-bearing Sibyl actually is

Ranked so the ones **impossible without Sibyl** are at the top and the ones
where it is swappable are at the bottom.

### Tier A — Sibyl is the feature (1–12)

| # | Feature | Capability | Depth | Why a judge notices |
|---|---|---|---|---|
| 1 | **Forget-and-watch**: wipe mid-demo, press the same key, see a different verdict | wipe + `recall_brief` | core | It *is* the judging criterion, demonstrated live rather than claimed |
| 2 | **Position archaeology**: closed trades archived, not deleted; "what did I hold in March?" | `archive_entity` + `archived_entities` | core | Uses a free capability the integration currently throws away |
| 3 | **Rule provenance chain**: every learned rule links to the journal events that produced it | `write_event` + `entity` + `search` | core | Shows memory *deriving* knowledge, not storing it |
| 4 | **"Never knew" vs "answer is no"**: spoken answers distinguish `EMPTY_STORE` from `NO_MATCH` | `VerdictCode` + `explain()` | core | Almost nobody uses the verdict vocabulary; it is the SDK's subtlest idea |
| 5 | **Time-travel replay**: scrub to a past timestamp, see the limits/positions the agent had *then* | `read_events(since/until)` | core | Temporal tier used as a time machine, not a log |
| 6 | **Yesterday's budget**: daily spend computed from a bounded event window | `read_events(since)` | core | Correctness depends on the temporal API |
| 7 | **Memory diff**: side-by-side of the store before and after a wipe | full store snapshots | core | Makes the 40% claim visual |
| 8 | **Contradiction finder**: surface rules that conflict with each other or with limits | `list_entities` + `search` | core | Reasoning *about* memory contents |
| 9 | **Cold-start briefing**: on boot the pad speaks what it remembers before accepting a trade | `recall_brief` + TTS | core | Recall as the first thing that happens, audibly |
| 10 | **Shared brain via MCP**: point Claude Code at the same store the pad writes | MCP server, 8 tools | core | The sponsor's own artifact, wired |
| 11 | **Per-market memory tenants**: each market is a tenant with its own limits and rules | `set_tenant` | core | Multi-tenancy is a headline SDK feature nobody exercises |
| 12 | **Rule decay**: rules unused for N days are archived with a reason | `archive_entity` + temporal | core | Memory that forgets deliberately, not by deletion |

### Tier B — Sibyl is the substrate (13–26)

| # | Feature | Capability | Depth | Why it lands |
|---|---|---|---|---|
| 13 | Ask the journal by voice: "what did I refuse yesterday?" | `search` + `read_events(since)` | deep | Natural-language over the temporal tier |
| 14 | Tier-scoped search: "search only my rules" | `search(tiers=…)` | deep | Uses the filter the API offers and we ignore |
| 15 | Position notes: attach a reason to every entry, recalled on exit | `set_entity` body | deep | Memory carrying intent, not just numbers |
| 16 | Watchlist tier: symbols to watch with the reason you added them | `entity:watchlist/*` | deep | A declared-but-empty category filled in |
| 17 | Regret log: refusals that would have been profitable, computed later | `read_events` + prices | deep | Journal read back for hindsight |
| 18 | Confidence calibration: measured hit-rate per strategy from journalled outcomes | `read_events` | deep | Turns the journal into a statistic |
| 19 | Session summaries written back as entities | `set_entity` + summarizer | deep | Uses `LocalDeterministicSummarizer` |
| 20 | Entity status lifecycle: `proposed → active → retired` on rules | `set_entity(status=)` | deep | A field the SDK has and we never set |
| 21 | "Why do I hold this?" — recall the signal that opened a position | journal + entity link | deep | Ties two tiers together |
| 22 | Duplicate-rule guard before accepting a proposal | `search_entities` | deep | Uses the unused search variant |
| 23 | Memory health pane: size, tier, cap headroom, row counts | `free_tier_status` + `count_rows` | medium | Surfaces the cap gate honestly |
| 24 | Backdated import of past trades into the journal | `write_event(ts=)` | deep | The timestamp override, used for real |
| 25 | Per-agent memory: each strategy keeps its own accepted rules | tenants or categories | deep | Six agents, six memories |
| 26 | Undo a wipe from the archive tier | `archived_entities` | deep | Archive as a safety net |

### Tier C — Sibyl is genuinely used but substitutable (27–40)

27 Voice recap of the last N decisions · `read_events` · medium
28 Search-backed autocomplete for market names · `search_entities` · medium
29 "Similar setup" recall when a signal fires · `search` · medium
30 Journal export to CSV for post-mortem · `read_events` · medium
31 Rule editor UI backed by entity bodies · `set_entity` · medium
32 Limit-change history · `set_reference` versions · medium
33 Per-day trade counter from the journal · `read_events(since)` · medium
34 Position P&L using remembered entry vs live price · `get_entity` · medium
35 "First time trading X" badge · `search` · medium
36 Memory-backed undo of the last accepted rule · `delete_entity` · medium
37 Store browser search box · `search` · surface
38 Journal filter by action type · `read_events` · surface
39 Recall latency shown in the health pane · timing around `recall_brief` · surface
40 Boot-time schema version check · `schema_version()` · surface

### Tier D — Sibyl is incidental; swappable for any store (41–50)

41 Remember the last selected market · `set_state` · surface
42 Remember trade size across restarts · `set_state` · surface (**already shipped**)
43 Remember window size · `set_state` · surface
44 Remember the last scan result · `set_state` · surface
45 Remember UI pane collapse state · `set_state` · surface
46 Cache the BTC trend gate between scans · `set_state` · surface
47 Remember the chosen theme · `set_state` · surface
48 Store the pad's LAN token · `set_reference` · surface — **do not build**, credentials do not belong in a memory store
49 Log every HTTP request to the journal · `write_event` · surface — noise that would drown the signal
50 Mirror chain balances into entities · `set_entity` · surface — **do not build**, it is public re-fetchable data, not memory

**41–50 exist to mark the line.** Anything below ~40 uses Sibyl as a key-value
store, which any file could do; a judge on this track will read that as a
checkbox. 48–50 are listed as explicit anti-features.


## Status after the build pass

Eleven of the twelve core features are built, wired into a product flow and
covered by a check in `desktop/test/verify.mjs` — sections N and O. Nothing here
is a stub; each one was verified against the running app with real fills on the
Base fork.

| # | Feature | Where it lives | Proof |
|---|---|---|---|
| 1 | Forget-and-watch | the Wipe key, and `loadbearing.test.mjs` | 3 of 4 verdicts change on a wipe |
| 2 | Position archaeology | `trader.mjs` archives on close; the store browser renders the tier | N2 |
| 3 | Rule provenance chain | `reflect.mjs` keeps the events; `decide.mjs` cites them in the veto | O2, O3 |
| 4 | "Never knew" vs "answer is no" | `voice.mjs` reads the `VerdictCode` | E3, and the spoken answer |
| 5 | Time-travel replay | `GET /memory/at?ts=`, and the Replay control | O9, O10, O11 |
| 6 | Yesterday's budget | `recall_brief` over `read_events(since=local midnight)` | N1 |
| 7 | Memory diff | settled at the wipe, `GET /memory/diff` | O14, O16 |
| 8 | Contradiction finder | `findContradictions`, shown in yellow above the store | O5 |
| 9 | Cold-start briefing | `GET /briefing`, the first line of the Memory pane | O1, O15 |
| 10 | Shared brain via MCP | `.mcp.json` points the sponsor's server at the pad's own store | O12, O13 |
| 11 | Per-market memory tenants | **not built** | — |
| 12 | Rule decay | `decayRules`, the "Retire unused rules" control | O6, O7, O8 |

**#11 is the honest gap.** Multi-tenancy would mean re-scoping every read and
write in the bridge, and a half-done tenancy change is the kind of thing that
silently splits a store in two. It is not built, and it is not claimed.

**What building #12 turned up:** the pad's own refusals were never journalled at
all. Only the operator's NO was recorded, so the store could not answer "what
did you turn down, and which rule did it" — and a rule that had just vetoed a
trade still looked as though it had never fired. Fixed, along with the
circularity it would otherwise have introduced: a refusal an existing rule
caused is no longer counted as evidence for mining that same rule.
