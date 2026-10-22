import { beforeEach, expect, test } from "bun:test";

import { getPending, setPending } from "../lib/pending.ts";
import { installChromeDouble } from "./chromeDouble.ts";

const ROW = { id: "linkedin:4012345678", jobId: "4012345678", company: "Northwind Labs" };

beforeEach((): void => {
  installChromeDouble();
});

test("a pending row survives for its own tab", async (): Promise<void> => {
  expect(await getPending(7)).toBeNull();

  await setPending(7, ROW);
  expect(await getPending(7)).toEqual(ROW);
});

test("tabs do not answer for each other", async (): Promise<void> => {
  await setPending(7, ROW);
  await setPending(8, { ...ROW, id: "linkedin:99", jobId: "99", company: "Meridian" });

  expect(await getPending(7)).toEqual(ROW);
  expect((await getPending(8))?.company).toBe("Meridian");
});

test("clearing removes the row, and a closed tab leaves nothing behind", async (): Promise<void> => {
  const { session } = installChromeDouble();
  await setPending(7, ROW);
  await setPending(7, null);

  expect(await getPending(7)).toBeNull();
  expect(Object.keys(session)).toHaveLength(0);
});

test("a malformed stored value reads as no pending row", async (): Promise<void> => {
  const { session } = installChromeDouble();
  session["pending:7"] = { company: "Northwind Labs" };
  expect(await getPending(7)).toBeNull();
});
