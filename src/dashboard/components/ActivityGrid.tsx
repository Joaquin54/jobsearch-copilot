import { memo, useCallback, useRef, useState } from "react";
import type { MouseEvent, ReactElement } from "react";

import { formatFullDay } from "../time/formats.ts";
import { levelOf, weekColumns, type DayCell } from "../time/localDays.ts";

export type ActivityGridProps = {
  cells: readonly DayCell[];
  monthLabel: string;
  activeDays: number;
  monthTotal: number;
};

type Tip = { text: string; left: number; top: number };

function tooltipText(cell: DayCell): string {
  const day = formatFullDay(cell.date);
  if (cell.isFuture) return `${day} · Upcoming`;
  if (cell.count === 0) return `${day} · No applications sent`;
  const noun = cell.count === 1 ? "application" : "applications";
  return `${day} · ${cell.count} ${noun} sent`;
}

/**
 * Hover state is deliberately confined to this component: one delegated
 * listener on the grid plus a single positioned tooltip element, so moving the
 * pointer across the grid cannot re-render the table or the rest of the page.
 */
export const ActivityGrid = memo(function ActivityGrid({
  cells,
  monthLabel,
  activeDays,
  monthTotal,
}: ActivityGridProps): ReactElement {
  const [tip, setTip] = useState<Tip | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const weeks = weekColumns(cells);

  const handleOver = useCallback(
    (event: MouseEvent<HTMLDivElement>): void => {
      const target = event.target as HTMLElement;
      const key = target.dataset.day;
      const grid = gridRef.current;
      if (key === undefined || grid === null) return;
      const cell = cells.find((candidate: DayCell): boolean => candidate.key === key);
      if (!cell) return;
      const bounds = target.getBoundingClientRect();
      const frame = grid.getBoundingClientRect();
      setTip({
        text: tooltipText(cell),
        // Left-anchored above the cell, measured against the grid itself so the
        // tooltip stays put while the page scrolls.
        left: bounds.left - frame.left,
        top: bounds.top - frame.top,
      });
    },
    [cells],
  );

  const handleLeave = useCallback((): void => setTip(null), []);

  const noun = monthTotal === 1 ? "application" : "applications";
  const summary = `${monthLabel} activity: ${monthTotal} ${noun} sent across ${activeDays} days`;

  return (
    <div className="grid-wrap" ref={gridRef}>
      <div
        className="grid"
        role="img"
        aria-label={summary}
        onMouseOver={handleOver}
        onMouseLeave={handleLeave}
      >
        {weeks.map((week: (DayCell | null)[], index: number): ReactElement => (
          <div className="grid-week" key={index}>
            {week.map((cell: DayCell | null, slot: number): ReactElement => {
              if (cell === null) return <div className="grid-cell is-blank" key={slot} />;
              const classes = ["grid-cell"];
              if (cell.isFuture) classes.push("is-future");
              if (cell.isToday) classes.push("is-today");
              return (
                <div
                  key={cell.key}
                  className={classes.join(" ")}
                  data-day={cell.key}
                  style={{ background: `var(--level-${cell.isFuture ? 0 : levelOf(cell.count)})` }}
                />
              );
            })}
          </div>
        ))}
      </div>
      {tip !== null ? (
        <div className="grid-tip" style={{ left: `${tip.left}px`, top: `${tip.top}px` }}>
          {tip.text}
        </div>
      ) : null}
    </div>
  );
});
