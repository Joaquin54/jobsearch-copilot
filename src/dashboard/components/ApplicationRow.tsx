import { memo } from "react";
import type { ReactElement } from "react";

import type { JobApplication } from "../../lib/types.ts";
import { isDisplayableJobUrl } from "../lib/safeUrl.ts";
import { formatDayMonth, formatTime } from "../time/formats.ts";
import { OpenInNewIcon } from "./icons.tsx";

const SOURCE_LABEL: Record<JobApplication["source"], string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  handshake: "Handshake",
};

const STATUS_LABEL: Record<JobApplication["status"], string> = {
  applied: "Applied",
  pending: "Pending",
};

const MAX_SKILLS = 3;

/**
 * Every field here is scraped third-party text and is rendered as React text
 * only — never as markup. The row takes no callbacks, so its props change only
 * when the record itself does.
 */
export const ApplicationRow = memo(function ApplicationRow({
  record,
}: {
  record: JobApplication;
}): ReactElement {
  const shown = record.skills.slice(0, MAX_SKILLS);
  const rest = record.skills.slice(MAX_SKILLS);
  const linkable = isDisplayableJobUrl(record.url);

  return (
    <tr>
      <td>
        <div className="cell-strong">{formatDayMonth(record.dateApplied)}</div>
        <div className="cell-sub">{formatTime(record.dateApplied)}</div>
      </td>
      <td>
        <div className="cell-title">{record.title}</div>
        <div className="cell-sub">
          {record.company} ·{" "}
          {record.datePosted === null
            ? "Post date unknown"
            : `Posted ${formatDayMonth(record.datePosted)}`}
        </div>
      </td>
      <td>
        <span className="source">
          <span className={`source-dot is-${record.source}`} aria-hidden="true" />
          {SOURCE_LABEL[record.source]}
        </span>
      </td>
      <td>{record.location}</td>
      <td>{record.jobType ?? <span className="muted">—</span>}</td>
      <td>
        {record.modality === null ? (
          <span className="muted">—</span>
        ) : (
          <span className="chip is-outlined">{record.modality}</span>
        )}
      </td>
      <td>{record.pay ?? <span className="muted">Not listed</span>}</td>
      <td>
        <span className="skills">
          {shown.map((skill: string): ReactElement => (
            <span className="chip" key={skill}>
              {skill}
            </span>
          ))}
          {rest.length > 0 ? (
            <span className="chip is-more" title={rest.join(", ")}>
              {`+${rest.length}`}
            </span>
          ) : null}
        </span>
      </td>
      <td>
        <span className={`pill is-${record.status}`}>
          <span className="pill-dot" aria-hidden="true" />
          {STATUS_LABEL[record.status]}
        </span>
      </td>
      <td>
        {/* A row whose url is not an https job-board link is shown without one. */}
        {linkable ? (
          <a
            className="icon-button"
            href={record.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${record.title} at ${record.company} on ${SOURCE_LABEL[record.source]}`}
          >
            <OpenInNewIcon />
          </a>
        ) : null}
      </td>
    </tr>
  );
});
