import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { decryptProviderKeys } from "@/lib/credentials/provider-keys";
import {
  startLoginTest,
  submitLoginTest2FA,
  cleanupLoginTestSession,
} from "@/lib/portals/natgen-portal";
import type { Id } from "../../../../convex/_generated/dataModel";

export const maxDuration = 120; // 2 min — browser login can take a while

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "start_login") {
      const { organizationId, username, password } = body;

      let creds: { username: string; password: string; portalUrl?: string };

      if (username && password) {
        // Testing unsaved credentials entered in the form
        creds = { username, password };
      } else if (organizationId) {
        // Testing saved credentials
        const org = await convex.query(api.organizations.getById, {
          id: organizationId as Id<"organizations">,
        });
        if (!org?.providerKeys) {
          return NextResponse.json({ status: "error", message: "No credentials saved for this organization." });
        }
        const keys = decryptProviderKeys(org.providerKeys as Record<string, any>, organizationId);
        const natgenCred = keys.natgen_portal;
        if (!natgenCred || !natgenCred.token) {
          return NextResponse.json({ status: "error", message: "National General credentials not found." });
        }
        const parts = natgenCred.token.split("|");
        const [u, p, portalUrl] = parts;
        if (!u || !p) {
          return NextResponse.json({ status: "error", message: "Saved credentials are malformed." });
        }
        creds = { username: u, password: p, portalUrl: portalUrl || undefined };
      } else {
        return NextResponse.json({ status: "error", message: "Provide organizationId or username/password." });
      }

      const result = await startLoginTest(creds);
      return NextResponse.json(result);
    }

    if (action === "submit_2fa") {
      const { sessionId, code } = body;
      if (!sessionId || !code) {
        return NextResponse.json({ status: "error", message: "Missing sessionId or code." });
      }
      const result = await submitLoginTest2FA(sessionId, code.trim());
      return NextResponse.json(result);
    }

    if (action === "cleanup") {
      const { sessionId } = body;
      if (sessionId) cleanupLoginTestSession(sessionId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ status: "error", message: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error("[portal-test]", err);
    return NextResponse.json({ status: "error", message: err.message ?? "Portal test failed" }, { status: 500 });
  }
}
