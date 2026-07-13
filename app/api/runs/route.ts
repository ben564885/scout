import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { accountWithSignal } from "@/lib/mock-data";
import { runPipeline } from "@/lib/pipeline";
import { mirrorRunToBand } from "@/lib/band";
import { gatherSignal } from "@/lib/researcher";

export async function POST(req: NextRequest) {
  const { accountId } = await req.json();
  const found = accountWithSignal(accountId);
  if (!found) {
    return NextResponse.json({ error: "Unknown account" }, { status: 404 });
  }

  // Real data pull (Nimble extract + You.com research) when configured,
  // falling back to the curated mock signal otherwise — see lib/researcher.ts.
  const { signal, youCitation } = await gatherSignal(found.account, found.signal);

  const result = runPipeline(found.account, signal, youCitation);

  // Fire the real Band replay after the response is sent — it's several
  // sequential network calls and shouldn't add latency to the demo.
  after(() => mirrorRunToBand(result));

  return NextResponse.json(result);
}
