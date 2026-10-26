import { afterEach, expect, test } from "bun:test";

import { BUILD_ID } from "../lib/build.ts";
import { installChromeDouble } from "./chromeDouble.ts";

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean;

const originalFetch = globalThis.fetch;

afterEach((): void => {
  globalThis.fetch = originalFetch;
});

test("handling GET_ACTIVATION never reloads the extension", async (): Promise<void> => {
  installChromeDouble();
  let reloads = 0;
  let onMessage: Listener | null = null;
  const noEvent: { addListener: () => void } = { addListener: (): void => {} };

  // The stamp matches while the module loads, so only a per-page check could reload.
  let onDisk: string = BUILD_ID;
  globalThis.fetch = ((): Promise<Response> =>
    Promise.resolve({ json: (): Promise<unknown> => Promise.resolve({ id: onDisk }) } as Response)) as unknown as typeof fetch;

  Object.assign((globalThis as { chrome: object }).chrome, {
    runtime: {
      getManifest: (): object => ({}),
      getURL: (path: string): string => `chrome-extension://abc/${path}`,
      reload: (): void => {
        reloads += 1;
      },
      onInstalled: noEvent,
      onMessage: { addListener: (l: Listener): void => { onMessage = l; } },
    },
    tabs: { onRemoved: noEvent },
  });

  await import("../background/index.ts");
  await new Promise<void>((r: () => void): void => { setTimeout(r, 0); });
  expect(reloads).toBe(0);

  onDisk = "2099-01-01T00:00:00.000Z";
  const response: unknown = await new Promise<unknown>((resolve: (v: unknown) => void): void => {
    (onMessage as unknown as Listener)(
      { type: "GET_ACTIVATION", payload: { domain: "linkedin.com" } },
      {},
      resolve,
    );
  });
  await new Promise<void>((r: () => void): void => { setTimeout(r, 0); });

  expect((response as { ok: boolean }).ok).toBe(true);
  expect(reloads).toBe(0);
});
