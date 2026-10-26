import { afterEach, expect, test } from "bun:test";

import { readWatchRows, resetWatch, WATCH_STATE_RESETTABLE, type WatchRow } from "./watch.ts";

type Sent = { type: string; payload?: { domain: string } };

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

function states(rows: readonly WatchRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((row: WatchRow): [string, string] => [row.domain, row.state]));
}

test("every stored choice maps to its row state, and an unset board to unasked", async () => {
  installWorker({
    GET_SETTINGS: {
      ok: true,
      settings: { activation: { "indeed.com": "yes", "linkedin.com": "never" } },
      suppressed: [],
    },
  });

  const rows = await readWatchRows();

  expect(rows.map((row: WatchRow): string => row.label)).toEqual([
    "LinkedIn",
    "Indeed",
    "Handshake",
  ]);
  expect(states(rows)).toEqual({
    "linkedin.com": "off",
    "indeed.com": "watching",
    "joinhandshake.com": "unasked",
  });
});

test("a failed read is reported as itself, never as a decision the user made", async (): Promise<void> => {
  installWorker({ GET_SETTINGS: { ok: false, reason: "no response" } });

  const rows = await readWatchRows();

  expect(rows).toHaveLength(3);
  expect(new Set(rows.map((row: WatchRow): string => row.state))).toEqual(new Set(["unavailable"]));
  expect(WATCH_STATE_RESETTABLE["unavailable"]).toBe(false);
});

test("a board answered Not now is reported as such, and can be reset", async (): Promise<void> => {
  installWorker({
    GET_SETTINGS: { ok: true, settings: { activation: {} }, suppressed: ["indeed.com"] },
  });

  expect(states(await readWatchRows())).toEqual({
    "linkedin.com": "unasked",
    "indeed.com": "not-now",
    "joinhandshake.com": "unasked",
  });
  expect(WATCH_STATE_RESETTABLE["not-now"]).toBe(true);
});

test("a stored answer outranks the session suppression", async (): Promise<void> => {
  installWorker({
    GET_SETTINGS: {
      ok: true,
      settings: { activation: { "indeed.com": "never", "linkedin.com": "yes" } },
      suppressed: ["indeed.com", "linkedin.com"],
    },
  });

  const byDomain = states(await readWatchRows());

  expect(byDomain["indeed.com"]).toBe("off");
  expect(byDomain["linkedin.com"]).toBe("watching");
});

test("a reset names the board it clears and reports whether it landed", async (): Promise<void> => {
  const sent = installWorker({ RESET_ACTIVATION: { ok: true } });

  expect(await resetWatch("indeed.com")).toBe(true);
  expect(sent).toEqual([{ type: "RESET_ACTIVATION", payload: { domain: "indeed.com" } }]);
});

test("a dropped port is reported, never thrown", async (): Promise<void> => {
  installWorker({});
  expect(await resetWatch("indeed.com")).toBe(false);
});
