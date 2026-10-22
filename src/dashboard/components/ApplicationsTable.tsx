import { memo } from "react";
import type { ReactElement } from "react";

import type { JobApplication } from "../../lib/types.ts";
import { PAGE_SIZES } from "../config.ts";
import type { SortDirection } from "../data/select.ts";
import { pageCount } from "../data/select.ts";
import { ApplicationRow } from "./ApplicationRow.tsx";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons.tsx";

const COLUMNS = [
  "Role",
  "Source",
  "Location",
  "Type",
  "Modality",
  "Pay",
  "Skills",
  "Status",
] as const;

export type ApplicationsTableProps = {
  rows: readonly JobApplication[];
  total: number;
  pageIndex: number;
  pageSize: number;
  direction: SortDirection;
  busy: boolean;
  onToggleDirection: () => void;
  onPageIndex: (index: number) => void;
  onPageSize: (size: number) => void;
};

export const ApplicationsTable = memo(function ApplicationsTable({
  rows,
  total,
  pageIndex,
  pageSize,
  direction,
  busy,
  onToggleDirection,
  onPageIndex,
  onPageSize,
}: ApplicationsTableProps): ReactElement {
  const pages = pageCount(total, pageSize);
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, total);

  return (
    <div className="table-wrap">
      {/* Kept mounted so the previous page stays visible while the next loads. */}
      <div className={busy ? "progress is-busy" : "progress"} aria-hidden="true" />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col" aria-sort={direction === "desc" ? "descending" : "ascending"}>
                <button type="button" className="sort-button" onClick={onToggleDirection}>
                  Date applied
                  <span aria-hidden="true">{direction === "desc" ? " ↓" : " ↑"}</span>
                </button>
              </th>
              {COLUMNS.map((column: string): ReactElement => (
                <th scope="col" key={column}>
                  {column}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">Link</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="empty" colSpan={10}>
                  No applications match these filters.
                </td>
              </tr>
            ) : (
              rows.map((record: JobApplication): ReactElement => (
                <ApplicationRow key={record.id} record={record} />
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <label className="rows-per-page" htmlFor="rows-per-page">
          Rows per page
        </label>
        <select
          id="rows-per-page"
          value={pageSize}
          onChange={(event): void => onPageSize(Number(event.target.value))}
        >
          {PAGE_SIZES.map((size: number): ReactElement => (
            <option value={size} key={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="range">{`${from}–${to} of ${total}`}</span>
        <button
          type="button"
          className="icon-button"
          onClick={(): void => onPageIndex(pageIndex - 1)}
          disabled={pageIndex <= 0}
          aria-label="Previous page"
        >
          <ChevronLeftIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={(): void => onPageIndex(pageIndex + 1)}
          disabled={pageIndex >= pages - 1}
          aria-label="Next page"
        >
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
});
