import { NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../convex/_generated/api";

/**
 * Health check endpoint. Public — no auth required.
 * Verifies Convex connectivity and returns basic status.
 */
export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  // Convex connectivity check — lightweight query
  try {
    const convexStart = Date.now();
    await convex.query(api.organizations.getPlatformOrg);
    checks.convex = { ok: true, latencyMs: Date.now() - convexStart };
  } catch (err) {
    checks.convex = {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  const status = allOk ? 200 : 503;

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeMs: Date.now() - startedAt,
      checks,
    },
    { status }
  );
}
