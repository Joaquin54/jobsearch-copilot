import { memo, useMemo } from "react";
import type { ReactElement } from "react";

import { useOverview } from "../hooks/useOverview.ts";
import { formatMonthLong, formatMonthYear } from "../time/formats.ts";
import { startOfMonth } from "../time/localDays.ts";
import { ActivityGrid } from "./ActivityGrid.tsx";
import { MonthSwitcher } from "./MonthSwitcher.tsx";
import { Rings, type RingSpec } from "./Rings.tsx";
import { StatsTiles, type Tile } from "./StatsTiles.tsx";

/** Legend swatches, lightest to darkest. */
const LEVELS = [0, 1, 2, 3, 4] as const;

/**
 * Takes no props and owns its own month state, so nothing the table does can
 * re-render it.
 */
export const OverviewSection = memo(function OverviewSection(): ReactElement {
  const { overview, month, canGoNext, goPrev, goNext, pending } = useOverview();

  const monthDate = useMemo((): Date => startOfMonth(month), [month]);

  const rings = useMemo((): readonly RingSpec[] => {
    if (overview === null) return [];
    const weekRemaining = Math.max(overview.weeklyGoal - overview.weekTotal, 0);
    return [
      {
        label: "This month",
        caption: `${overview.currentMonthTotal} of ${overview.monthlyGoal}`,
        value: overview.currentMonthTotal,
        goal: overview.monthlyGoal,
        diameter: 108,
        stroke: 9,
        valueSize: 28,
      },
      {
        label: "This week",
        caption: weekRemaining === 0 ? "Goal met" : `${weekRemaining} more to goal`,
        value: overview.weekTotal,
        goal: overview.weeklyGoal,
        diameter: 156,
        stroke: 13,
        valueSize: 52,
      },
      {
        label: "Total sent",
        caption: `Next: ${overview.milestone}`,
        value: overview.totalSent,
        goal: overview.milestone,
        diameter: 108,
        stroke: 9,
        valueSize: 28,
      },
    ];
  }, [overview]);

  const tiles = useMemo((): readonly Tile[] => {
    if (overview === null) return [];
    return [
      { label: "Active days", value: String(overview.activeDays) },
      { label: "Best day", value: String(overview.bestDay) },
      { label: "Daily average", value: overview.dailyAverage.toFixed(1) },
      { label: "Streak", value: `${overview.streak}` },
    ];
  }, [overview]);

  return (
    <section className="section" aria-busy={pending}>
      <div className="section-head">
        <h2>Overview</h2>
        <MonthSwitcher
          label={formatMonthYear(monthDate)}
          canGoNext={canGoNext}
          onPrev={goPrev}
          onNext={goNext}
        />
      </div>

      <div className="cards">
        <div className="card card-rings">
          <h3>Applications sent</h3>
          {overview === null ? <div className="card-placeholder" /> : <Rings rings={rings} />}
        </div>

        <div className="card card-activity">
          <div className="card-head">
            <h3>{`${formatMonthLong(monthDate)} activity`}</h3>
            <div className="legend" aria-hidden="true">
              <span>0</span>
              {LEVELS.map((level: number): ReactElement => (
                <span
                  className="legend-swatch"
                  key={level}
                  style={{ background: `var(--level-${level})` }}
                />
              ))}
              <span>7+</span>
            </div>
          </div>
          {overview === null ? (
            <div className="card-placeholder" />
          ) : (
            <>
              <ActivityGrid
                cells={overview.cells}
                monthLabel={formatMonthYear(monthDate)}
                activeDays={overview.activeDays}
                monthTotal={overview.monthTotal}
              />
              <StatsTiles tiles={tiles} />
            </>
          )}
        </div>
      </div>
    </section>
  );
});
