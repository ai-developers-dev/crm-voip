import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { encrypt } from "@/lib/credentials/crypto";
import { isPlatformRetellConfigured } from "@/lib/retell/platform-key";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { apiKey } = body;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing required field: apiKey" },
        { status: 400 }
      );
    }

    // Get the platform org
    const platformOrg = await convex.query(api.organizations.getPlatformOrg);
    if (!platformOrg) {
      return NextResponse.json(
        { error: "Platform organization not found" },
        { status: 500 }
      );
    }

    // Encrypt API key using the platform org ID
    const encryptedApiKey = encrypt(apiKey, platformOrg._id);

    await convex.mutation(api.organizations.updateRetellCredentials, {
      organizationId: platformOrg._id,
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

    const configured = await isPlatformRetellConfigured(convex);

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

    // Get the platform org
    const platformOrg = await convex.query(api.organizations.getPlatformOrg);
    if (!platformOrg) {
      return NextResponse.json(
        { error: "Platform organization not found" },
        { status: 500 }
      );
    }

    await convex.mutation(api.organizations.removeRetellCredentials, {
      organizationId: platformOrg._id,
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
