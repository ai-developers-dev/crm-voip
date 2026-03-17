import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";

/**
 * Get the platform-level Retell API key.
 * The platform org (isPlatformOrg: true) stores the Retell key
 * so all tenants can use it without their own Retell account.
 */
export async function getPlatformRetellApiKey(convex: ConvexHttpClient): Promise<string> {
  // Find the platform org
  const platformOrg = await convex.query(api.organizations.getPlatformOrg);
  if (!platformOrg) {
    throw new Error("Platform organization not found");
  }

  const retellApiKey = (platformOrg.settings as any)?.retellApiKey;
  if (!retellApiKey) {
    throw new Error("AI Calling not configured. Add your API key in Platform Settings.");
  }

  // Decrypt the API key
  try {
    return decrypt(retellApiKey, platformOrg._id);
  } catch {
    throw new Error("Failed to decrypt AI Calling API key");
  }
}

/**
 * Check if the platform has Retell configured.
 */
export async function isPlatformRetellConfigured(convex: ConvexHttpClient): Promise<boolean> {
  try {
    const platformOrg = await convex.query(api.organizations.getPlatformOrg);
    return !!(platformOrg?.settings as any)?.retellConfigured;
  } catch {
    return false;
  }
}
