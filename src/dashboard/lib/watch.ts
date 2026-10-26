import { send } from "../../lib/messages.ts";
import type { ActivationChoice } from "../../lib/settings.ts";
import type { SupportedDomain } from "../../lib/types.ts";

/**
 * "unavailable" is a failed read, never a user decision: the service worker
 * restarting. It is reported as itself because rendering it as "unasked" would
 * show a board the user set to Never as never asked.
 */
export type WatchState = "watching" | "off" | "unasked" | "not-now" | "unavailable";

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
  "not-now": "Not now (this session)",
  unavailable: "Unavailable",
};

/**
 * Whether Reset has anything to clear. "unavailable" is false on purpose: a
 * button offered on a state we admit we could not read misrepresents what it does.
 */
export const WATCH_STATE_RESETTABLE: Record<WatchState, boolean> = {
  watching: true,
  off: true,
  unasked: false,
  "not-now": true,
  unavailable: false,
};

/**
 * Stored answers are checked first, matching resolveActivation: a "Never" must
 * not be downgraded to a soft pause because the same board was also dismissed
 * earlier this session.
 */
function stateOf(choice: ActivationChoice | undefined, suppressed: boolean): WatchState {
  if (choice === "yes") return "watching";
  if (choice === "never") return "off";
  return suppressed ? "not-now" : "unasked";
}

export async function readWatchRows(): Promise<WatchRow[]> {
  const response = await send({ type: "GET_SETTINGS" });
  if (!response.ok) {
    console.log(`[jobsearch-copilot] watch state unavailable (${response.reason})`);
    return BOARDS.map(
      (board): WatchRow => ({ domain: board.domain, label: board.label, state: "unavailable" }),
    );
  }
  return BOARDS.map(
    (board): WatchRow => ({
      domain: board.domain,
      label: board.label,
      state: stateOf(
        response.settings.activation[board.domain],
        response.suppressed.includes(board.domain),
      ),
    }),
  );
}

/** Resolves true when the choice was cleared, so the caller can re-read. */
export async function resetWatch(domain: SupportedDomain): Promise<boolean> {
  const response = await send({ type: "RESET_ACTIVATION", payload: { domain } });
  return response.ok;
}
