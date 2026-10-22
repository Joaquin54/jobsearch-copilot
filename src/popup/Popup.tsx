import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";

import { ActivityCard } from "./ActivityCard.tsx";
import { DashboardButton } from "./DashboardButton.tsx";
import { Header } from "./Header.tsx";
import { RingCard } from "./RingCard.tsx";
import { derive } from "./derive.ts";
import type { View } from "./derive.ts";
import { fetchWindow } from "./load.ts";
import type { Window as DataWindow } from "./load.ts";

/**
 * Started at module scope so the round trip overlaps React's first mount: the
 * effect below only awaits it. One request, one setState, no waterfall.
 */
const NOW = new Date();
const pending: Promise<DataWindow> = fetchWindow(NOW);

/** Shape the skeleton from the same derivation, so every box is final-size. */
const EMPTY: View = derive(new Map(), 0, NOW);

if (import.meta.env.DEV) {
  void import("../dashboard/dev/seed.ts").then((module): void => module.installSeeder(0));
}

export default function Popup(): ReactElement {
  const [data, setData] = useState<DataWindow | null>(null);

  useEffect((): (() => void) => {
    let cancelled = false;
    void pending.then((result: DataWindow): void => {
      if (!cancelled) setData(result);
    });
    return (): void => {
      cancelled = true;
    };
  }, []);

  const view = useMemo(
    (): View => (data === null ? EMPTY : derive(data.counts, data.total, NOW)),
    [data],
  );

  return (
    <div className="popup" data-loading={data === null ? "true" : "false"}>
      <Header monthYear={view.monthYear} />
      <main className="body">
        <RingCard month={view.rings.month} week={view.rings.week} total={view.rings.total} />
        <ActivityCard
          title={view.activityTitle}
          columns={view.columns}
          cells={view.cells}
          gridLabel={view.gridLabel}
          stats={view.stats}
        />
        <DashboardButton />
      </main>
    </div>
  );
}
