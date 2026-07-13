import { SponsorLogo } from "./SponsorLogo";

// Flowchart of the floor's actual backend pipeline (PRD §8.1): the goal
// enters through Kylon, Band delegates and governs the whole run, Nimble +
// You.com do the research, InsForge persists it, Hydra remembers it run to
// run. Each arrow is an animated dashed line — fast while the floor is
// actually running, a slow ambient crawl otherwise — so the diagram reads as
// "live," not a static logo strip. Nodes dim to grayscale when that
// integration isn't actually configured, matching the honesty rule the dot
// row already followed (real status, not vaporware).

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

function FlowArrow({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      className="h-5 w-full min-w-[24px] flex-1"
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

export default function PipelineFlow({
  integrations,
  running,
}: {
  integrations: Partial<Record<IntegrationKey, boolean>> | null;
  running: boolean;
}) {
  return (
    <div className="border-b border-black/10 px-6 py-6 md:px-10">
      <div className="mb-4 font-display text-[10px] uppercase tracking-[0.25em] text-black/45">
        The floor, live
      </div>
      <div className="flex flex-wrap items-start gap-x-1 gap-y-6 sm:flex-nowrap">
        {FLOW.map((node, i) => {
          const live = node.key === "rocketride" ? true : integrations?.[node.key] !== false;
          return (
            <div key={node.key} className="flex flex-1 items-start sm:contents">
              <div className="flex w-[76px] shrink-0 flex-col items-center gap-2 text-center sm:w-[88px]">
                <SponsorLogo src={node.src} alt={node.alt} live={live} size={48} fit={node.fit} />
                <span
                  className={`font-display text-[9px] uppercase leading-tight tracking-wide ${
                    live ? "text-black/55" : "text-black/25"
                  }`}
                >
                  {node.label}
                </span>
              </div>
              {i < FLOW.length - 1 && (
                <div className="mt-6 flex flex-1 items-center text-black/25">
                  <FlowArrow active={running} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
