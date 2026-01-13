import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Sync the current authenticated user to Convex.
 * This creates the user with their REAL Clerk ID (not a manual ID).
 * Use this when the Clerk webhook didn't fire or created the wrong user.
 */
export async function POST() {
  try {
    const { userId, orgId, orgRole } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    if (!orgId) {
      return NextResponse.json(
        { error: "No organization selected" },
        { status: 400 }
      );
    }

    // Get full user info from Clerk
    const user = await currentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Could not get user info" },
        { status: 500 }
      );
    }

    // Map Clerk role to tenant role
    let role: "tenant_admin" | "supervisor" | "agent" = "agent";
    if (orgRole === "org:admin") {
      role = "tenant_admin";
    } else if (orgRole === "org:supervisor") {
      role = "supervisor";
    }

    const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User";
    const email = user.emailAddresses[0]?.emailAddress || "";

    console.log(`Syncing user: ${name} (${userId}) to org ${orgId} with role ${role}`);

    // Use the new syncFromClerk mutation that creates with real Clerk ID
    const newUserId = await convex.mutation(api.users.syncFromClerk, {
      clerkUserId: userId,
      clerkOrgId: orgId,
      name,
      email,
      role,
    });

    return NextResponse.json({
      success: true,
      message: "User synced successfully with real Clerk ID",
      user: {
        convexId: newUserId,
        clerkUserId: userId,
        clerkOrgId: orgId,
        name,
        email,
        role,
      },
    });
  } catch (error) {
    console.error("Error syncing user:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync user" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { userId, orgId } = await auth();

    return NextResponse.json({
      message: "Use POST to sync current user to Convex",
      usage: "POST /api/sync-user",
      currentUser: userId ? {
        clerkUserId: userId,
        clerkOrgId: orgId,
      } : null,
    });
  } catch {
    return NextResponse.json({
      message: "Use POST to sync current user to Convex",
      usage: "POST /api/sync-user",
    });
  }
}
