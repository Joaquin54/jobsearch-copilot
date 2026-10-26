import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { BUILD_ID } from "../../lib/build.ts";
import type { SupportedDomain } from "../../lib/types.ts";
import {
  readWatchRows,
  resetWatch,
  WATCH_STATE_LABEL,
  WATCH_STATE_RESETTABLE,
  type WatchRow,
} from "../lib/watch.ts";

/**
 * The activation card is asked once per board and the answer is permanent, so
 * without a reset here a "Never" — or a "Yes" given by a build that has since
 * been replaced — can never be revisited. The build stamp sits in the same
 * section because both answer the same question: is the extension on this page
 * the one I just built?
 */
export const WatchSection = memo(function WatchSection(): ReactElement {
  const [rows, setRows] = useState<readonly WatchRow[]>([]);
  const [busy, setBusy] = useState<SupportedDomain | null>(null);

  const mounted = useRef<boolean>(true);

  const load = useCallback((alive: () => boolean): void => {
    void readWatchRows().then((next: WatchRow[]): void => {
      if (alive()) setRows(next);
    });
  }, []);

  useEffect((): (() => void) => {
    mounted.current = true;
    load((): boolean => mounted.current);
    return (): void => {
      mounted.current = false;
    };
  }, [load]);

  const markUnavailable = (current: readonly WatchRow[]): readonly WatchRow[] =>
    current.map((row: WatchRow): WatchRow => ({ ...row, state: "unavailable" }));

  const handleReset = useCallback(
    (domain: SupportedDomain): void => {
      setBusy(domain);
      const alive = (): boolean => mounted.current;
      void resetWatch(domain)
        .then((cleared: boolean): void => {
          if (!alive()) return;
          setBusy(null);
          // A reset that did not land (worker mid-restart) must not re-render
          // the stale row as if nothing happened: show it as unread instead.
          if (cleared) load(alive);
          else setRows(markUnavailable);
        })
        .catch((): void => {
          if (!alive()) return;
          setBusy(null);
          setRows(markUnavailable);
        });
    },
    [load],
  );

  return (
    <section className="watch-section">
      <div className="section-head">
        <h2>Watched boards</h2>
        <span className="count-pill">build {BUILD_ID}</span>
      </div>

      <div className="card watch-card">
        {rows.map(
          (row: WatchRow): ReactElement => (
            <div className="watch-row" key={row.domain}>
              <span className="watch-name">{row.label}</span>
              <span className="watch-state muted">{WATCH_STATE_LABEL[row.state]}</span>
              <button
                type="button"
                className="pill-button"
                disabled={!WATCH_STATE_RESETTABLE[row.state] || busy === row.domain}
                onClick={(): void => handleReset(row.domain)}
              >
                Reset
              </button>
            </div>
          ),
        )}
        <p className="watch-note muted">
          A reset takes effect on the next page load: reload the board&apos;s tab and the card asks
          again.
        </p>
      </div>
    </section>
  );
});
