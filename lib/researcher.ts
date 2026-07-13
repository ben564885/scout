import { Account, Signal } from "./types";
import { MIN_LIVE_SIGNAL_COUNT, detectHiringPush, detectReviewCluster, extractPage } from "./nimble";
import { CitedResearch, researchWhyNow } from "./youdotcom";
import { integrationStatus } from "./env";

// Async data-gathering step run once, before the (synchronous, deterministic)
// governance pipeline in lib/pipeline.ts. Kept separate so the pipeline
// itself never depends on network calls — real data in, same reliable
// control flow out. Falls back to the curated mock signal untouched when
// Nimble/You.com aren't configured or a live pull comes back empty.
export async function gatherSignal(
  account: Account,
  mockSignal: Signal
): Promise<{ signal: Signal; youCitation: CitedResearch | null }> {
  let signal = mockSignal;

  if (integrationStatus.nimble) {
    const markdown = await extractPage(mockSignal.sourceUrl);
    if (markdown) {
      const live =
        mockSignal.type === "hiring" ? detectHiringPush(markdown) : detectReviewCluster(markdown);
      if (live.sampleQuote && live.count >= MIN_LIVE_SIGNAL_COUNT) {
        signal = {
          ...mockSignal,
          summary: `${live.count} recent, live-extracted signal(s) matching "${mockSignal.type}" found on ${new URL(mockSignal.sourceUrl).hostname}.`,
          sourceQuote: live.sampleQuote,
          strength: Math.min(100, 40 + live.count * 15),
          detectedAt: new Date().toISOString(),
        };
      }
    }
  }

  const youCitation = integrationStatus.youdotcom
    ? await researchWhyNow(account.name, account.city, account.region)
    : null;

  return { signal, youCitation };
}
