import { useCallback, useEffect, useRef, useState } from "react";

import { buildCatalog, buildCompanyIndex, type Catalog, type CompanyIndex } from "../data/catalog.ts";
import { latestUpdatedAt } from "../data/aggregate.ts";
import type { IsoDate } from "../../lib/types.ts";

export type CatalogState = {
  catalog: Catalog | null;
  companies: CompanyIndex | null;
  newestUpdatedAt: IsoDate | null;
  /** True only while a requested company load is actually in flight. */
  companiesLoading: boolean;
  /** Loads the company index on first use of the company filter. */
  requestCompanies: () => void;
};

export function useCatalog(): CatalogState {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [companies, setCompanies] = useState<CompanyIndex | null>(null);
  const [newestUpdatedAt, setNewestUpdatedAt] = useState<IsoDate | null>(null);
  const [companiesLoading, setCompaniesLoading] = useState<boolean>(false);

  const aliveRef = useRef<boolean>(true);
  const companiesStartedRef = useRef<boolean>(false);

  useEffect((): (() => void) => {
    aliveRef.current = true;
    const isStale = (): boolean => !aliveRef.current;

    void buildCatalog(isStale).then((next: Catalog): void => {
      if (!aliveRef.current) return;
      setCatalog(next);
    });

    void latestUpdatedAt().then((stamp: IsoDate | null): void => {
      if (!aliveRef.current) return;
      setNewestUpdatedAt(stamp);
    });

    return (): void => {
      aliveRef.current = false;
    };
  }, []);

  const requestCompanies = useCallback((): void => {
    if (companiesStartedRef.current) return;
    companiesStartedRef.current = true;
    setCompaniesLoading(true);
    void buildCompanyIndex((): boolean => !aliveRef.current).then((next: CompanyIndex): void => {
      if (!aliveRef.current) return;
      setCompanies(next);
      setCompaniesLoading(false);
    });
  }, []);

  return { catalog, companies, newestUpdatedAt, companiesLoading, requestCompanies };
}
