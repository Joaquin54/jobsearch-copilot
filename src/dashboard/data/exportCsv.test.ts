import { expect, test } from "bun:test";

import { CSV_COLUMNS, toCsv } from "../../lib/export.ts";
import type { JobApplication } from "../../lib/types.ts";
import { stripHeader } from "./exportCsv.ts";

const HEADER = `${CSV_COLUMNS.join(",")}\r\n`;

function row(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: "linkedin:1",
    source: "linkedin",
    nativeBoardId: "1",
    url: "https://www.linkedin.com/jobs/view/1",
    title: "Engineer",
    company: "Acme Corp",
    companyKey: "acme corp",
    location: "Toronto, ON",
    jobType: "Full-Time",
    modality: "Remote",
    pay: null,
    skills: ["TypeScript"],
    requirements: [],
    datePosted: null,
    dateApplied: "2026-10-19T12:00:00.000Z",
    status: "applied",
    createdAt: "2026-10-19T12:00:00.000Z",
    updatedAt: "2026-10-19T12:00:00.000Z",
    ...overrides,
  };
}

test("the first chunk keeps its header", (): void => {
  const text = toCsv([row()]);
  expect(stripHeader(text, 0)).toBe(text);
  expect(stripHeader(text, 0).startsWith(HEADER)).toBe(true);
});

test("later chunks lose the header", (): void => {
  const text = toCsv([row()]);
  const stripped = stripHeader(text, 1);
  expect(stripped.startsWith(HEADER)).toBe(false);
  expect(stripped).toBe(text.slice(HEADER.length));
});

test("a concatenated export has exactly one header line", (): void => {
  const chunks = [toCsv([row()]), toCsv([row()]), toCsv([row()])];
  const joined = chunks.map((text: string, index: number): string => stripHeader(text, index)).join("");
  const headerLines = joined
    .split("\r\n")
    .filter((line: string): boolean => line.startsWith("id,source"));
  expect(headerLines).toHaveLength(1);
  // Three data rows plus one header, and a trailing terminator.
  expect(joined.split("\r\n").filter((line: string): boolean => line !== "")).toHaveLength(4);
});

test("a changed header shape is caught rather than emitting a stray row", (): void => {
  expect((): string => stripHeader("something,else\r\ndata\r\n", 1)).toThrow(
    "toCsv header shape changed",
  );
});

/** The guard lives in src/lib/export.ts; this pins that the export path keeps it. */
test("formula injection stays neutralised through the chunk path", (): void => {
  const text = stripHeader(toCsv([row({ title: "=cmd|'/c calc'!A1" })]), 1);
  expect(text).toContain("'=cmd");
  expect(text.startsWith("=")).toBe(false);
});

test("quotes commas and newlines stay RFC 4180 escaped through the chunk path", (): void => {
  const text = stripHeader(toCsv([row({ company: 'a, "b"\nc' })]), 1);
  expect(text).toContain('"a, ""b""\nc"');
});

test("an empty export is header only", (): void => {
  const text = toCsv([]);
  expect(text).toBe(`${CSV_COLUMNS.join(",")}\r\n`);
});

test("companyKey is never exported", (): void => {
  expect(CSV_COLUMNS).not.toContain("companyKey");
});
