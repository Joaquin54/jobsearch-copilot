import { addDays, startOfDay, type DayKey } from "../lib/localDays.ts";
import { send } from "../lib/messages.ts";

export type Window = {
  /** Applied-per-local-day over the read window. */
  counts: Map<DayKey, number>;
  /** Lifetime applied count, independent of the window. */
  total: number;
  failed: boolean;
};

/**
 * A streak can only be as long as the window read for it, and the same window
 * covers the month and the week. A season is ample and keeps the scan bounded
 * regardless of store size.
 */
export const STREAK_WINDOW_DAYS = 400;

export function windowStartIso(now: Date): string {
  return addDays(startOfDay(now), -STREAK_WINDOW_DAYS).toISOString();
}

/**
 * Two reads, issued together: per-day counts over the window, and the lifetime
 * total. Both are aggregates computed in the worker from index keys, so no
 * record crosses the port and the total keeps its lifetime meaning whatever the
 * window is.
 */
export async function fetchWindow(now: Date): Promise<Window> {
  const filter = { status: "applied" as const, from: windowStartIso(now) };

  const [days, lifetime] = await Promise.all([
    send({ type: "DAY_COUNTS", payload: { filter } }),
    send({ type: "COUNT_APPLICATIONS", payload: { filter: { status: "applied" as const } } }),
  ]);

  if (!days.ok || !lifetime.ok) return { counts: new Map(), total: 0, failed: true };

  return { counts: new Map(days.counts), total: lifetime.count, failed: false };
}
