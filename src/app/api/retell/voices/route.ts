import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { listVoices } from "@/lib/retell/client";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing organizationId" },
        { status: 400 }
      );
    }

    // Get org and decrypt API key
    const org = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });
    if (!org?.settings?.retellApiKey) {
      return NextResponse.json(
        { error: "Retell API key not configured" },
        { status: 400 }
      );
    }
    const apiKey = decrypt(org.settings.retellApiKey, organizationId);

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
