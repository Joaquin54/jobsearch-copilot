import { formatFullDay, formatDayMonth, formatMonthLong, formatMonthYear } from "../lib/dateFormats.ts";
import { MONTHLY_GOAL, WEEKLY_GOAL, nextMilestone, type Level } from "../lib/goals.ts";
import {
  activeDays,
  addDays,
  bestDayCell,
  dailyAverage,
  dayKeyOfDate,
  elapsedDays,
  monthCells,
  monthOf,
  monthTotal,
  startOfWeek,
  streakFrom,
  weekColumns,
  type DayCell,
  type DayKey,
} from "../lib/localDays.ts";

export type { Level };

export type Cell =
  /** Outside the month: rendered for spacing, invisible. */
  | { kind: "blank"; column: number; row: number }
  | {
      kind: "day";
      column: number;
      row: number;
      key: DayKey;
      count: number;
      level: Level;
      future: boolean;
      today: boolean;
      tip: string;
    };

export type RingView = {
  value: number;
  goal: number;
  progress: number;
  label: string;
  caption: string;
};

export type View = {
  monthYear: string;
  activityTitle: string;
  rings: { month: RingView; week: RingView; total: RingView };
  columns: number;
  cells: Cell[];
  gridLabel: string;
  stats: { label: string; value: string }[];
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function tipFor(cell: DayCell): string {
  const when = formatFullDay(cell.date);
  if (cell.isFuture) return `${when} · Upcoming`;
  if (cell.count === 0) return `${when} · No applications sent`;
  return `${when} · ${cell.count} ${plural(cell.count, "application", "applications")} sent`;
}

function progressOf(value: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(1, value / goal));
}

/**
 * One pass over the window's per-day counts produces every number the popup
 * shows. `counts` holds applied records only, bucketed by local day;
 * `total` is the lifetime applied count.
 */
export function derive(counts: ReadonlyMap<DayKey, number>, total: number, now: Date): View {
  const ref = monthOf(now);
  const dayCells = monthCells(ref, counts, now);

  // Column-major, Sunday-first, with the leading and trailing gaps kept as
  // blanks so every month reserves the same grid geometry.
  const columns = weekColumns(dayCells);
  const cells: Cell[] = [];
  for (let column = 0; column < columns.length; column += 1) {
    const week = columns[column] ?? [];
    for (let row = 0; row < 7; row += 1) {
      const cell = week[row] ?? null;
      if (cell === null) {
        cells.push({ kind: "blank", column, row });
        continue;
      }
      cells.push({
        kind: "day",
        column,
        row,
        key: cell.key,
        count: cell.count,
        level: cell.level,
        future: cell.isFuture,
        today: cell.isToday,
        tip: tipFor(cell),
      });
    }
  }

  const monthSent = monthTotal(dayCells);
  const active = activeDays(dayCells);
  const best = bestDayCell(dayCells);
  const elapsed = elapsedDays(ref, now);

  // The week containing today can start in the previous month, so it is summed
  // from the counts map rather than from the grid.
  const weekStart = startOfWeek(now);
  let weekSent = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    weekSent += counts.get(dayKeyOfDate(addDays(weekStart, offset))) ?? 0;
  }

  const weekRemaining = Math.max(0, WEEKLY_GOAL - weekSent);
  const milestone = nextMilestone(total);
  const streak = streakFrom(counts, now);

  return {
    monthYear: formatMonthYear(now),
    activityTitle: `${formatMonthLong(now)} activity`,
    rings: {
      month: {
        value: monthSent,
        goal: MONTHLY_GOAL,
        progress: progressOf(monthSent, MONTHLY_GOAL),
        label: "This month",
        caption: `${monthSent} of ${MONTHLY_GOAL}`,
      },
      week: {
        value: weekSent,
        goal: WEEKLY_GOAL,
        progress: progressOf(weekSent, WEEKLY_GOAL),
        label: "This week",
        caption: weekRemaining === 0 ? "Goal reached" : `${weekRemaining} more to goal`,
      },
      total: {
        value: total,
        goal: milestone,
        progress: progressOf(total, milestone),
        label: "Total sent",
        caption: `Next: ${milestone}`,
      },
    },
    columns: columns.length,
    cells,
    gridLabel:
      `${formatMonthLong(now)} activity: ${monthSent} ${plural(monthSent, "application", "applications")} ` +
      `sent across ${active} ${plural(active, "day", "days")} of ${elapsed} so far this month.`,
    stats: [
      { label: "Active days", value: `${active} of ${elapsed}` },
      {
        label: "Best day",
        value: best === null ? "—" : `${formatDayMonth(best.date)} · ${best.count}`,
      },
      { label: "Daily average", value: dailyAverage(ref, monthSent, now).toFixed(1) },
      { label: "Streak", value: `${streak} ${plural(streak, "day", "days")}` },
    ],
  };
}
