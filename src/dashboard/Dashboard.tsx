import { useCallback, useMemo, useRef } from "react";
import type { ReactElement } from "react";

import { ExportButton } from "./components/ExportButton.tsx";
import { OverviewSection } from "./components/OverviewSection.tsx";
import { TableSection } from "./components/TableSection.tsx";
import { WatchSection } from "./components/WatchSection.tsx";
import { PaperPlaneIcon } from "./components/icons.tsx";
import { useCatalog } from "./hooks/useCatalog.ts";
import { formatUpdatedAt } from "./time/formats.ts";

export default function Dashboard(): ReactElement {
  const { catalog, companies, newestUpdatedAt, companiesLoading, requestCompanies } = useCatalog();
  const collectIdsRef = useRef<(() => readonly string[]) | null>(null);

  const now = useMemo((): Date => new Date(), []);

  // Stable, so the export button never re-renders as the table changes.
  const collectIds = useCallback((): readonly string[] => {
    return collectIdsRef.current?.() ?? [];
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">
            <PaperPlaneIcon />
          </span>
          <div>
            <h1>Applications</h1>
            <p className="brand-sub">{formatUpdatedAt(newestUpdatedAt, now)}</p>
          </div>
        </div>
        <ExportButton collectIds={collectIds} />
      </header>

      <main>
        <OverviewSection />
        <TableSection
          catalog={catalog}
          companies={companies}
          companiesLoading={companiesLoading}
          requestCompanies={requestCompanies}
          collectIdsRef={collectIdsRef}
        />
        <WatchSection />
      </main>
    </div>
  );
}
