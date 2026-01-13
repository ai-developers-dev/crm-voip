import { NextResponse } from "next/server";
import { clerkClient, auth } from "@clerk/nextjs/server";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgName } = await request.json();

    if (!orgName) {
      return NextResponse.json({ error: "orgName is required" }, { status: 400 });
    }

    const clerk = await clerkClient();

    // List all organizations
    const orgs = await clerk.organizations.getOrganizationList({ limit: 100 });

    console.log(`Found ${orgs.data.length} organizations`);

    // Find the org by name (case-insensitive)
    const targetOrg = orgs.data.find(
      org => org.name.toLowerCase() === orgName.toLowerCase()
    );

    if (!targetOrg) {
      return NextResponse.json({
        error: `Organization "${orgName}" not found`,
        available: orgs.data.map(o => o.name)
      }, { status: 404 });
    }

    console.log(`Deleting organization: ${targetOrg.name} (${targetOrg.id})`);

    await clerk.organizations.deleteOrganization(targetOrg.id);

    return NextResponse.json({
      success: true,
      message: `Organization "${targetOrg.name}" deleted from Clerk`
    });

  } catch (error: any) {
    console.error("Error deleting organization:", error);
    return NextResponse.json({
      error: error.message || "Failed to delete organization"
    }, { status: 500 });
  }
}
