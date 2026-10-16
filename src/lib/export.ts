import type { JobApplication } from "./types.ts";
import type { ExportFormat } from "./messages.ts";

export const CSV_COLUMNS = [
  "id",
  "source",
  "nativeBoardId",
  "title",
  "company",
  "location",
  "jobType",
  "modality",
  "pay",
  "skills",
  "requirements",
  "status",
  "datePosted",
  "dateApplied",
  "createdAt",
  "updatedAt",
  "url",
] as const satisfies readonly (keyof JobApplication)[];

const ARRAY_SEPARATOR = "; ";

/** Job text is third-party, so a leading =, +, - or @ is neutralised: Excel and
 * Sheets would otherwise execute it as a formula on open. */
function csvCell(value: JobApplication[keyof JobApplication]): string {
  const raw = Array.isArray(value) ? value.join(ARRAY_SEPARATOR) : (value ?? "");
  const text = String(raw);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

export function toCsv(rows: readonly JobApplication[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => csvCell(row[column])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function toJson(rows: readonly JobApplication[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}

export function exportFilename(format: ExportFormat, now: Date): string {
  const date = now.toISOString().slice(0, 10);
  return `jobsearch-copilot-${date}.${format}`;
}

export function mimeFor(format: ExportFormat): string {
  return format === "csv" ? "text/csv" : "application/json";
}
