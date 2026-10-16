import { beforeEach, expect, test } from "bun:test";

import { installChromeDouble } from "./chromeDouble.ts";
import {
  defaultSettings,
  isSuppressedThisSession,
  readSettings,
  resolveActivation,
  setActivation,
  setQuotaWarned,
  wasQuotaWarned,
} from "../lib/settings.ts";
import { isOverThreshold, WARN_RATIO } from "../lib/quota.ts";

let stores: { local: Record<string, unknown>; session: Record<string, unknown> };

beforeEach((): void => {
  stores = installChromeDouble();
});

test("unset storage yields the defaults", async (): Promise<void> => {
  expect(await readSettings()).toEqual(defaultSettings());
  expect(await resolveActivation("linkedin.com")).toBe("ask");
});

test("yes activates the domain permanently", async (): Promise<void> => {
  await setActivation("linkedin.com", "yes");
  expect(await resolveActivation("linkedin.com")).toBe("active");
  expect(await resolveActivation("indeed.com")).toBe("ask");
});

test("never suppresses the domain permanently", async (): Promise<void> => {
  await setActivation("indeed.com", "never");
  expect(await resolveActivation("indeed.com")).toBe("suppressed");
});

test("not-now lands in session storage, not local", async (): Promise<void> => {
  await setActivation("linkedin.com", "not-now");
  expect(await isSuppressedThisSession("linkedin.com")).toBe(true);
  expect(await resolveActivation("linkedin.com")).toBe("suppressed");
  expect(stores.local).toEqual({});
  expect(Object.keys(stores.session)).toEqual(["suppressed:linkedin.com"]);
});

test("quota warned flag is session-scoped and clearable", async (): Promise<void> => {
  expect(await wasQuotaWarned()).toBe(false);
  await setQuotaWarned(true);
  expect(await wasQuotaWarned()).toBe(true);
  expect(stores.local).toEqual({});

  await setQuotaWarned(false);
  expect(await wasQuotaWarned()).toBe(false);
});

test("threshold trips at exactly 80 percent", (): void => {
  expect(WARN_RATIO).toBe(0.8);
  expect(isOverThreshold({ usage: 79, quota: 100, ratio: 0.79 })).toBe(false);
  expect(isOverThreshold({ usage: 80, quota: 100, ratio: 0.8 })).toBe(true);
  expect(isOverThreshold({ usage: 0, quota: 0, ratio: 0 })).toBe(false);
});
