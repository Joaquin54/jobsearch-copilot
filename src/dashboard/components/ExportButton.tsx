import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { exportCsv, revokePendingExports, type ExportProgress } from "../data/exportCsv.ts";
import { DownloadIcon } from "./icons.tsx";

export type ExportButtonProps = {
  /** Resolved lazily so the id list is never built until the click. */
  collectIds: () => readonly string[];
};

export const ExportButton = memo(function ExportButton({
  collectIds,
}: ExportButtonProps): ReactElement {
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const aliveRef = useRef<boolean>(true);
  const runningRef = useRef<boolean>(false);

  useEffect((): (() => void) => {
    aliveRef.current = true;
    const onHide = (): void => revokePendingExports();
    window.addEventListener("pagehide", onHide);
    return (): void => {
      // An export in flight stops at its next chunk boundary, and no object URL
      // outlives the page.
      aliveRef.current = false;
      window.removeEventListener("pagehide", onHide);
      revokePendingExports();
    };
  }, []);

  const handleClick = useCallback((): void => {
    if (runningRef.current) return;
    runningRef.current = true;
    setProgress({ done: 0, total: 0 });

    void exportCsv(
      collectIds(),
      (next: ExportProgress): void => {
        if (!aliveRef.current) return;
        setProgress(next);
      },
      (): boolean => !aliveRef.current,
    ).finally((): void => {
      runningRef.current = false;
      if (!aliveRef.current) return;
      setProgress(null);
    });
  }, [collectIds]);

  const busy = progress !== null;
  const label =
    busy && progress.total > 0 ? `Exporting ${progress.done} of ${progress.total}` : "Export CSV";

  return (
    <button type="button" className="pill-button" onClick={handleClick} disabled={busy}>
      <DownloadIcon />
      {label}
    </button>
  );
});
