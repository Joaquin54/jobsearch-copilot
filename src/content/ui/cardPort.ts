import type { PromptRequest, UiPort } from "./port.ts";

type Resolver = (value: string) => void;

/**
 * A card drawn on the page itself. A browser-action popup cannot be opened
 * programmatically, so the question has to live in the tab. Everything renders
 * inside a shadow root, which keeps the host page's CSS out and needs no
 * web_accessible_resources.
 */
const STYLE = `
:host { all: initial; }
.layer {
  position: fixed;
  inset-block-end: 16px;
  inset-inline-start: 16px;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: "Google Sans", Roboto, -apple-system, system-ui, sans-serif;
}
.card {
  --bg: #ffffff;
  --text: #1f1f1f;
  --muted: #474747;
  --border: #dde3ea;
  --primary: #0b57d0;
  --on-primary: #ffffff;
  --hover: rgba(31, 31, 31, 0.08);

  box-sizing: border-box;
  max-width: 320px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  color: var(--text);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  font-size: 14px;
  line-height: 20px;
}
.text { margin: 0 24px 12px 0; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
button {
  font: inherit;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
button:hover { background: var(--hover); }
button.primary {
  border-color: transparent;
  background: var(--primary);
  color: var(--on-primary);
}
button.primary:hover { filter: brightness(1.08); }
.close {
  position: absolute;
  inset-block-start: 8px;
  inset-inline-end: 8px;
  padding: 2px 8px;
  border: 0;
  border-radius: 999px;
  color: var(--muted);
  font-size: 16px;
  line-height: 20px;
}
.prompt { position: relative; }
.toast { color: var(--muted); }

@media (prefers-color-scheme: dark) {
  .card {
    --bg: #282a2c;
    --text: #e3e3e3;
    --muted: #c4c7c5;
    --border: #3c4043;
    --primary: #a8c7fa;
    --on-primary: #062e6f;
    --hover: rgba(227, 227, 227, 0.12);
  }
}
`;

type Open = { request: PromptRequest; resolve: Resolver; card: HTMLElement };

let layer: HTMLElement | null = null;
let open: Open | null = null;

function mount(): HTMLElement {
  if (layer !== null && layer.isConnected) return layer;

  // A plain unmarked div: no id, class or custom tag to recognise us by.
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });

  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLE);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    // Older engines, and happy-dom under test: a <style> node does the same job.
    const style = document.createElement("style");
    style.textContent = STYLE;
    shadow.append(style);
  }

  const element = document.createElement("div");
  element.className = "layer";
  shadow.append(element);
  document.documentElement.append(host);

  window.addEventListener(
    "pagehide",
    (): void => {
      host.remove();
      layer = null;
    },
    { once: true },
  );

  layer = element;
  return element;
}

function close(answer: string): void {
  const current = open;
  if (current === null) return;
  open = null;
  document.removeEventListener("keydown", onKeyDown, { capture: true });
  current.card.remove();
  current.resolve(answer);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") close("");
}

export const cardPort: UiPort = {
  prompt(request: PromptRequest): Promise<string> {
    // One question at a time: a superseded card resolves empty, which is what
    // leaves a pending row unanswered so it can be asked about again later.
    close("");

    return new Promise<string>((resolve: Resolver): void => {
      const card = document.createElement("div");
      card.className = "card prompt";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-live", "polite");

      const text = document.createElement("p");
      text.className = "text";
      text.textContent = request.text;

      const dismiss = document.createElement("button");
      dismiss.className = "close";
      dismiss.textContent = "×";
      dismiss.setAttribute("aria-label", "Dismiss");
      dismiss.addEventListener("click", (): void => close(""));

      const actions = document.createElement("div");
      actions.className = "actions";
      request.actions.forEach((action, index: number): void => {
        const button = document.createElement("button");
        if (index === 0) button.className = "primary";
        button.textContent = action.label;
        button.addEventListener("click", (): void => close(action.value));
        actions.append(button);
      });

      card.append(dismiss, text, actions);
      mount().append(card);
      document.addEventListener("keydown", onKeyDown, { capture: true });

      open = { request, resolve, card };
      console.log(`[jobsearch-copilot] ${request.text}`);
    });
  },

  toast(text: string, ms: number): void {
    const card = document.createElement("div");
    card.className = "card toast";
    card.textContent = text;
    mount().append(card);
    setTimeout((): void => card.remove(), ms);
    console.log(`[jobsearch-copilot] ${text}`);
  },
};
