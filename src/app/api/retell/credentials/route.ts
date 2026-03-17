import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { encrypt } from "@/lib/credentials/crypto";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { organizationId, apiKey } = body;

    if (!organizationId || !apiKey) {
      return NextResponse.json(
        { error: "Missing required fields: organizationId, apiKey" },
        { status: 400 }
      );
    }

    // Encrypt API key before storing
    const encryptedApiKey = encrypt(apiKey, organizationId);

    await convex.mutation(api.organizations.updateRetellCredentials, {
      organizationId: organizationId as Id<"organizations">,
      retellApiKey: encryptedApiKey,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[retell-credentials] Save error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to save credentials" },
      { status: 500 }
    );
  }
}

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

    const org = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });

    const configured = !!org?.settings?.retellConfigured;

    return NextResponse.json({ configured });
  } catch (err: any) {
    console.error("[retell-credentials] GET error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to check credentials" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
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

    await convex.mutation(api.organizations.removeRetellCredentials, {
      organizationId: organizationId as Id<"organizations">,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[retell-credentials] DELETE error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to remove credentials" },
      { status: 500 }
    );
  }
}
