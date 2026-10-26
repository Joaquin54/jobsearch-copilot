import { memo } from "react";
import type { ReactElement } from "react";

import type { ApplicationStatus, JobSource } from "../../lib/types.ts";
import type { CompanyOption } from "../data/catalog.ts";
import { hasActiveFilter, type TableFilters } from "../data/select.ts";
import { CheckIcon } from "./icons.tsx";

type StatusChoice = ApplicationStatus | "all";
type SourceChoice = JobSource;

const STATUS_CHOICES: readonly { value: StatusChoice; label: string }[] = [
  { value: "all", label: "All" },
  { value: "applied", label: "Applied" },
  { value: "pending", label: "Pending" },
];

const SOURCE_CHOICES: readonly { value: SourceChoice; label: string }[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  { value: "handshake", label: "Handshake" },
];

export type ToolbarProps = {
  filters: TableFilters;
  companies: readonly CompanyOption[];
  companiesLoading: boolean;
  onStatus: (status: StatusChoice) => void;
  onSource: (source: SourceChoice | "all") => void;
  onCompanyKey: (companyKey: string | null) => void;
  onCompanyOpen: () => void;
  onClear: () => void;
};

export const Toolbar = memo(function Toolbar({
  filters,
  companies,
  companiesLoading,
  onStatus,
  onSource,
  onCompanyKey,
  onCompanyOpen,
  onClear,
}: ToolbarProps): ReactElement {
  return (
    <div className="toolbar" role="toolbar" aria-label="Filter applications">
      <div className="segmented">
        {STATUS_CHOICES.map((choice): ReactElement => {
          const selected = filters.status === choice.value;
          return (
            <button
              type="button"
              key={choice.value}
              className={selected ? "segment is-selected" : "segment"}
              aria-pressed={selected}
              onClick={(): void => onStatus(choice.value)}
            >
              {selected ? <CheckIcon /> : null}
              {choice.label}
            </button>
          );
        })}
      </div>

      <div className="chip-filters">
        {SOURCE_CHOICES.map((choice): ReactElement => {
          const selected = filters.source === choice.value;
          return (
            <button
              type="button"
              key={choice.value}
              className={selected ? "filter-chip is-selected" : "filter-chip"}
              aria-pressed={selected}
              // Pressing the active chip clears the dimension rather than
              // leaving the user with no way back to "both".
              onClick={(): void => onSource(selected ? "all" : choice.value)}
            >
              {choice.label}
            </button>
          );
        })}
      </div>

      <div className="company-filter">
        <label htmlFor="company-filter">Company</label>
        <select
          id="company-filter"
          value={filters.companyKey ?? ""}
          // The company index needs record reads, so it is loaded the first
          // time this control is touched rather than on page load.
          onFocus={onCompanyOpen}
          onPointerDown={onCompanyOpen}
          onChange={(event): void => onCompanyKey(event.target.value === "" ? null : event.target.value)}
        >
          <option value="">{companiesLoading ? "Loading…" : "All companies"}</option>
          {companies.map((option: CompanyOption): ReactElement => (
            <option value={option.companyKey} key={option.companyKey}>
              {option.company}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilter(filters) ? (
        <button type="button" className="text-button" onClick={onClear}>
          Clear filters
        </button>
      ) : null}
    </div>
  );
});
