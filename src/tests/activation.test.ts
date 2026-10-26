import { afterEach, expect, test } from "bun:test";

import { getActivationState } from "../content/activation.ts";

type Runtime = { sendMessage: (message: unknown) => Promise<unknown> };

function installRuntime(sendMessage: Runtime["sendMessage"]): void {
  const target = (globalThis as { chrome?: { runtime?: Runtime } }).chrome ?? {};
  target.runtime = { sendMessage };
  (globalThis as { chrome?: unknown }).chrome = target;
}

afterEach((): void => {
  installRuntime(async (): Promise<unknown> => ({ ok: true, state: "ask" }));
});

test("the background's answer is passed through", async (): Promise<void> => {
  installRuntime(async (): Promise<unknown> => ({ ok: true, state: "suppressed" }));
  expect(await getActivationState("joinhandshake.com")).toBe("suppressed");
});

/* A failed read used to come back as "suppressed", which reads in the console
   exactly like a user who answered Never — and like a content script that was
   never injected. It is now reported as itself. */

test("a dropped port reports unavailable, not suppressed", async (): Promise<void> => {
  installRuntime((): Promise<unknown> => Promise.reject(new Error("port closed")));
  expect(await getActivationState("joinhandshake.com")).toBe("unavailable");
});

test("a missing response reports unavailable too", async (): Promise<void> => {
  installRuntime(async (): Promise<unknown> => undefined);
  expect(await getActivationState("joinhandshake.com")).toBe("unavailable");
});
