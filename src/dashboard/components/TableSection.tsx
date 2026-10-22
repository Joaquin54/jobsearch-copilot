import { useEffect } from "react";
import type { ReactElement, RefObject } from "react";

import type { Catalog, CompanyIndex } from "../data/catalog.ts";
import { useTable } from "../hooks/useTable.ts";
import { ApplicationsTable } from "./ApplicationsTable.tsx";
import { Toolbar } from "./Toolbar.tsx";

export type TableSectionProps = {
  catalog: Catalog | null;
  companies: CompanyIndex | null;
  companiesLoading: boolean;
  requestCompanies: () => void;
  /**
   * Published through a ref rather than a callback prop so the header's export
   * button can read the live filter selection without re-rendering on every
   * table change.
   */
  collectIdsRef: RefObject<(() => readonly string[]) | null>;
};

/**
 * Owns all table state. Because the state lives here and not in Dashboard, a
 * filter or page change cannot produce a render above this component, so the
 * overview is structurally unable to re-render on paging.
 */
export function TableSection({
  catalog,
  companies,
  companiesLoading,
  requestCompanies,
  collectIdsRef,
}: TableSectionProps): ReactElement {
  const table = useTable(catalog, companies);

  useEffect((): void => {
    collectIdsRef.current = table.allIds;
  }, [collectIdsRef, table.allIds]);

  return (
    <section className="section">
      <div className="section-head">
        <h2>All applications</h2>
        <span className="count-pill">{table.total}</span>
      </div>

      <Toolbar
        filters={table.filters}
        companies={companies?.options ?? []}
        companiesLoading={companiesLoading}
        onStatus={table.setStatus}
        onSource={table.setSource}
        onCompanyKey={table.setCompanyKey}
        onCompanyOpen={requestCompanies}
        onClear={table.clearFilters}
      />

      <ApplicationsTable
        rows={table.rows}
        total={table.total}
        pageIndex={table.pageIndex}
        pageSize={table.pageSize}
        direction={table.direction}
        busy={table.pending || table.stale}
        onToggleDirection={table.toggleDirection}
        onPageIndex={table.setPageIndex}
        onPageSize={table.setPageSize}
      />
    </section>
  );
}
