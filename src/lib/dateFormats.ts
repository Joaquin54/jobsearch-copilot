import type { IsoDate } from "./types.ts";

/**
 * Every formatter is built once at module scope. Constructing an
 * Intl.DateTimeFormat costs far more than formatting with one, and the table
 * and activity grid format thousands of values per interaction.
 */
const DAY_MONTH = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const TIME_12H = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const FULL_DAY = new Intl.DateTimeFormat(undefined, {
  month: "long",
  day: "numeric",
  year: "numeric",
});
const MONTH_YEAR = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const MONTH_LONG = new Intl.DateTimeFormat(undefined, { month: "long" });

export const COMPANY_COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });

/** "Oct 19" */
export function formatDayMonth(value: Date | IsoDate): string {
  return DAY_MONTH.format(typeof value === "string" ? new Date(value) : value);
}

/** "2:42 PM" */
export function formatTime(value: Date | IsoDate): string {
  return TIME_12H.format(typeof value === "string" ? new Date(value) : value);
}

/** "October 19, 2026" */
export function formatFullDay(value: Date | IsoDate): string {
  return FULL_DAY.format(typeof value === "string" ? new Date(value) : value);
}

/** "October 2026" */
export function formatMonthYear(value: Date): string {
  return MONTH_YEAR.format(value);
}

/** "October" */
export function formatMonthLong(value: Date): string {
  return MONTH_LONG.format(value);
}

/**
 * Header line. Reads "today at 2:42 PM" only when the stamp really is today,
 * so a store that has been idle for a week does not claim a fresh update.
 */
export function formatUpdatedAt(newest: IsoDate | null, now: Date): string {
  if (newest === null) return "No applications yet";
  const stamp = new Date(newest);
  const sameDay =
    stamp.getFullYear() === now.getFullYear() &&
    stamp.getMonth() === now.getMonth() &&
    stamp.getDate() === now.getDate();
  return sameDay
    ? `Updated today at ${formatTime(stamp)}`
    : `Updated ${formatDayMonth(stamp)} at ${formatTime(stamp)}`;
}
