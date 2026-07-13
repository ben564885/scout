import { SponsorLogo } from "./SponsorLogo";

// Flowchart of the floor's actual backend pipeline (PRD §8.1): the goal
// enters through Kylon, Band delegates and governs the whole run, Nimble +
// You.com do the research, InsForge persists it, Hydra remembers it run to
// run. Each arrow is an animated dashed line — fast while the floor is
// actually running, a slow ambient crawl otherwise — so the diagram reads as
// "live," not a static logo strip. Nodes dim to grayscale when that
// integration isn't actually configured, matching the honesty rule the dot
// row already followed (real status, not vaporware).
//
// Laid out as a two-row "snake": row one runs left-to-right, a vertical
// arrow drops from its last node, and row two continues right-to-left from
// directly below — so the last node of row one and the first node of row
// two share the same column and the down-arrow reads as a clean continuation.

type IntegrationKey = "kylon" | "band" | "nimble" | "youdotcom" | "insforge" | "hydra";

type FlowNode = {
  key: IntegrationKey | "rocketride";
  src: string;
  alt: string;
  label: string;
  // Kylon/Hydra/InsForge/You.com ship as square icon marks — crop-to-fill
  // reads fine. Band/Nimble/RocketRide ship as wide wordmark logotypes —
  // cropping those to a square shows an illegible sliver of text, so they
  // get "contain" (whole mark, padded) instead.
  fit?: "cover" | "contain";
};

const FLOW: FlowNode[] = [
  { key: "kylon", src: "/kylon.svg", alt: "Kylon", label: "Goal in" },
  { key: "rocketride", src: "/rocketride.svg", alt: "RocketRide", label: "Pipeline wiring", fit: "contain" },
  { key: "band", src: "/band.svg", alt: "Band", label: "Delegate & govern", fit: "contain" },
  { key: "nimble", src: "/nimble.svg", alt: "Nimble", label: "Prospect + signals", fit: "contain" },
  { key: "youdotcom", src: "/you.jpg", alt: "You.com", label: "Cited research" },
  { key: "insforge", src: "/insforge.png", alt: "InsForge", label: "Data + drafts" },
  { key: "hydra", src: "/hydra.png", alt: "Hydra", label: "Memory" },
];

const ROW_SIZE = 4;

function FlowArrow({ active, flip }: { active: boolean; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      className={`h-6 w-full min-w-[28px] flex-1 ${flip ? "-scale-x-100" : ""}`}
      aria-hidden
    >
      <line
        x1="2"
        y1="10"
        x2="90"
        y2="10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="6 6"
        className="text-black/25"
        style={{ animation: `dashFlow ${active ? "0.5s" : "2.2s"} linear infinite` }}
      />
      <path d="M90 5 L98 10 L90 15 Z" fill="currentColor" className="text-black/35" />
    </svg>
  );
}

function DownArrow({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 72" className="h-20 w-7 shrink-0" aria-hidden>
      <line
        x1="10"
        y1="2"
        x2="10"
        y2="60"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="6 6"
        className="text-black/25"
        style={{ animation: `dashFlow ${active ? "0.5s" : "2.2s"} linear infinite` }}
      />
      <path d="M5 60 L10 70 L15 60 Z" fill="currentColor" className="text-black/35" />
    </svg>
  );
}

function FlowNodeCell({ node, live }: { node: FlowNode; live: boolean }) {
  return (
    <div className="flex w-[120px] shrink-0 flex-col items-center gap-3 text-center sm:w-[152px]">
      <SponsorLogo src={node.src} alt={node.alt} live={live} size={88} fit={node.fit} />
      <span
        className={`font-display text-xs uppercase leading-tight tracking-wide sm:text-sm ${
          live ? "text-black/55" : "text-black/25"
        }`}
      >
        {node.label}
      </span>
    </div>
  );
}

export default function PipelineFlow({
  integrations,
  running,
}: {
  integrations: Partial<Record<IntegrationKey, boolean>> | null;
  running: boolean;
}) {
  const row1 = FLOW.slice(0, ROW_SIZE);
  // Flow order is [youdotcom, insforge, hydra]; reversed gives the
  // left-to-right *visual* order (Memory ... Cited research) so it can share
  // row1's column grid directly instead of relying on flex-row-reverse.
  const row2 = [...FLOW.slice(ROW_SIZE)].reverse();
  const emptyCols = ROW_SIZE - row2.length;

  const isLive = (node: FlowNode) =>
    node.key === "rocketride" ? true : integrations?.[node.key as IntegrationKey] !== false;

  return (
    <div className="px-8 py-16 md:px-16 md:py-24">
      <div className="mb-14 text-center font-display text-sm uppercase tracking-[0.35em] text-black/45">
        The floor, live
      </div>

      <div className="mx-auto flex max-w-6xl flex-col">
        <div className="flex items-start gap-2 sm:gap-4">
          {row1.map((node, i) => (
            <div key={node.key} className="flex flex-1 items-start">
              <FlowNodeCell node={node} live={isLive(node)} />
              {i < row1.length - 1 && (
                <div className="mt-11 flex flex-1 items-center text-black/25">
                  <FlowArrow active={running} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2 sm:gap-4">
          {Array.from({ length: ROW_SIZE - 1 }).map((_, i) => (
            <div key={`down-spacer-${i}`} className="flex-1" />
          ))}
          <div className="flex flex-1 items-start">
            <div className="flex w-[120px] shrink-0 justify-center sm:w-[152px]">
              <DownArrow active={running} />
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 sm:gap-4">
          {Array.from({ length: emptyCols }).map((_, i) => (
            <div key={`row2-spacer-${i}`} className="flex-1" />
          ))}
          {row2.map((node, i) => (
            <div key={node.key} className="flex flex-1 items-start">
              <FlowNodeCell node={node} live={isLive(node)} />
              {i < row2.length - 1 && (
                <div className="mt-11 flex flex-1 items-center text-black/25">
                  <FlowArrow active={running} flip />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
