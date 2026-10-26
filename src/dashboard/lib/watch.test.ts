import { afterEach, expect, test } from "bun:test";

import { readWatchRows, resetWatch, type WatchRow } from "./watch.ts";

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

test("a failed read still lists every board, as unasked", async (): Promise<void> => {
  installWorker({ GET_SETTINGS: { ok: false, reason: "no response" } });

  const rows = await readWatchRows();

  expect(rows).toHaveLength(3);
  expect(new Set(rows.map((row: WatchRow): string => row.state))).toEqual(new Set(["unasked"]));
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
