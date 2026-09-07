/**
 * reflect.mjs — turning what you did into what the pad knows.
 *
 * Sibyl ships its own self-learning, but it is gated to a paid tier
 * (TierGateError on free). The habit loop does not need it: the pad already
 * journals every proposal and every YES/NO, so the pattern is sitting in
 * memory. This reads that journal back and proposes rules you can accept on
 * the pad — after which decide() enforces them, and the pad stops asking.
 *
 * If the Pro tier is active, mem.learn() runs too and its report is included.
 */

const MIN_EVIDENCE = 3;   // how many times you must have said no

const val = (e, k) => {
  const v = e?.[k];
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
};

/** Mine the journal for habits worth turning into rules. */
export function proposeFromJournal(events = []) {
  const buckets = new Map();
  for (const e of events) {
    const ev = val(e, "evaluated"), ac = val(e, "acted");
    const sig = ev?.signal;
    if (!sig || !ac) continue;
    const rejected = ac.action === "REJECTED" || (ac.action === "REJECT" && !ac.executed);
    if (!rejected) continue;
    const key = `${sig.symbol}:${sig.side}`;
    const b = buckets.get(key) || { symbol: sig.symbol, side: sig.side, sizes: [], n: 0 };
    b.n++; if (Number.isFinite(sig.sizeUsd)) b.sizes.push(sig.sizeUsd);
    buckets.set(key, b);
  }

  const out = [];
  for (const [, b] of buckets) {
    if (b.n < MIN_EVIDENCE) continue;
    const smallest = b.sizes.length ? Math.min(...b.sizes) : null;
    // Propose the *narrowest* rule the evidence supports: only above the
    // smallest size you ever refused, so it never over-reaches.
    const above = smallest != null ? Math.max(0, Math.floor(smallest) - 1) : null;
    out.push({
      id: `no-${b.symbol.toLowerCase()}-${b.side.toLowerCase()}${above != null ? `-over-${above}` : ""}`,
      symbol: b.symbol, side: b.side, ...(above != null ? { above_usd: above } : {}),
      evidence: b.n,
      text: `you rejected ${b.n} ${b.symbol} ${b.side.toLowerCase()}s${above != null ? ` above $${above}` : ""}`,
    });
  }
  return out.sort((a, b) => b.evidence - a.evidence);
}

/** Proposals not already accepted, plus Sibyl's own learner when it is allowed. */
export async function reflect(mem) {
  const [events, brief, learned] = await Promise.all([
    mem.events(200), mem.recallBrief(), mem.learn().catch((e) => ({ ran: false, reason: String(e.message) })),
  ]);
  const known = new Set((brief.rules || []).map((r) => r.id));
  const proposals = proposeFromJournal(events).filter((p) => !known.has(p.id));
  return { proposals, sibylLearner: learned, journalDepth: events.length };
}

/** Accept a proposal: it becomes a rule decide() enforces from now on. */
export async function acceptRule(mem, proposal) {
  await mem.setEntity("rule", proposal.id, { ...proposal, accepted: true, accepted_at: new Date().toISOString() });
  await mem.journal({ evaluated: { proposal }, acted: { action: "RULE_ACCEPTED", executed: false } });
  return proposal;
}

export async function rejectRule(mem, proposal) {
  await mem.setEntity("rule", proposal.id, { ...proposal, accepted: false, rejected_at: new Date().toISOString() });
  return proposal;
}
