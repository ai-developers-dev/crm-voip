import { NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../convex/_generated/api";
import { encrypt } from "@/lib/credentials/crypto";
import type { Id } from "../../../../convex/_generated/dataModel";


export async function POST(req: Request) {
  try {
    // Clerk auth check — verifies caller is authenticated
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { organizationId, username, password, portalUrl, carrierId } = body;

    if (!organizationId || !username || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Encrypt credentials before storing
    const encryptedUsername = encrypt(username, organizationId);
    const encryptedPassword = encrypt(password, organizationId);

    if (carrierId) {
      // Save per-carrier credentials on tenantCarriers
      await convex.mutation(api.tenantCommissions.updateCarrierCredentials, {
        organizationId: organizationId as Id<"organizations">,
        carrierId: carrierId as Id<"agencyCarriers">,
        portalUrl: portalUrl || undefined,
        portalUsername: encryptedUsername,
        portalPassword: encryptedPassword,
      });
    } else {
      // Legacy: save to org-level natgenCredentials
      await convex.mutation(api.organizations.updateNatgenCredentials, {
        organizationId: organizationId as Id<"organizations">,
        username: encryptedUsername,
        password: encryptedPassword,
        portalUrl: portalUrl || undefined,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[natgen-credentials] Save error:", err);
    return NextResponse.json({ error: err.message ?? "Failed to save credentials" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });
    }

    await convex.mutation(api.organizations.removeNatgenCredentials, {
      organizationId: organizationId as Id<"organizations">,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[natgen-credentials]", err);
    return NextResponse.json({ error: err.message ?? "Failed to remove credentials" }, { status: 500 });
  }
}
