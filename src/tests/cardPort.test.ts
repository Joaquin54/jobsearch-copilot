import { beforeEach, expect, test } from "bun:test";

import { cardPort } from "../content/ui/cardPort.ts";

const ASK = {
  key: "activation",
  text: "Watch job listings on LinkedIn?",
  actions: [
    { label: "Yes", value: "yes" },
    { label: "Not now", value: "not-now" },
    { label: "Never", value: "never" },
  ],
} as const;

const CONFIRM = {
  key: "confirm-pending",
  text: "Did you submit your application to Northwind Labs?",
  actions: [
    { label: "Yes, submitted", value: "yes" },
    { label: "No, discard it", value: "no" },
  ],
} as const;

/** The port keeps no selector for its host, so the tests find it the same way. */
function shadow(): ShadowRoot {
  const host = [...document.documentElement.children].find(
    (node: Element): boolean => node.shadowRoot !== null,
  );
  return host?.shadowRoot as ShadowRoot;
}

function cards(): Element[] {
  return [...shadow().querySelectorAll(".card")];
}

function button(label: string): HTMLElement {
  const match = [...shadow().querySelectorAll("button")].find(
    (node: Element): boolean => node.textContent === label,
  );
  return match as HTMLElement;
}

beforeEach((): void => {
  for (const node of [...document.documentElement.children]) {
    if (node.shadowRoot !== null) node.remove();
  }
  document.body.innerHTML = "";
});

test("the activation question renders one card and resolves the clicked action", async (): Promise<void> => {
  const answer = cardPort.prompt(ASK);

  expect(cards()).toHaveLength(1);
  expect(shadow().querySelector(".text")?.textContent).toBe("Watch job listings on LinkedIn?");
  expect(shadow().querySelector('[role="dialog"]')).not.toBeNull();
  // The first action leads, so "Yes" is the one that reads as the primary.
  expect(button("Yes").className).toBe("primary");

  button("Yes").click();
  expect(await answer).toBe("yes");
  expect(cards()).toHaveLength(0);
});

test("the confirm question resolves no, which is what deletes the row", async (): Promise<void> => {
  const answer = cardPort.prompt(CONFIRM);
  button("No, discard it").click();
  expect(await answer).toBe("no");
});

test("dismissing resolves empty, so the row stays pending", async (): Promise<void> => {
  const answer = cardPort.prompt(CONFIRM);
  (shadow().querySelector(".close") as HTMLElement).click();
  expect(await answer).toBe("");
  expect(cards()).toHaveLength(0);
});

test("escape dismisses the open question", async (): Promise<void> => {
  const answer = cardPort.prompt(CONFIRM);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(await answer).toBe("");
});

test("a second question replaces the first and leaves it unanswered", async (): Promise<void> => {
  const first = cardPort.prompt(CONFIRM);
  const second = cardPort.prompt(ASK);

  expect(await first).toBe("");
  expect(cards()).toHaveLength(1);

  button("Never").click();
  expect(await second).toBe("never");
});

test("a toast appears beside the question and clears itself", async (): Promise<void> => {
  const answer = cardPort.prompt(CONFIRM);
  cardPort.toast("Tracked Staff Platform Engineer at Northwind Labs", 20);
  expect(cards()).toHaveLength(2);

  await new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, 40);
  });
  expect(cards()).toHaveLength(1);

  button("No, discard it").click();
  expect(await answer).toBe("no");
});
