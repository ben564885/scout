import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { runFloor } from "@/lib/pipeline";
import { mirrorRunToBand } from "@/lib/band";
import { announceFloorGoal, mirrorRunToKylon } from "@/lib/kylon";

// The floor's only entry point (PRD §5): one plain-language goal, and the whole
// team runs — Prospector builds the list, Researcher cites a "why now", Writer
// drafts, Compliance vets, Manager approves or escalates. No step-by-step
// driving. That's the difference between an AI employee and a tool.

export const maxDuration = 120; // live Nimble + You.com pulls across several accounts

export async function POST(req: NextRequest) {
  const { goal } = await req.json();

  if (typeof goal !== "string" || !goal.trim()) {
    return NextResponse.json({ error: "Give the floor a goal." }, { status: 400 });
  }

  const floor = await runFloor(goal.trim());

  // Replay each run onto Band and Kylon after the response is sent — both
  // are several sequential network/CLI round-trips and shouldn't add
  // latency to the demo.
  after(async () => {
    await announceFloorGoal(goal.trim(), floor.prospecting.sourceLabel, floor.prospecting.live);
    for (const run of floor.runs) {
      await mirrorRunToBand(run);
      await mirrorRunToKylon(run);
    }
  });

  return NextResponse.json(floor);
}
