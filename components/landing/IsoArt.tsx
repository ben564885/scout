// Isometric-style line-art primitives shared across the landing page hero
// and problem cards, so every illustration reads as one consistent system
// (thin strokes, flag poles, stacked boxes, particle dust) instead of one-off
// icons per section. Motion is themed around the product's own premise —
// signals streaming in, getting filtered, and landing on the workforce —
// rather than generic decorative easing.

import type { ReactNode } from "react";

const DUST_OFFSETS: [number, number, number][] = [
  [0, 0, 1.6],
  [7, -5, 1],
  [-6, 4, 1.2],
  [11, 6, 0.8],
  [-9, -7, 1],
  [4, 10, 0.9],
  [-4, -10, 1.1],
  [10, -3, 0.7],
  [-10, 2, 1],
  [2, -8, 0.8],
  [-3, 8, 0.9],
  [6, 2, 0.7],
];

function Dust({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g className="iso-dust" fill="currentColor">
      {DUST_OFFSETS.map(([dx, dy, r], i) => (
        <circle
          key={i}
          cx={x + dx * scale}
          cy={y + dy * scale}
          r={r}
          style={{ animationDelay: `${i * 0.15}s` }}
          opacity={0.35 + (i % 3) * 0.15}
        />
      ))}
    </g>
  );
}

function Pole({ x, y, h }: { x: number; y: number; h: number }) {
  const flag = 12;
  const topY = y - h;
  return (
    <g stroke="currentColor" strokeWidth="1" fill="none">
      <line x1={x - 16} y1={y} x2={x + 16} y2={y} />
      <line x1={x} y1={y} x2={x} y2={topY} />
      <rect
        x={x - flag / 2}
        y={topY - flag}
        width={flag}
        height={flag}
        transform={`rotate(45 ${x} ${topY - flag / 2})`}
      />
    </g>
  );
}

function IsoBox({
  x,
  y,
  s = 34,
  rows = 3,
  dashed = false,
}: {
  x: number;
  y: number;
  s?: number;
  rows?: number;
  dashed?: boolean;
}) {
  const dx = s * 0.87;
  const dy = s * 0.5;
  const topY = y - rows * s;
  const strokeDasharray = dashed ? "3 3" : undefined;
  return (
    <g stroke="currentColor" strokeWidth="1" fill="none" strokeDasharray={strokeDasharray}>
      <polygon points={`${x},${topY - 2 * dy} ${x + dx},${topY - dy} ${x},${topY} ${x - dx},${topY - dy}`} />
      <polygon points={`${x - dx},${topY - dy} ${x},${topY} ${x},${y} ${x - dx},${y - dy}`} />
      <polygon points={`${x + dx},${topY - dy} ${x},${topY} ${x},${y} ${x + dx},${y - dy}`} />
      {Array.from({ length: rows - 1 }).map((_, i) => {
        const yy = y - (i + 1) * s;
        return (
          <g key={i}>
            <line x1={x - dx} y1={yy - dy} x2={x} y2={yy} />
            <line x1={x} y1={yy} x2={x + dx} y2={yy - dy} />
          </g>
        );
      })}
    </g>
  );
}

function ConvergeLines({
  points,
  target,
}: {
  points: { x: number; y: number }[];
  target: { x: number; y: number };
}) {
  return (
    <g stroke="currentColor" strokeWidth="1" fill="none">
      {points.map((p, i) => (
        <path
          key={i}
          className="iso-flow"
          style={{ animationDelay: `${i * 0.2}s` }}
          d={`M ${p.x} ${p.y} Q ${(p.x + target.x) / 2} ${p.y} ${target.x} ${target.y}`}
        />
      ))}
    </g>
  );
}

function Frame({ children, revealed = false }: { children: ReactNode; revealed?: boolean }) {
  const id = "iso-grid";
  return (
    <svg
      viewBox="0 0 400 300"
      className={`iso-scene h-full w-full text-black/70 ${revealed ? "in-view" : ""}`}
    >
      <defs>
        <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="currentColor" opacity="0.12" />
        </pattern>
      </defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
      {children}
    </svg>
  );
}

export function ProblemIllustration({
  variant,
  revealed = true,
}: {
  variant: "converge" | "stack" | "bounce" | "gate";
  revealed?: boolean;
}) {
  if (variant === "converge") {
    const poles = [
      { x: 60, y: 110 },
      { x: 40, y: 170 },
      { x: 65, y: 220 },
    ];
    const gate = { x: 190, y: 170 };
    return (
      <Frame revealed={revealed}>
        <g className="iso-beat">
          {poles.map((p, i) => (
            <Pole key={i} x={p.x} y={p.y} h={40 + i * 6} />
          ))}
        </g>
        <g className="iso-beat">
          <ConvergeLines points={poles} target={gate} />
        </g>
        <g className="iso-beat" stroke="currentColor">
          <line x1={gate.x - 6} y1={gate.y - 40} x2={gate.x - 6} y2={gate.y + 40} />
          <line x1={gate.x + 6} y1={gate.y - 40} x2={gate.x + 6} y2={gate.y + 40} />
        </g>
        <g className="iso-beat">
          <Dust x={gate.x + 30} y={gate.y - 10} scale={1.1} />
        </g>
        <g className="iso-beat">
          <IsoBox x={310} y={230} s={30} rows={2} dashed />
        </g>
      </Frame>
    );
  }

  if (variant === "stack") {
    const poles = [
      { x: 55, y: 150 },
      { x: 55, y: 210 },
    ];
    return (
      <Frame revealed={revealed}>
        <g className="iso-beat">
          {poles.map((p, i) => (
            <Pole key={i} x={p.x} y={p.y} h={36} />
          ))}
        </g>
        <g className="iso-beat" stroke="currentColor" strokeWidth="1" fill="none">
          <path className="iso-flow" d="M 110 130 C 150 110, 150 160, 190 140 S 230 190, 270 170" />
          <path
            className="iso-flow"
            style={{ animationDelay: "0.3s" }}
            d="M 110 190 C 150 170, 150 220, 190 200 S 230 250, 270 230"
          />
        </g>
        <g className="iso-beat" stroke="currentColor" strokeWidth="1" fill="none">
          <circle cx="330" cy="90" r="16" />
          <line x1="330" y1="90" x2="330" y2="78" />
          <line x1="330" y1="90" x2="339" y2="90" />
        </g>
        <g className="iso-beat">
          <IsoBox x={320} y={240} s={26} rows={5} />
        </g>
      </Frame>
    );
  }

  if (variant === "bounce") {
    const poles = [
      { x: 50, y: 130 },
      { x: 50, y: 190 },
      { x: 50, y: 240 },
    ];
    const wall = { x: 190, y: 190 };
    return (
      <Frame revealed={revealed}>
        <g className="iso-beat">
          {poles.map((p, i) => (
            <Pole key={i} x={p.x} y={p.y} h={34 + i * 4} />
          ))}
        </g>
        <g className="iso-beat">
          <ConvergeLines points={poles} target={wall} />
        </g>
        <g className="iso-beat" stroke="currentColor" strokeWidth="1" fill="none">
          <line x1={wall.x} y1={wall.y - 55} x2={wall.x} y2={wall.y + 55} />
          <path d={`M ${wall.x - 4} ${wall.y - 20} l 8 10 l -8 10 l 8 10`} />
        </g>
        <g className="iso-beat">
          <Dust x={wall.x - 40} y={wall.y - 30} scale={0.9} />
        </g>
        <g className="iso-beat">
          <IsoBox x={320} y={230} s={28} rows={3} dashed />
        </g>
      </Frame>
    );
  }

  const poles = [
    { x: 55, y: 140 },
    { x: 55, y: 210 },
  ];
  const boxX = 300;
  const boxY = 230;
  return (
    <Frame revealed={revealed}>
      <g className="iso-beat">
        {poles.map((p, i) => (
          <Pole key={i} x={p.x} y={p.y} h={36 + i * 8} />
        ))}
      </g>
      <g className="iso-beat" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" fill="none">
        <line x1="90" y1="140" x2="270" y2="185" />
        <line x1="90" y1="210" x2="270" y2="195" />
      </g>
      <g className="iso-beat">
        <IsoBox x={boxX} y={boxY} s={30} rows={3} />
      </g>
      <g className="iso-beat" stroke="currentColor" strokeWidth="1" fill="none">
        <path d={`M ${boxX - 8} ${boxY - 70} l 6 14 l -8 4 l 6 14`} />
      </g>
    </Frame>
  );
}

export function HeroArt() {
  const poles = [
    { x: 90, y: 380 },
    { x: 150, y: 410 },
    { x: 60, y: 340 },
  ];
  const target = { x: 300, y: 250 };
  return (
    <svg viewBox="0 0 520 460" className="h-full w-full">
      <defs>
        <radialGradient id="ping" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="white" stopOpacity="0.35" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="text-white/50">
        {poles.map((p, i) => (
          <Pole key={i} x={p.x} y={p.y} h={50 + i * 10} />
        ))}
        <ConvergeLines points={poles} target={target} />
      </g>
      <circle cx={target.x} cy={target.y - 40} r="120" fill="url(#ping)" />
      <g className="text-white/70">
        <circle
          className="pulse-ring"
          cx={target.x}
          cy={target.y - 40}
          r="50"
          stroke="currentColor"
          strokeWidth="1"
          fill="none"
        />
        <circle
          className="pulse-ring"
          style={{ animationDelay: "1.5s" }}
          cx={target.x}
          cy={target.y - 40}
          r="50"
          stroke="currentColor"
          strokeWidth="1"
          fill="none"
        />
      </g>
      <g className="text-white/80">
        <g className="iso-float">
          <IsoBox x={target.x} y={target.y + 60} s={36} rows={3} />
        </g>
        <Dust x={target.x + 60} y={target.y - 90} scale={1.4} />
        <Dust x={target.x - 90} y={target.y - 60} scale={1} />
      </g>
    </svg>
  );
}
