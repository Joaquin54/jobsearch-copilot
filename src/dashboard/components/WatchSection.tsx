import { memo, useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";

import { BUILD_ID } from "../../lib/build.ts";
import type { SupportedDomain } from "../../lib/types.ts";
import { readWatchRows, resetWatch, WATCH_STATE_LABEL, type WatchRow } from "../lib/watch.ts";

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

  const load = useCallback((alive: () => boolean): void => {
    void readWatchRows().then((next: WatchRow[]): void => {
      if (alive()) setRows(next);
    });
  }, []);

  useEffect((): (() => void) => {
    let alive = true;
    load((): boolean => alive);
    return (): void => {
      alive = false;
    };
  }, [load]);

  const handleReset = useCallback(
    (domain: SupportedDomain): void => {
      setBusy(domain);
      void resetWatch(domain).then((): void => {
        setBusy(null);
        load((): boolean => true);
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
                disabled={row.state === "unasked" || busy === row.domain}
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
