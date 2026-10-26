/* "9 hours ago" → an ISO stamp, shared by the adapters whose panes carry no date. */

const MINUTE = 60_000;
const UNIT_MS: Readonly<Record<string, number>> = {
  minute: MINUTE,
  hour: 60 * MINUTE,
  day: 24 * 60 * MINUTE,
  week: 7 * 24 * 60 * MINUTE,
  month: 30 * 24 * 60 * MINUTE,
  year: 365 * 24 * 60 * MINUTE,
};
// The "+" of Indeed's "30+ days ago" is read as "at least": the floor is the
// only thing the text states.
const RELATIVE = /(\d+)\+?\s+(minute|hour|day|week|month|year)s?\s+ago/i;
const NOW = /just now|moments ago|just posted|\btoday\b/i;

/**
 * Approximate by design: neither pane carries a real date, and "Reposted 2
 * weeks ago" dates the repost rather than the original post.
 */
export function relativeToIso(text: string, now: Date): string {
  if (NOW.test(text)) return now.toISOString();
  if (/\byesterday\b/i.test(text)) return new Date(now.getTime() - UNIT_MS.day!).toISOString();
  const match = RELATIVE.exec(text);
  const unit = match?.[2]?.toLowerCase();
  if (!match?.[1] || unit === undefined) return "";
  const span = UNIT_MS[unit];
  if (span === undefined) return "";
  return new Date(now.getTime() - Number(match[1]) * span).toISOString();
}
