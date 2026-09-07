/**
 * candles.mjs — real hourly OHLCV, because the strategies need it.
 *
 * The ported strategies read EMAs, RSI, ATR and relative volume. None of that
 * can be computed from a spot quote, so the pad pulls actual hourly candles
 * from Binance's public endpoint (no key, no auth) for each market's reference
 * pair. The Base pool is where the trade fills; Binance is where the history
 * comes from. Every market in markets.mjs was chosen partly because a real
 * reference pair exists.
 *
 * Cached for the length of a candle — a strategy pass must not fire off eight
 * HTTP requests every tick.
 */

const BASE = "https://api.binance.com/api/v3/klines";
const TTL_MS = 5 * 60e3;
const cache = new Map();

/** @typedef {{t:number,open:number,high:number,low:number,close:number,volume:number}} Candle */

/** Hourly candles for a Binance symbol, newest last. */
export async function klines(binanceSymbol, { interval = "1h", limit = 300 } = {}) {
  const key = `${binanceSymbol}:${interval}:${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;

  const url = `${BASE}?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`binance ${binanceSymbol}: HTTP ${r.status}`);
  const raw = await r.json();
  if (!Array.isArray(raw)) throw new Error(`binance ${binanceSymbol}: unexpected payload`);

  const rows = raw.map((k) => ({
    t: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
  }));
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

/**
 * The market-wide trend gate.
 *
 * xorr measured this as the single most important filter in the book: buying a
 * >=6% dislocation returns +0.946%/trade while BTC is above its 200-day average
 * and -0.022% while it is below. Same signal, same instruments. So the pad asks
 * the same question, from the same kind of data — a 200-day SMA of daily closes,
 * entirely of bars that have already printed, so there is no lookahead.
 */
export async function marketUptrend() {
  const daily = await klines("BTCUSDT", { interval: "1d", limit: 220 });
  if (daily.length < 200) return { uptrend: false, reason: "not enough BTC history" };
  const closes = daily.map((c) => c.close);
  const sma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
  const px = closes[closes.length - 1];
  return {
    uptrend: px > sma200,
    px, sma200,
    reason: px > sma200
      ? `BTC $${Math.round(px).toLocaleString()} is above its 200-day mean $${Math.round(sma200).toLocaleString()}`
      : `BTC $${Math.round(px).toLocaleString()} is below its 200-day mean $${Math.round(sma200).toLocaleString()} — dip buying is switched off`,
  };
}

/**
 * Regime, for the strategies that only fire in a range.
 *
 * ADX-free and deliberately simple: compare how far price actually travelled
 * over the window against how far it wandered. A high ratio is a trend, a low
 * one is chop.
 */
export function regimeOf(candles, window = 48) {
  if (candles.length < window + 1) return "UNKNOWN";
  const seg = candles.slice(-window);
  const net = Math.abs(seg[seg.length - 1].close - seg[0].close);
  let path = 0;
  for (let i = 1; i < seg.length; i++) path += Math.abs(seg[i].close - seg[i - 1].close);
  if (path <= 0) return "CHOP";
  const efficiency = net / path;            // Kaufman's efficiency ratio
  if (efficiency > 0.35) return seg[seg.length - 1].close >= seg[0].close ? "TREND_UP" : "RISK_OFF";
  return "CHOP";
}
