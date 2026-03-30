import { NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { getPlatformRetellApiKey } from "@/lib/retell/platform-key";
import { listVoices } from "@/lib/retell/client";


export async function GET(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = await getPlatformRetellApiKey(convex);

    const voices = await listVoices(apiKey);

    return NextResponse.json({ voices });
  } catch (err: any) {
    console.error("[retell-voices] GET error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to list voices" },
      { status: 500 }
    );
  }
}
