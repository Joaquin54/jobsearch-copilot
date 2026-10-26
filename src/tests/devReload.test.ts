import { afterEach, beforeEach, expect, test } from "bun:test";

import { maybeReloadForNewBuild } from "../background/devReload.ts";
import { BUILD_ID } from "../lib/build.ts";
import { installChromeDouble } from "./chromeDouble.ts";

type Runtime = {
  getManifest: () => { update_url?: string };
  getURL: (path: string) => string;
  reload: () => void;
};

const originalFetch = globalThis.fetch;
let reloads = 0;
let fetched: string[] = [];

/** Serves one build.json, as Chrome does for an unpacked extension's own file. */
function install(onDisk: unknown, updateUrl?: string): ReturnType<typeof installChromeDouble> {
  const areas: ReturnType<typeof installChromeDouble> = installChromeDouble();
  reloads = 0;
  fetched = [];

  const runtime: Runtime = {
    getManifest: (): { update_url?: string } =>
      updateUrl === undefined ? {} : { update_url: updateUrl },
    getURL: (path: string): string => `chrome-extension://abc/${path}`,
    reload: (): void => {
      reloads += 1;
    },
  };
  (globalThis as { chrome: { runtime?: unknown } }).chrome.runtime = runtime;

  globalThis.fetch = ((url: string): Promise<Response> => {
    fetched.push(url);
    if (onDisk === undefined) return Promise.reject(new Error("not found"));
    return Promise.resolve({ json: (): Promise<unknown> => Promise.resolve(onDisk) } as Response);
  }) as typeof fetch;
  return areas;
}

beforeEach((): void => {
  // Every test asserts against the id this worker was compiled with.
  expect(BUILD_ID).toBe("dev");
});

afterEach((): void => {
  globalThis.fetch = originalFetch;
});

test("a different id on disk reloads the extension, once", async (): Promise<void> => {
  install({ id: "2026-10-25T18:00:00.000Z" });

  expect(await maybeReloadForNewBuild()).toBe(true);
  expect(reloads).toBe(1);
  expect(fetched).toEqual(["chrome-extension://abc/build.json"]);

  // Same id on disk, so the second call is the one that would have looped.
  expect(await maybeReloadForNewBuild()).toBe(false);
  expect(reloads).toBe(1);
});

// This passes because the id on disk differs, not because of the per-id guard:
// install() empties both storage areas, so the guard is not even consulted.
test("a newer id after the first attempt is still acted on", async (): Promise<void> => {
  install({ id: "2026-10-25T18:00:00.000Z" });
  await maybeReloadForNewBuild();

  install({ id: "2026-10-25T19:00:00.000Z" });
  expect(await maybeReloadForNewBuild()).toBe(true);
  expect(reloads).toBe(1);
});

test("the same id on disk changes nothing", async (): Promise<void> => {
  install({ id: BUILD_ID });
  expect(await maybeReloadForNewBuild()).toBe(false);
  expect(reloads).toBe(0);
});

test("a packed install is left alone and never even read", async (): Promise<void> => {
  install({ id: "2026-10-25T18:00:00.000Z" }, "https://clients2.google.com/service/update2/crx");
  expect(await maybeReloadForNewBuild()).toBe(false);
  expect(reloads).toBe(0);
  expect(fetched).toEqual([]);
});

test("a missing or malformed stamp is not a reason to reload", async (): Promise<void> => {
  install(undefined);
  expect(await maybeReloadForNewBuild()).toBe(false);

  install({ nope: true });
  expect(await maybeReloadForNewBuild()).toBe(false);

  install({ id: "" });
  expect(await maybeReloadForNewBuild()).toBe(false);
  expect(reloads).toBe(0);
});

test("the attempt guard is kept in the area that survives a reload", async (): Promise<void> => {
  const { local, session } = install({ id: "2026-10-25T18:00:00.000Z" });
  await maybeReloadForNewBuild();

  expect(local["reloadAttempt"]).toBe("2026-10-25T18:00:00.000Z");
  expect(session["reloadAttempt"]).toBeUndefined();
});

test("the attempt guard is cleared once the ids agree", async (): Promise<void> => {
  const { local } = install({ id: BUILD_ID });
  local["reloadAttempt"] = "2026-10-25T18:00:00.000Z";

  expect(await maybeReloadForNewBuild()).toBe(false);
  expect("reloadAttempt" in local).toBe(false);
});
