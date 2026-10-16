import type { PromptRequest, UiPort } from "./port.ts";

type Resolver = (value: string) => void;

const pending = new Map<string, { request: PromptRequest; resolve: Resolver }>();

type AnswerFn = (key: string, value: string) => boolean;

declare global {
  // eslint-disable-next-line no-var
  var __jsc_answer: AnswerFn | undefined;
}

/**
 * Stand-in for the real banner until the UI run. Questions are logged and
 * answered from the page console: __jsc_answer("activation", "yes").
 */
export const consolePort: UiPort = {
  prompt(request: PromptRequest): Promise<string> {
    const open = pending.get(request.key);
    if (open) open.resolve("");
    return new Promise<string>((resolve: Resolver): void => {
      pending.set(request.key, { request, resolve });
      const options = request.actions.map((a) => `"${a.value}"`).join(" | ");
      console.log(
        `[jobsearch-copilot] ${request.text}\n  answer with: __jsc_answer("${request.key}", ${options})`,
      );
    });
  },

  toast(text: string, ms: number): void {
    console.log(`[jobsearch-copilot] ${text} (${ms}ms)`);
  },
};

globalThis.__jsc_answer = (key: string, value: string): boolean => {
  const open = pending.get(key);
  if (!open) {
    console.log(`[jobsearch-copilot] no open question "${key}"`);
    return false;
  }
  if (!open.request.actions.some((a) => a.value === value)) {
    console.log(`[jobsearch-copilot] "${value}" is not an option for "${key}"`);
    return false;
  }
  pending.delete(key);
  open.resolve(value);
  return true;
};
