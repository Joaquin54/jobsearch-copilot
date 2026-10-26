export type PayPeriod = "hour" | "day" | "week" | "month" | "year";

export type Pay = {
  min: number | null;
  max: number | null;
  currency: string;
  period: PayPeriod | null;
  raw: string;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "£": "GBP",
  "€": "EUR",
  "₹": "INR",
};

const SYMBOL_PREFIXES: Record<string, string> = {
  "ca$": "CAD",
  "us$": "USD",
  "au$": "AUD",
};

const CURRENCY_CODES: Record<string, RegExp> = {
  CAD: /\bcad\b/i,
  USD: /\busd\b/i,
  AUD: /\baud\b/i,
  GBP: /\bgbp\b/i,
  EUR: /\beur\b/i,
  INR: /\binr\b/i,
};

const PERIOD_PATTERNS: readonly (readonly [RegExp, PayPeriod])[] = [
  [/\b(?:per\s+hour|an?\s+hour|hourly|\/\s*hr|\/\s*hour|p\/h)\b/i, "hour"],
  [/\b(?:per\s+day|a\s+day|daily|\/\s*day)\b/i, "day"],
  [/\b(?:per\s+week|a\s+week|weekly|\/\s*week)\b/i, "week"],
  [/\b(?:per\s+month|a\s+month|monthly|\/\s*month|\/\s*mo)\b/i, "month"],
  [/\b(?:per\s+year|a\s+year|annually|annual|yearly|\/\s*year|\/\s*yr|per\s+annum)\b/i, "year"],
];

function detectCurrency(raw: string): string {
  const lower = raw.toLowerCase();

  // "CA$95K" must beat the bare "$" that follows it.
  for (const [prefix, code] of Object.entries(SYMBOL_PREFIXES)) {
    if (lower.includes(prefix)) return code;
  }

  // Word-bounded so "audit" is not AUD and "Europe" is not EUR.
  for (const [code, pattern] of Object.entries(CURRENCY_CODES)) {
    if (pattern.test(lower)) return code;
  }

  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.includes(symbol)) return code;
  }

  return "USD";
}

/**
 * Earliest match wins, not first pattern: "$55,000 a year - Full-time, 40 hours
 * per week" is a yearly salary, and the trailing "per week" belongs to the
 * hours, not the pay.
 */
function detectPeriod(raw: string): PayPeriod | null {
  let best: { index: number; period: PayPeriod } | null = null;
  for (const [pattern, period] of PERIOD_PATTERNS) {
    const match = pattern.exec(raw);
    if (match === null) continue;
    if (best === null || match.index < best.index) best = { index: match.index, period };
  }
  return best?.period ?? null;
}

/** "95K" -> 95000, "120,000" -> 120000, "25.50" -> 25.5 */
function toAmount(digits: string, suffix: string | undefined): number {
  const value = Number.parseFloat(digits.replaceAll(",", ""));
  return suffix?.toLowerCase() === "k" ? value * 1000 : value;
}

/**
 * Only numbers carrying money evidence count — a currency symbol or code
 * immediately before, or a K suffix. Without this, "…a year - Full-time, 40
 * hours per week" contributes 40 and "401(k) matching" contributes 401, both of
 * which then become the range minimum.
 */
const ANCHORED_AMOUNT =
  /(?:(?:ca|us|au)?\$|£|€|₹|\b(?:usd|cad|aud|gbp|eur|inr)\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?|(\d[\d,]*(?:\.\d+)?)\s*(k)\b/gi;

/**
 * "$128–148K/yr": the K on the upper bound governs both ends, so the lower one
 * is given its own before the amounts are read. Only a bare 1–3 digit lower
 * bound qualifies — "$95,000 - $120K" states its own magnitude and must stay
 * 95,000 rather than becoming 95,000K.
 */
const RANGE_SHARED_K =
  /(?<![\d.,])(\d{1,3}(?:\.\d+)?)(\s*(?:[-–—]|\s+to\s+)\s*(?:(?:ca|us|au)?\$|£|€|₹)?\s*\d[\d,]*(?:\.\d+)?\s*k\b)/gi;

export function parsePay(raw: string): Pay | null {
  const text = raw.trim();
  if (text === "") return null;

  const amounts: number[] = [];
  for (const match of text.replace(RANGE_SHARED_K, "$1K$2").matchAll(ANCHORED_AMOUNT)) {
    const digits = match[1] ?? match[3];
    if (digits === undefined) continue;
    amounts.push(toAmount(digits, match[2] ?? match[4]));
  }
  if (amounts.length === 0) return null;

  const period = detectPeriod(text);
  const currency = detectCurrency(text);
  const isUpTo = /\b(?:up\s+to|max(?:imum)?\s+of)\b/i.test(text);
  const isFrom = /\b(?:from|starting\s+at|min(?:imum)?\s+of|at\s+least)\b/i.test(text);

  const first = amounts[0] as number;
  if (amounts.length === 1) {
    if (isUpTo) return { min: null, max: first, currency, period, raw: text };
    if (isFrom) return { min: first, max: null, currency, period, raw: text };
    return { min: first, max: first, currency, period, raw: text };
  }

  const sorted = [...amounts].sort((a: number, b: number): number => a - b);
  return {
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
    currency,
    period,
    raw: text,
  };
}

const PERIOD_LABEL: Record<PayPeriod, string> = {
  hour: "hour",
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

function formatAmount(value: number, currency: string): string {
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPay(pay: Pay): string {
  const suffix = pay.period ? ` / ${PERIOD_LABEL[pay.period]}` : "";
  if (pay.min !== null && pay.max !== null && pay.min !== pay.max) {
    return `${formatAmount(pay.min, pay.currency)}–${formatAmount(pay.max, pay.currency)}${suffix}`;
  }
  const single = pay.min ?? pay.max;
  if (single === null) return pay.raw;
  const prefix = pay.min === null ? "Up to " : pay.max === null ? "From " : "";
  return `${prefix}${formatAmount(single, pay.currency)}${suffix}`;
}
