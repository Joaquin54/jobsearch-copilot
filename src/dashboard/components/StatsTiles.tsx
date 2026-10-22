import { memo } from "react";
import type { ReactElement } from "react";

export type Tile = { label: string; value: string };

export const StatsTiles = memo(function StatsTiles({
  tiles,
}: {
  tiles: readonly Tile[];
}): ReactElement {
  return (
    <div className="tiles">
      {tiles.map((tile: Tile): ReactElement => (
        <div className="tile" key={tile.label}>
          <div className="tile-label">{tile.label}</div>
          <div className="tile-value">{tile.value}</div>
        </div>
      ))}
    </div>
  );
});
