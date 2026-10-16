export type PromptAction = { label: string; value: string };

export type PromptRequest = {
  /** Stable id so a console-driven answer can target one open question. */
  key: string;
  text: string;
  actions: readonly PromptAction[];
};

/**
 * Every user-facing surface in the content script goes through this port. The
 * React + Tailwind banner implements it later; nothing in the logic layer
 * touches the DOM.
 */
export type UiPort = {
  prompt(request: PromptRequest): Promise<string>;
  toast(text: string, ms: number): void;
};
