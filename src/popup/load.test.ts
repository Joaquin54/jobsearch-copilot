import { afterEach, expect, test } from "bun:test";

import { fetchWindow, windowStartIso, STREAK_WINDOW_DAYS } from "./load.ts";
import { addDays, startOfDay } from "../lib/localDays.ts";

type Sent = { type: string; payload?: { filter: { status?: string; from?: string; to?: string } } };

const originalChrome: unknown = (globalThis as { chrome?: unknown }).chrome;

afterEach((): void => {
  (globalThis as { chrome?: unknown }).chrome = originalChrome;
});

/** Stands in for the background worker; records every message it is sent. */
function installWorker(responses: Record<string, unknown>): Sent[] {
  const sent: Sent[] = [];
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      sendMessage: (message: Sent): Promise<unknown> => {
        sent.push(message);
        return Promise.resolve(responses[message.type]);
      },
    },
  };
  return sent;
}

test("one day-counts read and one lifetime count, both filtered to applied", async () => {
  const now = new Date(2026, 9, 21, 12);
  const sent = installWorker({
    DAY_COUNTS: { ok: true, counts: [["2026-10-20", 2]] },
    COUNT_APPLICATIONS: { ok: true, count: 214 },
  });

  const result = await fetchWindow(now);

  expect(sent.length).toBe(2);
  expect(sent.map((message: Sent): string => message.type).sort()).toEqual([
    "COUNT_APPLICATIONS",
    "DAY_COUNTS",
  ]);

  const days = sent.find((message: Sent): boolean => message.type === "DAY_COUNTS");
  expect(days?.payload?.filter).toEqual({
    status: "applied",
    from: addDays(startOfDay(now), -STREAK_WINDOW_DAYS).toISOString(),
  });

  // The lifetime count is deliberately unwindowed, so the milestone ring does
  // not quietly become a windowed figure.
  const lifetime = sent.find((message: Sent): boolean => message.type === "COUNT_APPLICATIONS");
  expect(lifetime?.payload?.filter).toEqual({ status: "applied" });

  expect(result.total).toBe(214);
  expect(result.counts.get("2026-10-20")).toBe(2);
  expect(result.failed).toBe(false);
});

test("the window reaches back far enough to measure a long streak", () => {
  const now = new Date(2026, 9, 21, 12);
  expect(windowStartIso(now)).toBe(new Date(2025, 8, 16).toISOString());
  expect(STREAK_WINDOW_DAYS).toBe(400);
});

test("a worker failure surfaces as an empty, flagged window instead of throwing", async () => {
  installWorker({
    DAY_COUNTS: { ok: false, reason: "no response" },
    COUNT_APPLICATIONS: { ok: true, count: 3 },
  });

  const result = await fetchWindow(new Date(2026, 9, 21, 12));
  expect(result.failed).toBe(true);
  expect(result.total).toBe(0);
  expect(result.counts.size).toBe(0);
});
