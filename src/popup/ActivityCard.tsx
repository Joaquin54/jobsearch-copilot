import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent, ReactElement } from "react";

import type { Cell, Level } from "./derive.ts";

const CELL = 20;
const GAP = 4;
const PITCH = CELL + GAP;
/** Space between the cell's top edge and the tooltip's bottom edge. */
const TIP_GAP = 6;

type GridCellProps = {
  index: number;
  blank: boolean;
  level: Level;
  future: boolean;
  today: boolean;
};

function GridCellImpl({ index, blank, level, future, today }: GridCellProps): ReactElement {
  if (blank) return <div className="cell cell--blank" />;
  const classes = `cell${future ? " cell--future" : ` cell--l${level}`}${today ? " cell--today" : ""}`;
  return <div className={classes} data-i={index} />;
}

const GridCell = memo(GridCellImpl);

type ActivityCardProps = {
  title: string;
  columns: number;
  cells: readonly Cell[];
  gridLabel: string;
  stats: readonly { label: string; value: string }[];
};

/**
 * Hover lives here and nowhere else, so pointer movement cannot re-render the
 * rings, header or button. One tooltip element is positioned from a delegated
 * pointerover on the grid container rather than 35 per-cell listeners.
 */
function ActivityCardImpl({ title, columns, cells, gridLabel, stats }: ActivityCardProps): ReactElement {
  const [hover, setHover] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  const onPointerOver = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement | null;
    const cell = target?.closest("[data-i]");
    const raw = cell instanceof HTMLElement ? cell.dataset["i"] : undefined;
    setHover(raw === undefined ? null : Number(raw));
  }, []);

  const onPointerLeave = useCallback((): void => setHover(null), []);

  const active = hover === null ? undefined : cells[hover];

  useLayoutEffect((): void => {
    const tip = tipRef.current;
    const body = bodyRef.current;
    if (!tip || !body || !active || active.kind !== "day") return;
    // Left-aligned to the cell, then clamped to the card's content box so the
    // first and last columns never push the tooltip outside the popup.
    const maxX = Math.max(0, body.clientWidth - tip.offsetWidth);
    const x = Math.min(active.column * PITCH, maxX);
    const y = active.row * PITCH - tip.offsetHeight - TIP_GAP;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  }, [active]);

  return (
    <section className="card activity-card">
      <div className="activity-head">
        <h2 className="activity-title">{title}</h2>
        <div className="legend" aria-hidden="true">
          <span className="legend-text">0</span>
          <span className="legend-swatch legend-swatch--l0" />
          <span className="legend-swatch legend-swatch--l1" />
          <span className="legend-swatch legend-swatch--l2" />
          <span className="legend-swatch legend-swatch--l3" />
          <span className="legend-swatch legend-swatch--l4" />
          <span className="legend-text">7+</span>
        </div>
      </div>

      <div className="activity-body" ref={bodyRef}>
        <div className="grid-wrap">
          <div
            className="grid"
            role="img"
            aria-label={gridLabel}
            style={{ width: columns * PITCH - GAP }}
            onPointerOver={onPointerOver}
            onPointerLeave={onPointerLeave}
          >
            {cells.map(
              (cell: Cell, index: number): ReactElement => (
                <GridCell
                  key={cell.kind === "day" ? cell.key : `blank-${index}`}
                  index={index}
                  blank={cell.kind === "blank"}
                  level={cell.kind === "day" ? cell.level : 0}
                  future={cell.kind === "day" && cell.future}
                  today={cell.kind === "day" && cell.today}
                />
              ),
            )}
          </div>
          <div
            className="tooltip"
            ref={tipRef}
            aria-hidden="true"
            data-shown={active?.kind === "day" ? "true" : "false"}
          >
            {active?.kind === "day" ? active.tip : ""}
          </div>
        </div>

        <dl className="stats">
          {stats.map(
            (stat: { label: string; value: string }): ReactElement => (
              <div className="stat-row" key={stat.label}>
                <dt className="stat-label">{stat.label}</dt>
                <dd className="stat-value">{stat.value}</dd>
              </div>
            ),
          )}
        </dl>
      </div>
    </section>
  );
}

export const ActivityCard = memo(ActivityCardImpl);
