// A consistent square, rounded badge for every sponsor logo regardless of the
// source asset's native shape — wordmark SVGs (Band, Nimble, RocketRide) get
// cropped to a centered square via object-cover, same as the already-square
// icon assets (Kylon, Hydra, InsForge, You.com). One shape language for the
// whole pipeline flow instead of a mix of wide logotypes and square icons.

export function SponsorLogo({
  src,
  alt,
  size = 44,
  live = true,
  fit = "cover",
}: {
  src: string;
  alt: string;
  size?: number;
  live?: boolean;
  // "cover" crops to fill the square — right for already-square icon marks.
  // "contain" (with padding) keeps a wide wordmark legible instead of
  // cropping it down to an unreadable sliver of text.
  fit?: "cover" | "contain";
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border transition-all duration-300 ${
        live ? "border-black/15 bg-white" : "border-black/10 bg-white grayscale"
      } ${fit === "contain" ? "p-2" : ""}`}
      style={{ width: size, height: size, opacity: live ? 1 : 0.35 }}
      title={alt}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`} />
    </div>
  );
}
