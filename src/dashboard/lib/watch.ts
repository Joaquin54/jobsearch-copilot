import { send } from "../../lib/messages.ts";
import type { ActivationChoice } from "../../lib/settings.ts";
import type { SupportedDomain } from "../../lib/types.ts";

export type WatchState = "watching" | "off" | "unasked";

export type WatchRow = {
  domain: SupportedDomain;
  label: string;
  state: WatchState;
};

/** Board order and wording follow the activation card in src/content/activation.ts. */
const BOARDS: readonly { domain: SupportedDomain; label: string }[] = [
  { domain: "linkedin.com", label: "LinkedIn" },
  { domain: "indeed.com", label: "Indeed" },
  { domain: "joinhandshake.com", label: "Handshake" },
];

export const WATCH_STATE_LABEL: Record<WatchState, string> = {
  watching: "Watching",
  off: "Never ask",
  unasked: "Not asked yet",
};

/**
 * "not-now" is deliberately absent: it lives in chrome.storage.session under
 * TRUSTED_CONTEXTS and resolves back to "ask" on its own, so a row reading
 * "Not asked yet" is the truth for the next browsing session either way.
 */
function stateOf(choice: ActivationChoice | undefined): WatchState {
  if (choice === "yes") return "watching";
  if (choice === "never") return "off";
  return "unasked";
}

export async function readWatchRows(): Promise<WatchRow[]> {
  const response = await send({ type: "GET_SETTINGS" });
  const activation = response.ok ? response.settings.activation : {};
  return BOARDS.map(
    (board): WatchRow => ({
      domain: board.domain,
      label: board.label,
      state: stateOf(activation[board.domain]),
    }),
  );
}

/** Resolves true when the choice was cleared, so the caller can re-read. */
export async function resetWatch(domain: SupportedDomain): Promise<boolean> {
  const response = await send({ type: "RESET_ACTIVATION", payload: { domain } });
  return response.ok;
}
