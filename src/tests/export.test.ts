import { expect, test } from "bun:test";

import { CSV_COLUMNS, exportFilename, mimeFor, toCsv, toJson } from "../lib/export.ts";
import type { JobApplication } from "../lib/types.ts";

const row: JobApplication = {
  id: "linkedin:1",
  source: "linkedin",
  nativeBoardId: "1",
  url: "https://example.test/1",
  title: 'Engineer, "Platform"',
  company: 'a, "b"\nc',
  companyKey: 'a, "b"\nc',
  location: "Toronto, ON",
  jobType: "Full-Time",
  modality: "Remote",
  pay: null,
  skills: ["TypeScript", "Go"],
  requirements: [],
  datePosted: null,
  dateApplied: "2026-10-01T10:00:00.000Z",
  status: "applied",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
};

test("csv header matches the declared column order", (): void => {
  expect(toCsv([]).trim()).toBe(CSV_COLUMNS.join(","));
});

test("commas, quotes and newlines are RFC-4180 quoted", (): void => {
  const csv = toCsv([row]);
  expect(csv).toContain('"a, ""b""\nc"');
  expect(csv).toContain('"Engineer, ""Platform"""');
  expect(csv).toContain('"Toronto, ON"');
});

test("arrays join with a semicolon and nulls render empty", (): void => {
  const line = toCsv([row]).split("\r\n")[1] as string;
  expect(line).toContain("TypeScript; Go");
  const cells = line.split(",");
  expect(cells.includes("")).toBe(true);
});

test("formula-leading cells are neutralised", (): void => {
  const malicious: JobApplication = { ...row, title: "=HYPERLINK(\"http://evil.test\")", company: "Acme" };
  const csv = toCsv([malicious]);
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).not.toMatch(/,=HYPERLINK/);
});

test("json round-trips deep-equal", (): void => {
  expect(JSON.parse(toJson([row]))).toEqual([row]);
});

test("filename carries the date and extension", (): void => {
  expect(exportFilename("csv", new Date("2026-10-15T23:00:00.000Z"))).toBe(
    "jobsearch-copilot-2026-10-15.csv",
  );
  expect(mimeFor("json")).toBe("application/json");
});
