import { memo } from "react";
import type { ReactElement } from "react";

type RingProps = {
  size: number;
  stroke: number;
  progress: number;
  value: number;
  valueSize: number;
  sub?: string;
};

/**
 * Hand-written SVG arc. The arc starts at 12 o'clock and draws in via a CSS
 * transition on stroke-dashoffset: the first paint renders an empty arc, and the
 * commit that carries real data animates it. No JS animation loop.
 */
function RingImpl({ size, stroke, progress, value, valueSize, sub }: RingProps): ReactElement {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg className="ring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="ring-track"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="ring-arc"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-value" style={{ fontSize: valueSize }}>
          {value}
        </span>
        {sub === undefined ? null : <span className="ring-sub">{sub}</span>}
      </div>
    </div>
  );
}

export const Ring = memo(RingImpl);
