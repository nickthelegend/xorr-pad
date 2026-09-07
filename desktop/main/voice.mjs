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
const GROQ_MODEL = process.env.LLM_MODEL || "openai/gpt-oss-20b";
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
function groundIn(brief, market) {
  const pos = Object.entries(brief.positions || {})
    .map(([s, p]) => `${s} ${Number(p.qty).toFixed(5)} @ $${Math.round(p.avg_entry_usd)}`).join(", ") || "none";
  const px = Object.entries(market?.prices || {})
    .map(([s, v]) => `${s} $${Number(v).toFixed(2)}`).join(", ") || "unknown";
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
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ}`, "content-type": "application/json" },
    body: JSON.stringify({ model: GROQ_MODEL, max_tokens: 80, messages: [
      { role: "system", content: SYSTEM + "\n\n--- pad memory ---\n" + context },
      { role: "user", content: question }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `groq ${r.status}`);
  return j.choices?.[0]?.message?.content?.trim() || "";
}

export async function think(question, brief, market) {
  const context = groundIn(brief, market);
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
export function parseIntent(text, fallbackAgent = "momentum") {
  const t = (text || "").toLowerCase();
  const side = /\b(buy|long|add|accumulate)\b/.test(t) ? "BUY"
             : /\b(sell|short|dump|exit|close)\b/.test(t) ? "SELL" : null;
  if (!side) return null;
  const sym = ["ETH", "USDC", "CBBTC", "DEGEN"].find((s) =>
    new RegExp(`\\b${s === "CBBTC" ? "(cbbtc|bitcoin|btc)" : s.toLowerCase()}\\b`).test(t));
  const usd = parseAmount(t);
  if (!sym || usd == null) return null;
  return { agent: fallbackAgent, side, symbol: sym === "CBBTC" ? "cbBTC" : sym,
           sizeUsd: usd, reason: `spoken: "${text}"`, confidence: 1 };
}
