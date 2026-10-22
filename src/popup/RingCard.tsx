import { memo } from "react";
import type { ReactElement } from "react";

import { Ring } from "./Ring.tsx";
import type { RingView } from "./derive.ts";

type RingCardProps = {
  month: RingView;
  week: RingView;
  total: RingView;
};

function RingCardImpl({ month, week, total }: RingCardProps): ReactElement {
  return (
    <section className="card ring-card">
      <div className="ring-slot">
        <Ring size={84} stroke={7} progress={month.progress} value={month.value} valueSize={22} />
      </div>
      <div className="ring-slot">
        <Ring
          size={120}
          stroke={10}
          progress={week.progress}
          value={week.value}
          valueSize={40}
          sub={`of ${week.goal}`}
        />
      </div>
      <div className="ring-slot">
        <Ring size={84} stroke={7} progress={total.progress} value={total.value} valueSize={22} />
      </div>

      <div className="ring-labels">
        <span className="ring-label">{month.label}</span>
        <span className="ring-caption">{month.caption}</span>
      </div>
      <div className="ring-labels">
        <span className="ring-label ring-label--lead">{week.label}</span>
        <span className="ring-caption">{week.caption}</span>
      </div>
      <div className="ring-labels">
        <span className="ring-label">{total.label}</span>
        <span className="ring-caption">{total.caption}</span>
      </div>
    </section>
  );
}

export const RingCard = memo(RingCardImpl);
