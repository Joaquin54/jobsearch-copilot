import {
  countApplications,
  dayCounts,
  latestUpdatedAt as latestUpdatedAtKey,
} from "../../lib/db.ts";
import type { IsoDate } from "../../lib/types.ts";
import { MONTHLY_GOAL, WEEKLY_GOAL, nextMilestone } from "../config.ts";
import {
  activeDays,
  addDays,
  bestDay,
  dailyAverage,
  monthCells,
  monthRange,
  monthTotal as sumCells,
  startOfDay,
  streakFrom,
  weekRange,
  type DayCell,
  type DayKey,
  type MonthRef,
} from "../time/localDays.ts";

export type Overview = {
  month: MonthRef;
  cells: readonly DayCell[];
  /** Selected month, driving the grid and its tiles. */
  monthTotal: number;
  /** Current period, driving the rings — never the browsed month. */
  currentMonthTotal: number;
  weekTotal: number;
  totalSent: number;
  activeDays: number;
  bestDay: number;
  dailyAverage: number;
  streak: number;
  milestone: number;
  weeklyGoal: number;
  monthlyGoal: number;
};

/**
 * A streak can only be as long as the window read for it; a season is ample and
 * keeps the scan bounded regardless of store size.
 */
const STREAK_WINDOW_DAYS = 400;

export async function countApplied(lo: IsoDate, hi: IsoDate): Promise<number> {
  return await countApplications({ status: "applied", from: lo, to: hi });
}

export async function countAllApplied(): Promise<number> {
  return await countApplications({ status: "applied" });
}

export async function appliedDayCounts(
  lo: IsoDate,
  hi: IsoDate,
  isStale: () => boolean,
): Promise<Map<DayKey, number>> {
  return await dayCounts({ status: "applied", from: lo, to: hi }, isStale);
}

/** Exact, straight off the by_updatedAt index. */
export async function latestUpdatedAt(): Promise<IsoDate | null> {
  return await latestUpdatedAtKey();
}

/**
 * The month scan and the three counts are independent requests issued together.
 * Streak needs days before the displayed month, so it gets its own window
 * reaching back from today.
 */
export async function loadOverview(
  month: MonthRef,
  now: Date,
  isStale: () => boolean,
): Promise<Overview> {
  const span = monthRange(month);
  const week = weekRange(now);
  const today = startOfDay(now);
  const streakSpan = {
    lo: addDays(today, -STREAK_WINDOW_DAYS).toISOString(),
    hi: addDays(today, 1).toISOString(),
  };

  const current = monthRange({ year: now.getFullYear(), month: now.getMonth() });

  const [counts, currentMonthTotal, weekTotal, totalSent, streakCounts] = await Promise.all([
    appliedDayCounts(span.lo, span.hi, isStale),
    countApplied(current.lo, current.hi),
    countApplied(week.lo, week.hi),
    countAllApplied(),
    appliedDayCounts(streakSpan.lo, streakSpan.hi, isStale),
  ]);

  // monthCells zeroes future days, so every figure below is over elapsed days.
  const cells = monthCells(month, counts, now);
  const total = sumCells(cells);

  return {
    month,
    cells,
    monthTotal: total,
    currentMonthTotal,
    weekTotal,
    totalSent,
    activeDays: activeDays(cells),
    bestDay: bestDay(cells),
    dailyAverage: dailyAverage(month, total, now),
    streak: streakFrom(streakCounts, now),
    milestone: nextMilestone(totalSent),
    weeklyGoal: WEEKLY_GOAL,
    monthlyGoal: MONTHLY_GOAL,
  };
}
