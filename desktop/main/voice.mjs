/**
 * voice.mjs — hold the mic key, talk, hear the answer.
 *
 *   PCM in -> speech-to-text -> a brain that has read memory -> text-to-speech
 *
 * Speech is Deepgram (verified working). The brain is whichever is available:
 *
 *   claude   the Claude Code CLI (`claude -p`). Preferred, because Sibyl wires
 *            itself into Claude Code as a memory provider, so the same store
 *            the pad writes is the one the model reads.
 *   groq     a Groq chat model, when GROQ_API_KEY has model access. On this
 *            account every model is currently blocked at the project level.
 *
 * Whatever answers, it is handed recallBrief() first — the spoken reply is
 * grounded in the same memory that gates the trades.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

const DG = process.env.DEEPGRAM_API_KEY || "";
const GROQ = process.env.GROQ_API_KEY || "";
// The models this account can actually reach, newest first. Groq retires model
// ids often, so try a list rather than pinning one that will 404 next month.
const GROQ_MODELS = (process.env.GROQ_MODEL || "").split(",").filter(Boolean).length
  ? process.env.GROQ_MODEL.split(",").map((m) => m.trim())
  : ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "groq/compound-mini", "qwen/qwen3.6-27b"];
const SR = 16000;

export const BRAIN = process.env.BRAIN || "claude";

/** raw 16-bit PCM -> a WAV Deepgram will accept */
export function pcmToWav(pcm, sampleRate = SR) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22); h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function stt(wav) {
  if (!DG) throw new Error("DEEPGRAM_API_KEY missing");
  const r = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true",
    { method: "POST", headers: { Authorization: `Token ${DG}`, "content-type": "audio/wav" }, body: wav });
  if (!r.ok) throw new Error(`stt ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  return j.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || "";
}

export async function tts(text) {
  if (!DG) throw new Error("DEEPGRAM_API_KEY missing");
  const r = await fetch(
    `https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=${SR}`,
    { method: "POST", headers: { Authorization: `Token ${DG}`, "content-type": "application/json" },
      body: JSON.stringify({ text }) });
  if (!r.ok) throw new Error(`tts ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return Buffer.from(await r.arrayBuffer());
}

/** The memory a spoken answer must be grounded in. */
// The pad trades assets from $0.64 to $79,000. Rounding to whole dollars said
// AERO was "at $1" out loud, which is simply a wrong number spoken with
// confidence — scale the precision to the magnitude, as the readout does.
function usd(v) {
  const n = Number(v);
  if (!isFinite(n)) return "unknown";
  const a = Math.abs(n);
  return "$" + n.toFixed(a >= 1000 ? 0 : a >= 100 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6);
}

function groundIn(brief, market) {
  const pos = Object.entries(brief.positions || {})
    .map(([s, p]) => `${s} ${Number(p.qty).toFixed(5)} @ ${usd(p.avg_entry_usd)}`).join(", ") || "none";
  const px = Object.entries(market?.prices || {})
    .map(([s, v]) => `${s} ${usd(v)}`).join(", ") || "unknown";
  return [
    `Risk limits: ${brief.limits ? `$${brief.limits.max_trade_usd}/trade, $${brief.limits.max_day_usd}/day, allowed ${brief.limits.allow.join("/")}` : "NONE REMEMBERED"}.`,
    `Open positions: ${pos}.`,
    `Learned rules: ${(brief.rules || []).map((r) => r.text || r.id).join("; ") || "none"}.`,
    `Prices: ${px}.`,
    `Active agent: ${brief.baton?.agent || "momentum"}.`,
  ].join("\n");
}

const SYSTEM =
  "You are the voice of xorr-pad, a trading deck on someone's desk. Answer in ONE short " +
  "spoken sentence, under 25 words, no markdown, no lists. You are given the pad's memory " +
  "— use it and cite the concrete number when it matters. Never invent a price or a balance.";

async function brainClaude(question, context) {
  const prompt = `${SYSTEM}\n\n--- pad memory ---\n${context}\n--- end memory ---\n\nOperator said: "${question}"`;
  const { stdout } = await exec("claude", ["-p", prompt, "--output-format", "text"],
    { timeout: 60000, maxBuffer: 1 << 20 });
  return stdout.trim().split("\n").filter(Boolean).pop() || "";
}

async function brainGroq(question, context) {
  const refusals = [];
  for (const model of GROQ_MODELS) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 80, messages: [
        { role: "system", content: SYSTEM + "\n\n--- pad memory ---\n" + context },
        { role: "user", content: question }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j.choices?.[0]?.message?.content?.trim() || "";
    const code = j?.error?.code || `http_${r.status}`;
    refusals.push(`${model}: ${code}`);
    // A blocked or missing model is worth trying the next one for; anything
    // else (bad key, rate limit) will fail identically on every model.
    if (!/model_not_found|model_permission_blocked/.test(code)) break;
  }
  // Say what is actually wrong and where to fix it, rather than "groq failed".
  const blocked = refusals.every((x) => /model_permission_blocked/.test(x));
  throw new Error(blocked
    ? `every Groq model is disabled for this project/org — enable them at ` +
      `console.groq.com > Settings > Model permissions. Tried: ${refusals.join(", ")}`
    : `groq unavailable — ${refusals.join(", ")}`);
}

// Spoken tickers get spelled out, and speech-to-text renders "E T H" as
// anything from "eth" to "e t h" to "an e t". Glue single-letter runs back
// together before matching so the pad hears a ticker as a ticker.
const glue = (s) => s.replace(/\b(?:[a-z][\s.]+)+[a-z]\b/g, (m) => m.replace(/[\s.]/g, ""));

// One alias set per tradeable market, spelled the way people actually say them.
const ALIASES = {
  ETH:     /\b(eth|ether|ethereum|eeth|aeth)\b/,
  USDC:    /\b(usdc|usd\s?c|you\s?s\s?d\s?c|dollars?coin)\b/,
  cbBTC:   /\b(cbbtc|bitcoin|btc|cb\s?btc|bit\s?coin)\b/,
  EURC:    /\b(eurc|euro|euros|eur|yuroc)\b/,
  AERO:    /\b(aero|aerodrome|arrow)\b/,
  MORPHO:  /\b(morpho|morfo|morph)\b/,
  VIRTUAL: /\b(virtual|virtuals|vertual)\b/,
};

/**
 * Pull the operator's own history into the answer.
 *
 * recallBrief() carries the current state: limits, open positions, accepted
 * rules. It does not carry what HAPPENED — and "have I bought AERO before?" is
 * a question about the journal, not the balance sheet. Sibyl's FTS5 search
 * spans every tier, so ask it with the question's own salient words and hand
 * the model what it finds.
 */
const STOP = new Set(["what","when","where","which","have","has","did","do","does","is","are","was",
  "the","a","an","my","me","i","you","of","in","on","at","to","for","and","or","how","much","many",
  "ever","before","again","any","it","that","this","tell","show","about","with"]);

async function recallHistory(mem, question) {
  if (!mem) return "";
  const raw = String(question).toLowerCase();
  // Speech-to-text hears "Arrow" for AERO and "virtuals" for VIRTUAL. Search
  // the store for the TICKER the journal actually wrote, not the word the
  // transcriber guessed, or the history is invisible to the question about it.
  const tickers = Object.keys(ALIASES).filter((sym) => ALIASES[sym].test(glue(raw)));
  const words = raw.replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w)).slice(0, 3);
  const terms = [...new Set([...tickers, ...words])].slice(0, 5);
  if (!terms.length) return "";
  try {
    const hits = await mem.search(terms.join(" "), 6);
    if (!Array.isArray(hits) || !hits.length) return "";
    const lines = hits.map((h) => {
      const when = h.ts ? String(h.ts).slice(0, 16).replace("T", " ") : "";
      const what = typeof h.snippet === "string" ? h.snippet.slice(0, 120) : JSON.stringify(h.body || {}).slice(0, 120);
      return `- ${h.tier}${h.category ? `/${h.category}` : ""} ${when} ${what}`;
    });
    const note = tickers.length
      ? `\nThe operator may have said a ticker the transcriber garbled; it resolves to ${tickers.join(", ")}. Answer about that ticker.`
      : "";
    return `${note}\nFrom your own history (searched for "${terms.join(" ")}"):\n${lines.join("\n")}`;
  } catch { return ""; }
}

export async function think(question, brief, market, mem = null) {
  const context = groundIn(brief, market) + (await recallHistory(mem, question));
  if (BRAIN === "groq" && GROQ) return brainGroq(question, context);
  try { return await brainClaude(question, context); }
  catch (e) {
    if (GROQ) return brainGroq(question, context);
    throw e;
  }
}

const WORDS = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, fifteen:15, twenty:20, thirty:30, forty:40, fifty:50, sixty:60,
  seventy:70, eighty:80, ninety:90, hundred:100, "a hundred":100, thousand:1000 };

/** "$50", "50 dollars", "fifty bucks", "two hundred" -> 50 / 50 / 50 / 200 */
export function parseAmount(t) {
  const digits = t.match(/\$\s*(\d+(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*(?:dollars|dollar|usd|bucks)\b/);
  if (digits) return Number(digits[1] ?? digits[2]);
  const two = t.match(/\b(one|two|three|four|five|six|seven|eight|nine)\s+(hundred|thousand)\b/);
  if (two) return WORDS[two[1]] * WORDS[two[2]];
  for (const [w, n] of Object.entries(WORDS))
    if (new RegExp(`\\b${w}\\b`).test(t)) return n;
  const bare = t.match(/\b(\d+(?:\.\d+)?)\b/);
  return bare ? Number(bare[1]) : null;
}

/** Does this sound like an order? Returns a signal, or null for chit-chat. */
export function parseIntent(text, fallbackAgent = "momentum", market = "ETH") {
  const raw = (text || "").toLowerCase();
  const t = glue(raw);
  // "buy" and "by" are homophones and speech-to-text picks the wrong one often
  // enough to kill a real order ("By $50 of ETH."). Accept "by" as the verb
  // only when it is immediately followed by an amount, where no other reading
  // exists — "by the way" and "go by" never match that shape.
  const buyish = /\b(buy|long|add|accumulate)\b/.test(t)
              || /\bby\s+\$?\d/.test(t)
              || /\bby\s+(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a\s+hundred|hundred)\b/.test(t);
  const side = buyish ? "BUY"
             : /\b(sell|short|dump|exit|close)\b/.test(t) ? "SELL" : null;
  if (!side) return null;
  const usd = parseAmount(t);
  if (usd == null) return null;
  // A clear "buy forty dollars" with a garbled ticker is still an order: the
  // pad always has an active market, so use it rather than dropping the trade
  // into chit-chat. The verdict still has to be shown and confirmed.
  const sym = Object.keys(ALIASES).find((s) => ALIASES[s].test(t)) || market;
  return { agent: fallbackAgent, side, symbol: sym,
           sizeUsd: usd, reason: `spoken: "${text}"`, confidence: 1,
           assumedMarket: Object.keys(ALIASES).some((s) => ALIASES[s].test(t)) ? undefined : market };
}
