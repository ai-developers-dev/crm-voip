// Run with: npx tsx scripts/delete-clerk-org.ts
// This script deletes an organization from Clerk by name

import { createClerkClient } from "@clerk/backend";

const clerkSecretKey = process.env.CLERK_SECRET_KEY;

if (!clerkSecretKey) {
  console.error("CLERK_SECRET_KEY environment variable is required");
  process.exit(1);
}

const clerk = createClerkClient({ secretKey: clerkSecretKey });

async function deleteOrgByName(orgName: string) {
  console.log(`Looking for organization: ${orgName}`);

  // List all organizations
  const orgs = await clerk.organizations.getOrganizationList({ limit: 100 });

  console.log(`Found ${orgs.data.length} organizations:`);
  orgs.data.forEach(org => {
    console.log(`  - ${org.name} (${org.id})`);
  });

  // Find the org by name (case-insensitive)
  const targetOrg = orgs.data.find(
    org => org.name.toLowerCase() === orgName.toLowerCase()
  );

  if (!targetOrg) {
    console.log(`\nOrganization "${orgName}" not found in Clerk`);
    return;
  }

  console.log(`\nFound organization: ${targetOrg.name} (${targetOrg.id})`);
  console.log("Deleting...");

  await clerk.organizations.deleteOrganization(targetOrg.id);

  console.log("✅ Organization deleted from Clerk!");
}

// Delete Kover King
deleteOrgByName("Kover King").catch(console.error);
