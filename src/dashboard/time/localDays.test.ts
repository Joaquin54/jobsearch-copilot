import { expect, test } from "bun:test";

import {
  activeDays,
  addDays,
  addMonths,
  bestDay,
  dailyAverage,
  dayKey,
  dayKeyOfIso,
  daysInMonth,
  levelOf,
  monthCells,
  monthRange,
  startOfWeek,
  streakFrom,
  weekColumns,
  type DayKey,
} from "./localDays.ts";

const NY = process.env.TZ === "America/New_York";

/**
 * The stated failure case: a late-evening local apply is stored as the next
 * UTC day. Slicing the ISO string would bucket it on Oct 20.
 */
test.if(NY)("buckets a late-evening UTC instant onto the local day", (): void => {
  expect(dayKeyOfIso("2026-10-20T02:30:00.000Z")).toBe("2026-10-19");
  expect("2026-10-20T02:30:00.000Z".slice(0, 10)).toBe("2026-10-20");
});

test.if(NY)("midnight local is the start of the new local day", (): void => {
  expect(dayKeyOfIso("2026-10-20T04:00:00.000Z")).toBe("2026-10-20");
  expect(dayKeyOfIso("2026-10-20T03:59:59.000Z")).toBe("2026-10-19");
});

test.if(NY)("stepping days survives the fall-back transition", (): void => {
  // Nov 1 2026 is 25 hours long in New York, so ms arithmetic would land short.
  const beforeDst = new Date(2026, 9, 31);
  expect(dayKeyOfIso(addDays(beforeDst, 1).toISOString())).toBe("2026-11-01");
  expect(dayKeyOfIso(addDays(beforeDst, 2).toISOString())).toBe("2026-11-02");
});

test.if(NY)("stepping days survives the spring-forward transition", (): void => {
  // Mar 8 2026 is 23 hours long in New York.
  const beforeDst = new Date(2026, 2, 7);
  expect(dayKeyOfIso(addDays(beforeDst, 1).toISOString())).toBe("2026-03-08");
  expect(dayKeyOfIso(addDays(beforeDst, 2).toISOString())).toBe("2026-03-09");
});

test("day keys are zero padded", (): void => {
  expect(dayKey(2026, 0, 5)).toBe("2026-01-05");
  expect(dayKey(2026, 11, 31)).toBe("2026-12-31");
});

test("weeks start on the local Sunday from any weekday", (): void => {
  for (let offset = 0; offset < 7; offset += 1) {
    const start = startOfWeek(new Date(2026, 9, 18 + offset));
    expect(start.getDay()).toBe(0);
    expect(start.getDate()).toBe(18);
  }
});

test("month length comes from the calendar, not a lookup table", (): void => {
  expect(daysInMonth({ year: 2024, month: 1 })).toBe(29);
  expect(daysInMonth({ year: 2026, month: 1 })).toBe(28);
  expect(daysInMonth({ year: 2026, month: 9 })).toBe(31);
  expect(daysInMonth({ year: 2026, month: 10 })).toBe(30);
});

test("month arithmetic wraps the year", (): void => {
  expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
});

test("a month range is half open on the next month", (): void => {
  const range = monthRange({ year: 2026, month: 9 });
  expect(range.lo < range.hi).toBe(true);
  expect(new Date(range.lo).getDate()).toBe(1);
  expect(new Date(range.hi).getDate()).toBe(1);
});

test("levels bucket as 0 / 1-2 / 3-4 / 5-6 / 7+", (): void => {
  expect([0, 1, 2, 3, 4, 5, 6, 7, 40].map(levelOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

function counts(entries: readonly [DayKey, number][]): Map<DayKey, number> {
  return new Map<DayKey, number>(entries);
}

test("a streak ending today counts today", (): void => {
  const now = new Date(2026, 9, 21);
  const map = counts([
    ["2026-10-21", 2],
    ["2026-10-20", 1],
    ["2026-10-19", 5],
  ]);
  expect(streakFrom(map, now)).toBe(3);
});

test("an empty today anchors the streak on yesterday", (): void => {
  const now = new Date(2026, 9, 21);
  const map = counts([
    ["2026-10-20", 1],
    ["2026-10-19", 5],
  ]);
  expect(streakFrom(map, now)).toBe(2);
});

test("a gap at today and yesterday ends the streak", (): void => {
  const now = new Date(2026, 9, 21);
  expect(streakFrom(counts([["2026-10-19", 5]]), now)).toBe(0);
  expect(streakFrom(counts([]), now)).toBe(0);
});

test("month cells cover the month and mark today and future days", (): void => {
  const now = new Date(2026, 9, 21);
  const cells = monthCells({ year: 2026, month: 9 }, counts([["2026-10-21", 3]]), now);
  expect(cells).toHaveLength(31);
  expect(cells.filter((cell): boolean => cell.isToday)).toHaveLength(1);
  expect(cells[20]?.isToday).toBe(true);
  expect(cells[20]?.count).toBe(3);
  expect(cells[21]?.isFuture).toBe(true);
  expect(cells[19]?.isFuture).toBe(false);
});

test("a past month has no today outline and no future cells", (): void => {
  const now = new Date(2026, 9, 21);
  const cells = monthCells({ year: 2026, month: 8 }, counts([]), now);
  expect(cells.some((cell): boolean => cell.isToday)).toBe(false);
  expect(cells.some((cell): boolean => cell.isFuture)).toBe(false);
});

test("week columns are Sunday first and padded to full weeks", (): void => {
  const cells = monthCells({ year: 2026, month: 9 }, counts([]), new Date(2026, 9, 21));
  const weeks = weekColumns(cells);
  expect(weeks.every((week): boolean => week.length === 7)).toBe(true);
  // Oct 1 2026 is a Thursday (index 4), so Sun-Wed of the first week are blank.
  expect(weeks[0]?.slice(0, 4)).toEqual([null, null, null, null]);
  expect(weeks[0]?.[4]?.day).toBe(1);
  expect(weeks.flat().filter((cell): boolean => cell !== null)).toHaveLength(31);
});

test("active days and best day read the cells", (): void => {
  const cells = monthCells(
    { year: 2026, month: 9 },
    counts([
      ["2026-10-01", 4],
      ["2026-10-02", 9],
    ]),
    new Date(2026, 9, 21),
  );
  expect(activeDays(cells)).toBe(2);
  expect(bestDay(cells)).toBe(9);
});

test("daily average divides by elapsed days in the current month", (): void => {
  const now = new Date(2026, 9, 21);
  expect(dailyAverage({ year: 2026, month: 9 }, 53, now)).toBe(2.5);
});

test("daily average divides by the full length of a past month", (): void => {
  const now = new Date(2026, 9, 21);
  // 60 over September's 30 days, not over 21 elapsed days of October.
  expect(dailyAverage({ year: 2026, month: 8 }, 60, now)).toBe(2);
});

test("a future month has no elapsed days", (): void => {
  expect(dailyAverage({ year: 2026, month: 11 }, 0, new Date(2026, 9, 21))).toBe(0);
});
