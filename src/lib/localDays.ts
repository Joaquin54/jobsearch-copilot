import { levelOf, type Level } from "./goals.ts";
import type { IsoDate } from "./types.ts";

// Levels belong to goals.ts, but every caller that lays out days also needs
// them, so they are re-exported here rather than imported from two places.
export { levelOf, LEVEL_COUNT, type Level } from "./goals.ts";

/**
 * Local-calendar helpers shared by the popup and the dashboard.
 *
 * Every bucket here is a LOCAL calendar day, never a UTC one. dateApplied is
 * stored as UTC ISO, so `dateApplied.slice(0, 10)` would put
 * 2026-10-20T02:30:00.000Z on Oct 20 — in America/New_York the user applied on
 * the evening of Oct 19. Only the local getters give the right day.
 */
export type DayKey = string;

export type MonthRef = {
  year: number;
  /** 0-indexed, matching Date. */
  month: number;
};

export function dayKey(year: number, month: number, day: number): DayKey {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function dayKeyOfDate(date: Date): DayKey {
  return dayKey(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dayKeyOfIso(iso: IsoDate): DayKey {
  return dayKeyOfDate(new Date(iso));
}

export function monthOf(date: Date): MonthRef {
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function sameMonth(a: MonthRef, b: MonthRef): boolean {
  return a.year === b.year && a.month === b.month;
}

export function addMonths(ref: MonthRef, delta: number): MonthRef {
  return monthOf(new Date(ref.year, ref.month + delta, 1));
}

export function daysInMonth(ref: MonthRef): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(ref.year, ref.month + 1, 0).getDate();
}

/**
 * Days are stepped through the Date constructor, never by adding 86_400_000:
 * a DST transition makes a "day" 23 or 25 hours long, so millisecond
 * arithmetic drifts onto the wrong local date.
 */
export function addDays(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Weeks run Sunday -> Saturday in local time. */
export function startOfWeek(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
}

export function startOfMonth(ref: MonthRef): Date {
  return new Date(ref.year, ref.month, 1);
}

/** Half-open [lo, hi) UTC-ISO bounds for a local day range, for IDB key ranges. */
export type IsoRange = { lo: IsoDate; hi: IsoDate };

export function isoRange(fromInclusive: Date, toExclusive: Date): IsoRange {
  return { lo: fromInclusive.toISOString(), hi: toExclusive.toISOString() };
}

export function monthRange(ref: MonthRef): IsoRange {
  return isoRange(new Date(ref.year, ref.month, 1), new Date(ref.year, ref.month + 1, 1));
}

export function weekRange(date: Date): IsoRange {
  const start = startOfWeek(date);
  return isoRange(start, addDays(start, 7));
}

export function dayRange(date: Date): IsoRange {
  const start = startOfDay(date);
  return isoRange(start, addDays(start, 1));
}

export type DayCell = {
  key: DayKey;
  date: Date;
  day: number;
  /** Sunday = 0. */
  weekday: number;
  count: number;
  level: Level;
  isToday: boolean;
  isFuture: boolean;
};

/**
 * Zero-filled cells for every day of the month, in calendar order.
 *
 * A future day always reads 0. dateApplied is whatever the board showed, so a
 * record can carry a date that has not happened yet; counting it would inflate
 * the month total and the daily average against days nobody has worked.
 */
export function monthCells(
  ref: MonthRef,
  counts: ReadonlyMap<DayKey, number>,
  now: Date,
): DayCell[] {
  const todayKey = dayKeyOfDate(now);
  const todayStart = startOfDay(now).getTime();
  const total = daysInMonth(ref);
  const cells: DayCell[] = [];

  for (let day = 1; day <= total; day += 1) {
    const date = new Date(ref.year, ref.month, day);
    const key = dayKey(ref.year, ref.month, day);
    const isFuture = date.getTime() > todayStart;
    const count = isFuture ? 0 : (counts.get(key) ?? 0);
    cells.push({
      key,
      date,
      day,
      weekday: date.getDay(),
      count,
      level: levelOf(count),
      isToday: key === todayKey,
      isFuture,
    });
  }

  return cells;
}

/** Sunday-first columns. The leading gap of the first week is padded with null. */
export function weekColumns(cells: readonly DayCell[]): (DayCell | null)[][] {
  const weeks: (DayCell | null)[][] = [];
  let current: (DayCell | null)[] = [];

  const first = cells[0];
  if (first) {
    for (let i = 0; i < first.weekday; i += 1) current.push(null);
  }

  for (const cell of cells) {
    current.push(cell);
    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    while (current.length < 7) current.push(null);
    weeks.push(current);
  }

  return weeks;
}

/**
 * Consecutive local days with at least one applied record, ending today — or
 * ending yesterday when today has none yet, so an unstarted day does not read
 * as a broken streak.
 *
 * Only as long as the window `counts` was read over, so callers pass a window
 * wide enough for the answer they want to report.
 */
export function streakFrom(counts: ReadonlyMap<DayKey, number>, now: Date): number {
  const hasToday = (counts.get(dayKeyOfDate(now)) ?? 0) > 0;
  let cursor = hasToday ? startOfDay(now) : addDays(startOfDay(now), -1);
  let streak = 0;

  while ((counts.get(dayKeyOfDate(cursor)) ?? 0) > 0) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/** Days elapsed in the month: so far for the current one, all of a past one. */
export function elapsedDays(ref: MonthRef, now: Date): number {
  const length = daysInMonth(ref);
  if (startOfMonth(ref).getTime() > startOfDay(now).getTime()) return 0;
  return sameMonth(ref, monthOf(now)) ? Math.min(now.getDate(), length) : length;
}

export function monthTotal(cells: readonly DayCell[]): number {
  return cells.reduce((sum: number, cell: DayCell): number => sum + cell.count, 0);
}

export function activeDays(cells: readonly DayCell[]): number {
  return cells.reduce((n: number, cell: DayCell): number => (cell.count > 0 ? n + 1 : n), 0);
}

export function bestDay(cells: readonly DayCell[]): number {
  return cells.reduce((best: number, cell: DayCell): number => Math.max(best, cell.count), 0);
}

/** Earliest day holding the highest count, or null when the month is empty. */
export function bestDayCell(cells: readonly DayCell[]): DayCell | null {
  let best: DayCell | null = null;
  for (const cell of cells) {
    if (cell.count > 0 && (best === null || cell.count > best.count)) best = cell;
  }
  return best;
}

/** Month total over elapsed days, to one decimal. A future month reads 0. */
export function dailyAverage(ref: MonthRef, total: number, now: Date): number {
  const elapsed = elapsedDays(ref, now);
  if (elapsed <= 0) return 0;
  return Math.round((total / elapsed) * 10) / 10;
}
