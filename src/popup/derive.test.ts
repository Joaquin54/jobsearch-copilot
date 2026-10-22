import { expect, test } from "bun:test";

import type { DayKey } from "../lib/localDays.ts";
import { derive } from "./derive.ts";
import type { Cell } from "./derive.ts";

/** Local noon, so nothing here depends on a DST-sensitive hour. */
function at(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function counts(entries: Record<string, number>): Map<DayKey, number> {
  return new Map(Object.entries(entries));
}

function dayCells(cells: readonly Cell[]): Extract<Cell, { kind: "day" }>[] {
  return cells.filter((cell: Cell): cell is Extract<Cell, { kind: "day" }> => cell.kind === "day");
}

test("rings, grid geometry and tooltips follow the spec", () => {
  const view = derive(
    counts({ "2026-10-19": 1, "2026-10-20": 2, "2026-10-21": 1 }),
    214,
    at(2026, 10, 21),
  );

  expect(view.monthYear).toBe("October 2026");
  expect(view.activityTitle).toBe("October activity");
  expect(view.rings.month.value).toBe(4);
  expect(view.rings.month.caption).toBe("4 of 60");
  // Oct 18-21 all fall in the current week.
  expect(view.rings.week.value).toBe(4);
  expect(view.rings.week.caption).toBe("11 more to goal");
  expect(view.rings.total.value).toBe(214);
  expect(view.rings.total.caption).toBe("Next: 250");

  // Oct 1 2026 is a Thursday: 4 leading blanks + 31 days = 5 columns of 7.
  expect(view.columns).toBe(5);
  expect(view.cells.length).toBe(35);
  expect(view.cells.slice(0, 4).every((cell: Cell): boolean => cell.kind === "blank")).toBe(true);

  const cells = dayCells(view.cells);
  const find = (key: string): Extract<Cell, { kind: "day" }> | undefined =>
    cells.find((cell): boolean => cell.key === key);

  expect(find("2026-10-19")?.tip).toBe("October 19, 2026 · 1 application sent");
  expect(find("2026-10-20")?.tip).toBe("October 20, 2026 · 2 applications sent");
  expect(find("2026-10-18")?.tip).toBe("October 18, 2026 · No applications sent");
  expect(find("2026-10-25")?.tip).toBe("October 25, 2026 · Upcoming");
  expect(find("2026-10-25")?.future).toBe(true);
  expect(find("2026-10-21")?.today).toBe(true);
  expect(find("2026-10-18")?.level).toBe(0);
  expect(find("2026-10-20")?.level).toBe(1);

  // Cells are emitted column-major, so the grid fills Sunday-first downwards.
  expect(view.cells[4]).toMatchObject({ kind: "day", key: "2026-10-01", column: 0, row: 4 });
  expect(view.cells[7]).toMatchObject({ kind: "day", key: "2026-10-04", column: 1, row: 0 });
});

test("a week that starts in the previous month still counts", () => {
  // Oct 3 2026 is a Saturday, so its week runs from Sun Sep 27.
  const view = derive(counts({ "2026-09-28": 2, "2026-10-01": 1 }), 3, at(2026, 10, 3));
  expect(view.rings.week.value).toBe(3);
  // The month ring only ever counts the month itself.
  expect(view.rings.month.value).toBe(1);
});

test("stats read from the month's counts", () => {
  const view = derive(
    counts({ "2026-10-12": 7, "2026-10-13": 3, "2026-10-14": 5 }),
    15,
    at(2026, 10, 20),
  );
  expect(view.stats[0]).toEqual({ label: "Active days", value: "3 of 20" });
  expect(view.stats[1]).toEqual({ label: "Best day", value: "Oct 12 · 7" });
  // 15 sent over 20 elapsed days.
  expect(view.stats[2]).toEqual({ label: "Daily average", value: "0.8" });

  const cells = dayCells(view.cells);
  const level = (key: string): number | undefined =>
    cells.find((cell): boolean => cell.key === key)?.level;
  expect(level("2026-10-12")).toBe(4);
  expect(level("2026-10-13")).toBe(2);
  expect(level("2026-10-14")).toBe(3);
});

test("the streak is not truncated at the month boundary", () => {
  const long: Record<string, number> = {};
  for (let day = 20; day <= 30; day += 1) long[`2026-09-${day}`] = 1;
  long["2026-10-01"] = 1;
  long["2026-10-02"] = 1;

  const view = derive(counts(long), 13, at(2026, 10, 2));
  expect(view.stats[3]).toEqual({ label: "Streak", value: "13 days" });
});

test("an empty window derives a zero view with the grid still laid out", () => {
  const view = derive(new Map(), 0, at(2026, 10, 21));
  expect(view.rings.month.value).toBe(0);
  expect(view.rings.total.caption).toBe("Next: 50");
  expect(view.cells.length).toBe(35);
  expect(view.stats[1]).toEqual({ label: "Best day", value: "—" });
  expect(view.stats[2]).toEqual({ label: "Daily average", value: "0.0" });
  expect(view.stats[3]).toEqual({ label: "Streak", value: "0 days" });
});

test("the grid's aria label summarises the month", () => {
  const view = derive(counts({ "2026-10-20": 1 }), 1, at(2026, 10, 21));
  expect(view.gridLabel).toBe(
    "October activity: 1 application sent across 1 day of 21 so far this month.",
  );
});
