/**
 * decide.mjs — where memory stops being a database and starts being the agent.
 *
 * Every signal passes through here before anything is signed. The verdict is
 * built ONLY from what Sibyl remembers: the risk limits you set, the tokens you
 * allowlisted, the positions you already hold, the rules you accepted, and how
 * much you have already spent today according to the journal.
 *
 * Wipe the store and this function keeps working — but it forgets your limits,
 * forgets the rules you taught it, and forgets what you already own. That
 * difference is the product, and loadbearing.test.mjs asserts it.
 */
import { NO_MEMORY_LIMITS } from "./memory.mjs";

/** Sum today's executed USD out of the journal. */
export function spentToday(events = []) {
  const since = new Date(); since.setHours(0, 0, 0, 0);
  let total = 0;
  for (const e of events) {
    const acted = typeof e.acted === "string" ? safeParse(e.acted) : e.acted;
    if (!acted?.executed) continue;
    const ts = e.ts ? new Date(e.ts) : null;
    if (ts && ts < since) continue;
    total += Number(acted.usd) || 0;
  }
  return total;
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

/**
 * @param signal  from agents.evaluate*
 * @param brief   memory.recallBrief()
 * @returns {{action:'EXECUTE'|'REJECT', sizeUsd:number, why:string[], memoryUsed:boolean}}
 */
export function decide(signal, brief) {
  const why = [];
  let memoryUsed = false;

  // 1. Limits — remembered, or conservative defaults if memory is empty.
  let limits = brief?.limits;
  if (limits) {
    memoryUsed = true;
    why.push(`limits recalled from memory (max $${limits.max_trade_usd}/trade)`);
  } else {
    limits = NO_MEMORY_LIMITS;
    why.push(`NO remembered limits — falling back to a timid $${NO_MEMORY_LIMITS.max_trade_usd}/trade`);
  }

  // 2. Allowlist.
  const allow = limits.allow || NO_MEMORY_LIMITS.allow;
  if (!allow.includes(signal.symbol)) {
    why.push(`${signal.symbol} is not in the allowlist [${allow.join(", ")}]`);
    return { action: "REJECT", sizeUsd: 0, why, memoryUsed };
  }

  // 3. Rules you taught it (accepted proposals from reflection).
  for (const rule of brief?.rules || []) {
    memoryUsed = true;
    if (matches(rule, signal)) {
      why.push(`vetoed by remembered rule '${rule.id}': ${rule.text}`);
      return { action: "REJECT", sizeUsd: 0, why, memoryUsed };
    }
  }

  // 4. Daily budget, from the journal.
  const spent = spentToday(brief?.journal_recent || []);
  if (spent > 0) {
    memoryUsed = true;
    why.push(`$${spent} already executed today (journal)`);
  }
  const dayLeft = (limits.max_day_usd ?? NO_MEMORY_LIMITS.max_day_usd) - spent;
  if (dayLeft <= 0) {
    why.push("daily budget exhausted");
    return { action: "REJECT", sizeUsd: 0, why, memoryUsed };
  }

  // 5. Position awareness — never treat a held bag as a fresh entry.
  const pos = brief?.positions?.[signal.symbol];
  if (pos) {
    memoryUsed = true;
    // These lines get spoken aloud, so a raw float would be read out to
    // seventeen digits. Round to something a person would actually say.
    why.push(`already holding ${Number(pos.qty).toFixed(4)} ${signal.symbol} @ $${Math.round(pos.avg_entry_usd)}`);
  }
  if (signal.side === "SELL" && !pos) {
    why.push(`refusing to sell ${signal.symbol} — no remembered position`);
    return { action: "REJECT", sizeUsd: 0, why, memoryUsed };
  }

  // 6. Size clamp.
  let size = signal.sizeUsd;
  const cap = Math.min(limits.max_trade_usd ?? NO_MEMORY_LIMITS.max_trade_usd, dayLeft);
  if (size > cap) {
    why.push(`clamped $${size} -> $${cap}`);
    size = cap;
  }

  return { action: "EXECUTE", sizeUsd: size, why, memoryUsed };
}

/** A rule vetoes a signal when its fields all match. */
function matches(rule, signal) {
  if (rule.symbol && rule.symbol !== signal.symbol) return false;
  if (rule.side && rule.side !== signal.side) return false;
  if (rule.agent && rule.agent !== signal.agent) return false;
  if (rule.above_usd != null && !(signal.sizeUsd > rule.above_usd)) return false;
  return Boolean(rule.symbol || rule.side || rule.agent || rule.above_usd != null);
}
