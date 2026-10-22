import { expect, test } from "bun:test";

import { levelOf, nextMilestone } from "./goals.ts";
import {
  activeDays,
  bestDayCell,
  dailyAverage,
  dayKeyOfDate,
  dayKeyOfIso,
  elapsedDays,
  monthCells,
  monthTotal,
  startOfWeek,
  streakFrom,
  weekColumns,
  type DayKey,
} from "./localDays.ts";

/** Local noon, so nothing here depends on a DST-sensitive hour. */
function at(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function isoAt(year: number, month: number, day: number, hour = 12): string {
  return at(year, month, day, hour).toISOString();
}

function counts(entries: Record<string, number>): Map<DayKey, number> {
  return new Map(Object.entries(entries));
}

const OCT_2026 = { year: 2026, month: 9 };

test("an instant buckets into its local day, even across UTC midnight", () => {
  const lateEvening = isoAt(2026, 10, 19, 22);
  expect(dayKeyOfIso(lateEvening)).toBe("2026-10-19");

  const offsetMinutes = at(2026, 10, 20).getTimezoneOffset();
  if (offsetMinutes > 0) {
    // West of UTC this instant is already the next UTC day.
    expect(lateEvening.startsWith("2026-10-20")).toBe(true);
  }
  // The canonical case, checked where that zone's offset is in effect
  // (TZ=America/New_York: UTC-4 on this date).
  if (offsetMinutes === 240) {
    expect(dayKeyOfIso("2026-10-20T02:30:00.000Z")).toBe("2026-10-19");
  }
});

test("the week starts on the Sunday containing the date", () => {
  expect(dayKeyOfDate(startOfWeek(at(2026, 10, 21)))).toBe("2026-10-18");
  expect(dayKeyOfDate(startOfWeek(at(2026, 10, 18)))).toBe("2026-10-18");
  expect(dayKeyOfDate(startOfWeek(at(2026, 10, 24)))).toBe("2026-10-18");
});

test("levels are 0 / 1-2 / 3-4 / 5-6 / 7+", () => {
  expect([0, 1, 2, 3, 4, 5, 6, 7, 99].map(levelOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test("milestone is the next multiple of 50 strictly above the total, clamped", () => {
  expect(nextMilestone(0)).toBe(50);
  expect(nextMilestone(200)).toBe(250);
  expect(nextMilestone(214)).toBe(250);
  expect(nextMilestone(-5)).toBe(50);
});

test("future days are never counted, in the grid or in any figure over it", () => {
  const cells = monthCells(
    OCT_2026,
    counts({ "2026-10-20": 3, "2026-10-25": 9 }),
    at(2026, 10, 21),
  );
  const find = (key: string) => cells.find((cell): boolean => cell.key === key);

  expect(find("2026-10-20")?.count).toBe(3);
  // Oct 25 is in the future: the record exists but reads as 0 everywhere.
  expect(find("2026-10-25")?.count).toBe(0);
  expect(find("2026-10-25")?.isFuture).toBe(true);
  expect(find("2026-10-21")?.isToday).toBe(true);
  expect(monthTotal(cells)).toBe(3);
  expect(activeDays(cells)).toBe(1);
  expect(bestDayCell(cells)?.count).toBe(3);
});

test("best day is the earliest of a tie, and null for an empty month", () => {
  const cells = monthCells(
    OCT_2026,
    counts({ "2026-10-05": 4, "2026-10-12": 4 }),
    at(2026, 10, 21),
  );
  expect(bestDayCell(cells)?.key).toBe("2026-10-05");
  expect(bestDayCell(monthCells(OCT_2026, counts({}), at(2026, 10, 21)))).toBeNull();
});

test("elapsed days and daily average follow the month being viewed", () => {
  const now = at(2026, 10, 21);
  expect(elapsedDays(OCT_2026, now)).toBe(21);
  expect(dailyAverage(OCT_2026, 15, now)).toBe(0.7);

  // A past month is complete, so the denominator is its whole length.
  const september = { year: 2026, month: 8 };
  expect(elapsedDays(september, now)).toBe(30);
  expect(dailyAverage(september, 15, now)).toBe(0.5);

  // A future month has no elapsed days.
  expect(dailyAverage({ year: 2026, month: 10 }, 0, now)).toBe(0);
});

test("the streak runs to today, or to yesterday when today is empty", () => {
  const now = at(2026, 10, 21);
  expect(streakFrom(counts({ "2026-10-20": 1, "2026-10-21": 2 }), now)).toBe(2);
  // A zero today does not break a streak that ran through yesterday.
  expect(streakFrom(counts({ "2026-10-19": 1, "2026-10-20": 2 }), now)).toBe(2);
  expect(streakFrom(counts({ "2026-10-18": 1 }), now)).toBe(0);
  expect(streakFrom(counts({ "2026-10-21": 1 }), now)).toBe(1);
});

test("the streak reaches back past the month boundary", () => {
  const now = at(2026, 10, 2);
  const long: Record<string, number> = {};
  for (let day = 20; day <= 30; day += 1) long[`2026-09-${day}`] = 1;
  long["2026-10-01"] = 1;
  long["2026-10-02"] = 1;
  // 11 days of September plus two of October, not truncated at the 1st.
  expect(streakFrom(counts(long), now)).toBe(13);
});

test("week columns are Sunday-first with the leading gap padded", () => {
  // Oct 1 2026 is a Thursday: 4 leading blanks + 31 days = 5 columns of 7.
  const columns = weekColumns(monthCells(OCT_2026, counts({}), at(2026, 10, 21)));
  expect(columns.length).toBe(5);
  expect(columns[0]?.slice(0, 4)).toEqual([null, null, null, null]);
  expect(columns[0]?.[4]?.day).toBe(1);
  expect(columns.every((week): boolean => week.length === 7)).toBe(true);
});
