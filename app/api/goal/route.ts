import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { FloorEvent, runFloorStream } from "@/lib/pipeline";
import { mirrorRunToBand } from "@/lib/band";
import { announceFloorGoal, mirrorRunToKylon } from "@/lib/kylon";
import { FloorRun } from "@/lib/types";

// The floor's only entry point (PRD §5): one plain-language goal, and the whole
// team runs — Prospector builds the list, Researcher cites a "why now", Writer
// drafts, Compliance vets, Manager approves or escalates. No step-by-step
// driving. That's the difference between an AI employee and a tool.

// Live Nimble + You.com pulls across a 20-40 account floor run (up from a
// fixed 3) — measured ~75s locally at RESEARCH_CONCURRENCY=12, so 180s
// leaves real headroom for a slower live pull without a hard-coded 120s
// ceiling cutting the run off mid-research.
export const maxDuration = 180;

// Streamed as newline-delimited JSON (one FloorEvent per line) instead of one
// blob at the end — a 20-40 account run takes 60-90s total, and waiting that
// long to see anything read as broken. The client renders each account the
// moment its own research + draft clears instead of waiting out the slowest
// straggler in the batch.
export async function POST(req: NextRequest) {
  const { goal } = await req.json();

  if (typeof goal !== "string" || !goal.trim()) {
    return NextResponse.json({ error: "Give the floor a goal." }, { status: 400 });
  }

  const trimmedGoal = goal.trim();
  const encoder = new TextEncoder();
  let finishedFloor: FloorRun | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: FloorEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        finishedFloor = await runFloorStream(trimmedGoal, send);
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : String(error) })}\n`
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  // Replay each run onto Band and Kylon after the response is sent — both
  // are several sequential network/CLI round-trips and shouldn't add
  // latency to the demo. `after()` fires once the stream itself has fully
  // closed, by which point `finishedFloor` is populated.
  after(async () => {
    if (!finishedFloor) return;
    await announceFloorGoal(trimmedGoal, finishedFloor.prospecting.sourceLabel, finishedFloor.prospecting.live);
    for (const run of finishedFloor.runs) {
      await mirrorRunToBand(run);
      await mirrorRunToKylon(run);
    }
  });

  return new NextResponse(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
