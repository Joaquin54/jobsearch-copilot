import { memo, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

export type RingSpec = {
  label: string;
  caption: string;
  value: number;
  /** Denominator for the arc. A zero goal draws an empty track. */
  goal: number;
  diameter: number;
  stroke: number;
  valueSize: number;
};

type RingProps = RingSpec & { animate: boolean };

function Ring({
  label,
  caption,
  value,
  goal,
  diameter,
  stroke,
  valueSize,
  animate,
}: RingProps): ReactElement {
  const radius = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = goal > 0 ? Math.min(value / goal, 1) : 0;
  // Starts fully offset and settles to the real arc, so the stroke draws in.
  const offset = animate ? circumference * (1 - ratio) : circumference;

  return (
    <div className="ring" style={{ ["--ring-size" as string]: `${diameter}px` }}>
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        role="img"
        aria-label={`${label}: ${value} of ${goal > 0 ? goal : value}. ${caption}`}
      >
        <circle
          className="ring-track"
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="ring-arc"
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${diameter / 2} ${diameter / 2})`}
        />
      </svg>
      <div className="ring-value" style={{ fontSize: `${valueSize}px` }}>
        {value}
      </div>
      <div className="ring-label">{label}</div>
      <div className="ring-caption">{caption}</div>
    </div>
  );
}

const MemoRing = memo(Ring);

export type RingsProps = { rings: readonly RingSpec[] };

/**
 * The arcs animate once on mount. Under prefers-reduced-motion the CSS
 * transition is removed, so the first paint is already the final arc.
 */
export const Rings = memo(function Rings({ rings }: RingsProps): ReactElement {
  const [animate, setAnimate] = useState<boolean>(false);
  const frameRef = useRef<number>(0);

  useEffect((): (() => void) => {
    // One frame of the empty state has to commit before the offset changes,
    // otherwise there is nothing to transition from.
    frameRef.current = window.requestAnimationFrame((): void => setAnimate(true));
    return (): void => {
      window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div className="rings">
      {rings.map((ring: RingSpec): ReactElement => (
        <MemoRing key={ring.label} {...ring} animate={animate} />
      ))}
    </div>
  );
});
