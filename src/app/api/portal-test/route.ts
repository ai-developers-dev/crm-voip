import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import {
  startLoginTest,
  submitLoginTest2FA,
  cleanupLoginTestSession,
} from "@/lib/portals/natgen-portal";
import type { Id } from "../../../../convex/_generated/dataModel";

export const maxDuration = 120;

async function getConvex() {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  try {
    const { getToken } = await auth();
    const token = await getToken({ template: "convex" });
    if (token) convex.setAuth(token);
  } catch {}
  return convex;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "start_login") {
      const { organizationId, carrierId, username, password, portalUrl } = body;
      const convex = await getConvex();

      let creds: { username: string; password: string; portalUrl?: string };

      if (username && password) {
        // Testing unsaved credentials entered in the form
        creds = { username, password, portalUrl };
      } else if (organizationId && carrierId) {
        // Read saved credentials from tenantCarriers
        const carriers = await convex.query(api.tenantCommissions.getCarriersWithCredentials, {
          organizationId: organizationId as Id<"organizations">,
        });
        const carrier = carriers.find((c: any) => c.carrierId === carrierId);
        if (!carrier) {
          return NextResponse.json({ status: "error", message: "No credentials saved for this carrier." });
        }
        try {
          creds = {
            username: decrypt(carrier.portalUsername, organizationId),
            password: decrypt(carrier.portalPassword, organizationId),
            portalUrl: carrier.portalUrl || undefined,
          };
        } catch {
          return NextResponse.json({ status: "error", message: "Failed to decrypt saved credentials." });
        }
      } else if (organizationId) {
        // Legacy fallback: read from org settings
        const org = await convex.query(api.organizations.getById, {
          organizationId: organizationId as Id<"organizations">,
        });
        const natgenCreds = (org?.settings as any)?.natgenCredentials;
        if (!natgenCreds?.isConfigured) {
          return NextResponse.json({ status: "error", message: "No credentials saved. Add them in Carrier Settings." });
        }
        try {
          creds = {
            username: decrypt(natgenCreds.username, organizationId),
            password: decrypt(natgenCreds.password, organizationId),
            portalUrl: natgenCreds.portalUrl,
          };
        } catch {
          return NextResponse.json({ status: "error", message: "Failed to decrypt saved credentials." });
        }
      } else {
        return NextResponse.json({ status: "error", message: "Provide credentials or organizationId + carrierId." });
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
