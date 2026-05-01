"use node";

/**
 * Facebook Lead Ads — Convex Node-runtime actions.
 *
 * Lives in a separate file from `convex/facebook.ts` because it needs
 * the Node.js runtime (`"use node"` directive) for the crypto module
 * the credential-encryption helper depends on. Convex requires Node-
 * runtime files to contain only actions — mutations and queries stay
 * in the V8-runtime sibling file.
 *
 * Actions exposed here:
 *   - completeOAuth     — exchange code → user token → pages list
 *   - confirmConnections — picked-page list → page tokens → connections
 *   - ingestLead         — fetch one lead's data → contact + audit row
 *   - pollLeads          — cron: walk every connection, ingest new leads
 *
 * Plan reference: ~/.claude/plans/i-think-i-m-confused-declarative-neumann.md
 */

import { v } from "convex/values";
import {
  action,
  internalAction,
  ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { encrypt, decrypt } from "./lib/credentials";

/**
 * Action-time auth check. Actions don't get the same `authorizeOrgMember`
 * helper as queries/mutations because they run in a different runtime
 * (no `ctx.db`). Instead we verify the Clerk JWT and then run a query
 * that confirms the user is a member of the org.
 *
 * Throws if not authenticated or not authorized.
 */
async function requireOrgAuth(
  ctx: ActionCtx,
  organizationId: Id<"organizations">,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  const ok = await ctx.runQuery(internal.facebook.isOrgMember, {
    clerkUserId: identity.subject,
    organizationId,
  });
  if (!ok) {
    throw new Error("Not authorized for this organization");
  }
  return identity.subject;
}

const LOG_PREFIX = "[facebook]";
const FB_GRAPH_VERSION = "v19.0";
const FB_GRAPH_BASE = `https://graph.facebook.com/${FB_GRAPH_VERSION}`;

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

async function graphGet<T>(path: string, params: Record<string, string>) {
  const url = new URL(`${FB_GRAPH_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: "GET" });
  const text = await res.text();
  if (!res.ok) {
    let metaMsg = text;
    try {
      const parsed = JSON.parse(text);
      metaMsg = parsed?.error?.message ?? text;
    } catch {
      // not JSON
    }
    throw new Error(`Graph GET ${path} failed (${res.status}): ${metaMsg}`);
  }
  return JSON.parse(text) as T;
}

/**
 * Map Meta's `field_data` array to the shape `insertContactFromLead`
 * expects. Returns `null` when no phone field is present so the
 * caller can record a "no_phone" rejection (decision #2 from plan).
 */
function mapFieldDataToContact(
  fieldData: Array<{ name: string; values: string[] }>,
): {
  firstName: string;
  lastName?: string;
  email?: string;
  phoneNumber: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  company?: string;
  dateOfBirth?: string;
  notes?: string;
} | null {
  const fields = new Map<string, string>();
  for (const f of fieldData) {
    if (f.values && f.values.length > 0) {
      fields.set(f.name.toLowerCase(), f.values[0]);
    }
  }

  const phoneNumber =
    fields.get("phone_number") ??
    fields.get("phone") ??
    fields.get("mobile_phone");
  if (!phoneNumber) return null;

  const fullName = fields.get("full_name") ?? fields.get("name");
  let firstName = fields.get("first_name") ?? "";
  let lastName = fields.get("last_name");
  if (!firstName && fullName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts[0] ?? "Unknown";
    if (!lastName && parts.length > 1) {
      lastName = parts.slice(1).join(" ");
    }
  }
  if (!firstName) firstName = "Unknown";

  const STANDARD_KEYS = new Set([
    "phone_number",
    "phone",
    "mobile_phone",
    "full_name",
    "name",
    "first_name",
    "last_name",
    "email",
    "street_address",
    "city",
    "state",
    "post_code",
    "zip_code",
    "company_name",
    "company",
    "date_of_birth",
  ]);
  const customLines: string[] = [];
  for (const [k, val] of fields.entries()) {
    if (!STANDARD_KEYS.has(k)) {
      customLines.push(`${k}: ${val}`);
    }
  }

  return {
    firstName,
    lastName,
    email: fields.get("email"),
    phoneNumber,
    streetAddress: fields.get("street_address"),
    city: fields.get("city"),
    state: fields.get("state"),
    zipCode: fields.get("post_code") ?? fields.get("zip_code"),
    company: fields.get("company_name") ?? fields.get("company"),
    dateOfBirth: fields.get("date_of_birth"),
    notes:
      customLines.length > 0
        ? `From Facebook Lead Ad:\n${customLines.join("\n")}`
        : "From Facebook Lead Ad",
  };
}

// ─────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────

/**
 * Step 1 of OAuth: called from /api/facebook/callback with the
 * authorization code Meta redirected back. Exchanges code → short-
 * lived user token → long-lived user token, fetches the user's
 * manageable Pages, encrypts the user token, inserts a pending row,
 * and returns the state token for the UI to use.
 */
export const completeOAuth = action({
  args: {
    organizationId: v.id("organizations"),
    code: v.string(),
    state: v.string(),
    redirectUri: v.string(),
    initiatedByUserId: v.optional(v.id("users")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    pages: Array<{ pageId: string; pageName: string }>;
  }> => {
    await requireOrgAuth(ctx, args.organizationId);
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error(
        "FACEBOOK_APP_ID / FACEBOOK_APP_SECRET not set on Convex deployment.",
      );
    }

    // Exchange code for short-lived user access token.
    const shortLived = await graphGet<{
      access_token: string;
      token_type: string;
      expires_in: number;
    }>(`/oauth/access_token`, {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: args.redirectUri,
      code: args.code,
    });

    // Exchange for long-lived user token (~60 days). Long-lived user
    // tokens yield permanent Page Access Tokens (no expiry as long as
    // user keeps the app authorized).
    const longLived = await graphGet<{
      access_token: string;
      token_type: string;
      expires_in?: number;
    }>(`/oauth/access_token`, {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLived.access_token,
    });

    // List pages the user manages.
    const pagesResp = await graphGet<{
      data: Array<{ id: string; name: string }>;
    }>(`/me/accounts`, {
      fields: "id,name",
      access_token: longLived.access_token,
      limit: "100",
    });

    if (pagesResp.data.length === 0) {
      throw new Error(
        "This Facebook account doesn't manage any Pages. Create or be added to a Page first.",
      );
    }

    const pages = pagesResp.data.map((p) => ({
      pageId: p.id,
      pageName: p.name,
    }));

    const userTokenEncrypted = encrypt(
      longLived.access_token,
      args.organizationId,
    );
    await ctx.runMutation(internal.facebook.storePendingConnection, {
      organizationId: args.organizationId,
      state: args.state,
      userAccessTokenEncrypted: userTokenEncrypted,
      pages,
      initiatedByUserId: args.initiatedByUserId,
    });

    return { pages };
  },
});

/**
 * Step 2 of OAuth: user submitted the multi-page checklist. Pull the
 * pending row, fetch each picked page's permanent Page Access Token,
 * subscribe each to the `leadgen` topic, and insert the connection
 * rows.
 */
export const confirmConnections = action({
  args: {
    organizationId: v.id("organizations"),
    state: v.string(),
    selectedPageIds: v.array(v.string()),
    initiatedByUserId: v.optional(v.id("users")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    connected: number;
    errors: Array<{ pageId: string; message: string }>;
  }> => {
    await requireOrgAuth(ctx, args.organizationId);
    const pending: Doc<"facebookPendingConnections"> | null = await ctx.runQuery(
      internal.facebook.getPendingByState,
      { state: args.state },
    );
    if (!pending) {
      throw new Error("OAuth state not found or expired. Please reconnect.");
    }
    if (pending.organizationId !== args.organizationId) {
      throw new Error("OAuth state does not belong to this organization.");
    }
    if (pending.expiresAt < Date.now()) {
      await ctx.runMutation(internal.facebook.deletePendingConnection, {
        id: pending._id,
      });
      throw new Error("OAuth flow expired. Please reconnect.");
    }

    const userToken = decrypt(pending.userAccessToken, args.organizationId);
    const errors: Array<{ pageId: string; message: string }> = [];
    let connected = 0;

    for (const pageId of args.selectedPageIds) {
      try {
        // Fetch this page's permanent Page Access Token + canonical name.
        const pageInfo = await graphGet<{
          id: string;
          access_token: string;
          name: string;
        }>(`/${pageId}`, {
          fields: "access_token,name",
          access_token: userToken,
        });

        // Subscribe page to `leadgen` webhook events. Best-effort —
        // failure here doesn't block the connection because polling
        // (every 5 min) covers tenants whose subscribe failed.
        const subscribeUrl = new URL(
          `${FB_GRAPH_BASE}/${pageId}/subscribed_apps`,
        );
        subscribeUrl.searchParams.set("subscribed_fields", "leadgen");
        subscribeUrl.searchParams.set("access_token", pageInfo.access_token);
        const subRes = await fetch(subscribeUrl.toString(), { method: "POST" });
        if (!subRes.ok) {
          const subText = await subRes.text();
          let parsed = subText;
          try {
            const j = JSON.parse(subText);
            parsed = j?.error?.message ?? subText;
          } catch {
            // not JSON
          }
          console.warn(
            `${LOG_PREFIX} subscribe leadgen failed for page ${pageId}:`,
            parsed,
          );
        }

        const encryptedPageToken = encrypt(
          pageInfo.access_token,
          args.organizationId,
        );
        await ctx.runMutation(internal.facebook.upsertConnection, {
          organizationId: args.organizationId,
          pageId,
          pageName: pageInfo.name,
          pageAccessTokenEncrypted: encryptedPageToken,
          connectedByUserId: args.initiatedByUserId,
        });
        connected += 1;
      } catch (err) {
        errors.push({
          pageId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await ctx.runMutation(internal.facebook.deletePendingConnection, {
      id: pending._id,
    });

    return { connected, errors };
  },
});

/**
 * Ingest one lead by its leadgen ID. Called by:
 *   - /api/facebook/webhook (real-time)  — Sprint 2
 *   - pollLeads (cron catch-up)          — this sprint
 */
export const ingestLead = internalAction({
  args: {
    organizationId: v.id("organizations"),
    pageId: v.string(),
    leadgenId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.runQuery(internal.facebook.findLeadByLeadgenId, {
      leadgenId: args.leadgenId,
    });
    if (existing) return { skipped: "duplicate" as const };

    const conn: Doc<"facebookConnections"> | null = await ctx.runQuery(
      internal.facebook.getConnectionByPageId,
      { pageId: args.pageId },
    );
    if (!conn || conn.status !== "active") {
      return { skipped: "no_active_connection" as const };
    }

    const pageToken = decrypt(conn.pageAccessToken, args.organizationId);

    let lead: {
      id: string;
      created_time: string;
      field_data: Array<{ name: string; values: string[] }>;
      form_id: string;
      ad_id?: string;
      campaign_id?: string;
    };
    try {
      lead = await graphGet(`/${args.leadgenId}`, {
        fields: "field_data,form_id,ad_id,campaign_id,created_time",
        access_token: pageToken,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG_PREFIX} fetch lead ${args.leadgenId} failed:`, msg);
      await ctx.runMutation(internal.facebook.updateConnectionStatus, {
        connectionId: conn._id,
        status: "error",
        errorMessage: msg,
      });
      return { skipped: "graph_api_error" as const };
    }

    const mapped = mapFieldDataToContact(lead.field_data);
    if (!mapped) {
      await ctx.runMutation(internal.facebook.recordLead, {
        organizationId: args.organizationId,
        leadgenId: lead.id,
        pageId: args.pageId,
        formId: lead.form_id,
        adId: lead.ad_id,
        campaignId: lead.campaign_id,
        rawFieldData: lead.field_data,
        errorMessage: "no_phone",
      });
      return { skipped: "no_phone" as const };
    }

    const contactId: Id<"contacts"> = await ctx.runMutation(
      internal.facebook.insertContactFromLead,
      {
        organizationId: args.organizationId,
        ...mapped,
      },
    );
    await ctx.runMutation(internal.facebook.recordLead, {
      organizationId: args.organizationId,
      leadgenId: lead.id,
      pageId: args.pageId,
      formId: lead.form_id,
      adId: lead.ad_id,
      campaignId: lead.campaign_id,
      rawFieldData: lead.field_data,
      contactId,
    });

    await ctx.scheduler.runAfter(0, internal.workflowEngine.checkTriggers, {
      organizationId: args.organizationId,
      triggerType: "contact_created",
      contactId,
    });

    return { created: contactId };
  },
});

/**
 * Cron: every 5 min, walk every active connection and ingest any new
 * leads since `lastSyncAt`. Webhook is the primary delivery path; this
 * is the safety net.
 */
export const pollLeads = internalAction({
  args: {},
  handler: async (ctx): Promise<{ swept: number; ingested: number }> => {
    const connections: Doc<"facebookConnections">[] = await ctx.runQuery(
      internal.facebook.listAllActiveConnections,
      {},
    );
    let ingested = 0;

    for (const conn of connections) {
      try {
        const pageToken = decrypt(conn.pageAccessToken, conn.organizationId);
        const since = conn.lastSyncAt
          ? Math.floor(conn.lastSyncAt / 1000)
          : Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

        const forms = await graphGet<{
          data: Array<{ id: string; name: string }>;
        }>(`/${conn.pageId}/leadgen_forms`, {
          fields: "id,name",
          access_token: pageToken,
        });

        for (const form of forms.data) {
          const filtering = JSON.stringify([
            {
              field: "created_time",
              operator: "GREATER_THAN",
              value: since,
            },
          ]);
          const leads = await graphGet<{
            data: Array<{ id: string; created_time: string }>;
          }>(`/${form.id}/leads`, {
            fields: "id,created_time",
            access_token: pageToken,
            filtering,
            limit: "100",
          });
          for (const lead of leads.data) {
            await ctx.runAction(internal.facebookActions.ingestLead, {
              organizationId: conn.organizationId,
              pageId: conn.pageId,
              leadgenId: lead.id,
            });
            ingested += 1;
          }
        }

        await ctx.runMutation(internal.facebook.updateConnectionStatus, {
          connectionId: conn._id,
          lastSyncAt: Date.now(),
          status: "active",
          errorMessage: undefined,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `${LOG_PREFIX} pollLeads failed for connection ${conn._id}:`,
          msg,
        );
        await ctx.runMutation(internal.facebook.updateConnectionStatus, {
          connectionId: conn._id,
          status: "error",
          errorMessage: msg,
        });
      }
    }

    return { swept: connections.length, ingested };
  },
});
