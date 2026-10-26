import { afterEach, beforeEach, expect, test } from "bun:test";

import { watchApplyClicks, type RejectReason } from "../content/applyEvents.ts";
import { waitForSettle } from "../content/navigation.ts";
import { handshakeAdapter } from "../content/sites/handshake.ts";
import { indeedAdapter } from "../content/sites/indeed.ts";
import { linkedinAdapter } from "../content/sites/linkedin.ts";

const original = console.log;
let lines: string[] = [];
let answers: ("yes" | "no")[] = [];

async function render(name: string): Promise<void> {
  document.body.innerHTML = await Bun.file(`${import.meta.dir}/fixtures/${name}.html`).text();
}

function click(element: Element): void {
  element.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
}

beforeEach((): void => {
  document.body.innerHTML = "";
  lines = [];
  answers = [];
  console.log = (...args: unknown[]): void => {
    lines.push(args.map(String).join(" "));
  };
});

afterEach((): void => {
  console.log = original;
});

test("a click on Easy Apply is recorded once, a result card is not", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  let applies = 0;
  const told: RejectReason[] = [];
  const stop = watchApplyClicks(linkedinAdapter, (): string | null => "4012345678", {
    onApply: (): void => {
      applies += 1;
    },
    onAnswer: (answer: "yes" | "no"): void => {
      answers.push(answer);
    },
    onIgnored: (reason: RejectReason): void => {
      told.push(reason);
    },
  });

  click(document.querySelector('[aria-label="Easy Apply to this job"] span') as Element);
  expect(applies).toBe(1);

  click(document.querySelector('[componentkey="job-card-component-ref-1101"]') as Element);
  click(document.querySelector('[role="toolbar"] button') as Element);
  expect(applies).toBe(1);

  // Both sit outside the detail pane, so one line covers them.
  const ignored = lines.filter((line: string): boolean => line.includes("apply click ignored"));
  expect(ignored).toHaveLength(1);
  expect(ignored[0]).toContain("outside-detail-root");
  // Every card on a results list reads "Easy Apply", so clicking through the
  // list must never put a "Not tracked" card on the page.
  expect(told).toEqual([]);

  // Save is inside the pane but is not an apply control, and it is not
  // apply-looking either, so it stays silent.
  click(document.querySelector('[aria-label="Save the job"]') as Element);
  expect(applies).toBe(1);
  stop();
});

test("no detail pane is logged per job but told on the page once", (): void => {
  document.body.innerHTML = '<button aria-label="Easy Apply to this job">Easy Apply</button>';
  let applies = 0;
  let jobId: string | null = null;
  const told: RejectReason[] = [];
  const stop = watchApplyClicks(linkedinAdapter, (): string | null => jobId, {
    onApply: (): void => {
      applies += 1;
    },
    onAnswer: (answer: "yes" | "no"): void => {
      answers.push(answer);
    },
    onIgnored: (reason: RejectReason): void => {
      told.push(reason);
    },
  });

  const button = document.querySelector("button") as Element;
  click(button);
  click(button);
  jobId = "4012345678";
  click(button);

  expect(applies).toBe(0);
  // The console trail is per job, so a second job is still visible in DevTools.
  const ignored = lines.filter((line: string): boolean => line.includes("apply click ignored"));
  expect(ignored).toHaveLength(2);
  expect(ignored[0]).toContain("no-detail-root");
  expect(ignored[1]).toContain("no-detail-root");
  // A dead detailRoot selector is the same fault on every job, so the page is
  // told once rather than once per card clicked.
  expect(told).toEqual(["no-detail-root"]);
  stop();
});

test("a recorded apply is never reported as ignored", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  let applies = 0;
  const reasons: string[] = [];
  const stop = watchApplyClicks(linkedinAdapter, (): string | null => "4012345678", {
    onApply: (): void => {
      applies += 1;
    },
    onIgnored: (reason: string): void => {
      reasons.push(reason);
    },
  });

  click(document.querySelector('[aria-label="Easy Apply to this job"] span') as Element);

  expect(applies).toBe(1);
  expect(reasons).toEqual([]);
  stop();
});

test("the external apply control is recorded on layout B", async (): Promise<void> => {
  await render("linkedin-sdui-view");
  let applies = 0;
  const told: RejectReason[] = [];
  const stop = watchApplyClicks(linkedinAdapter, (): string | null => "4098765432", {
    onApply: (): void => {
      applies += 1;
    },
    onAnswer: (answer: "yes" | "no"): void => {
      answers.push(answer);
    },
    onIgnored: (reason: RejectReason): void => {
      told.push(reason);
    },
  });

  click(document.querySelector('[aria-label="Apply on company website"] span') as Element);
  expect(applies).toBe(1);

  // The toolbar pill is inside this layout's screen root, so only the top-card
  // scoping rejects it.
  click(document.querySelector('[role="toolbar"] button') as Element);
  expect(applies).toBe(1);
  expect(lines.filter((line: string): boolean => line.includes("adapter-rejected"))).toHaveLength(1);
  // A control inside the pane that the adapter refused is a real miss, so it
  // still reaches the page.
  expect(told).toEqual(["adapter-rejected"]);
  stop();
});

const FINISH_PROMPT = `
  <div class="kxhlhs">
    <a aria-label="Did you finish applying? Yes" href="#">Yes</a>
    <a aria-label="Did you finish applying? No" href="#">No</a>
  </div>
`;

test("answering LinkedIn's own question promotes instead of reading as an apply", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  let applies = 0;
  const stop = watchApplyClicks(linkedinAdapter, (): string | null => "4012345678", {
    onApply: (): void => {
      applies += 1;
    },
    onAnswer: (answer: "yes" | "no"): void => {
      answers.push(answer);
    },
  });

  const card = document.querySelector('[aria-label="Easy Apply to this job"]')
    ?.parentElement as Element;
  card.insertAdjacentHTML("afterend", FINISH_PROMPT);

  click(document.querySelector('[aria-label="Did you finish applying? Yes"]') as Element);
  click(document.querySelector('[aria-label="Did you finish applying? No"]') as Element);

  expect(answers).toEqual(["yes", "no"]);
  expect(applies).toBe(0);
  // It is apply-looking text, so it would otherwise be logged as a rejection.
  expect(lines.filter((line: string): boolean => line.includes("apply click ignored"))).toEqual(
    [],
  );
  stop();
});

test("the same question outside the detail pane answers nothing", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  let applies = 0;
  const stop = watchApplyClicks(linkedinAdapter, (): string | null => "4012345678", {
    onApply: (): void => {
      applies += 1;
    },
    onAnswer: (answer: "yes" | "no"): void => {
      answers.push(answer);
    },
  });

  document.body.insertAdjacentHTML("beforeend", FINISH_PROMPT);
  click(document.querySelector('[aria-label="Did you finish applying? Yes"]') as Element);

  expect(answers).toEqual([]);
  expect(applies).toBe(0);
  stop();
});

test("waitForSettle follows the About marker when there is one", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  expect(await waitForSettle(linkedinAdapter, "4012345678", 50)).toBe(true);
  expect(await waitForSettle(linkedinAdapter, "4099999999", 50)).toBe(false);

  // The pane catches up mid-wait.
  const marker = document.querySelector('[componentkey^="JobDetails_AboutTheJob_"]') as Element;
  setTimeout((): void => {
    marker.setAttribute("componentkey", "JobDetails_AboutTheJob_4099999999");
  }, 20);
  expect(await waitForSettle(linkedinAdapter, "4099999999", 400)).toBe(true);
});

test("indeed keeps the mutation-quiet path when the page has no result cards", async (): Promise<void> => {
  document.body.innerHTML = '<div class="jobsearch-ViewJobLayout-jobDisplay"><h1>Role</h1></div>';
  expect(indeedAdapter.jobSettled?.(document, "abc")).toBeNull();
  expect(await waitForSettle(indeedAdapter, "abc", 400)).toBe(true);

  document.body.innerHTML = "<main>no pane</main>";
  expect(await waitForSettle(indeedAdapter, "abc", 400)).toBe(false);
});

test("a click on Handshake's Quick apply is recorded once, a result card is not", async (): Promise<void> => {
  await render("handshake-search");
  let applies = 0;
  const told: RejectReason[] = [];
  const stop = watchApplyClicks(handshakeAdapter, (): string | null => "11730261", {
    onApply: (): void => {
      applies += 1;
    },
    onAnswer: (answer: "yes" | "no"): void => {
      answers.push(answer);
    },
    onIgnored: (reason: RejectReason): void => {
      told.push(reason);
    },
  });

  click(document.querySelector('[aria-label="Quick apply"] span') as Element);
  expect(applies).toBe(1);

  // The result list sits outside the pane, which is why it must never be the root.
  click(document.querySelector('[data-hook^="favorite-action"]') as Element);
  click(document.querySelector('[data-hook^="job-result-card"] a') as Element);
  expect(applies).toBe(1);

  // Save and the More-actions menu are inside the pane and still not applies.
  click(document.querySelector('[aria-label="More actions for this job"]') as Element);
  expect(applies).toBe(1);
  expect(told).toEqual([]);
  stop();
});

test("the banner's Yes answers before it is judged as an apply click", async (): Promise<void> => {
  await render("handshake-banner");
  let applies = 0;
  const stop = watchApplyClicks(handshakeAdapter, (): string | null => "11730263", {
    onApply: (): void => {
      applies += 1;
    },
    onAnswer: (answer: "yes" | "no"): void => {
      answers.push(answer);
    },
  });

  click(document.querySelector('[aria-label="Confirm external apply (yes)"] span') as Element);
  click(document.querySelector('[aria-label="Withdraw external apply (no)"] span') as Element);

  expect(answers).toEqual(["yes", "no"]);
  expect(applies).toBe(0);
  // "Apply"-adjacent labels, so without the answer-first ordering these would
  // be logged as rejected apply clicks.
  expect(lines.filter((line: string): boolean => line.includes("apply click ignored"))).toEqual([]);
  stop();
});

test("handshake follows the h1 anchor when it switches mid-wait", async (): Promise<void> => {
  await render("handshake-search");
  expect(await waitForSettle(handshakeAdapter, "11730261", 50)).toBe(true);
  expect(await waitForSettle(handshakeAdapter, "11739999", 50)).toBe(false);

  const anchor = document.querySelector('a[href="/jobs/11730261"]') as Element;
  setTimeout((): void => anchor.setAttribute("href", "/jobs/11739999"), 20);
  expect(await waitForSettle(handshakeAdapter, "11739999", 400)).toBe(true);
});
