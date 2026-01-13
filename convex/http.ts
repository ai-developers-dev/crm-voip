import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const http = httpRouter();

// ============================================================================
// Twilio webhooks are handled by Next.js API routes at /api/twilio/*
// This allows using the full twilio npm package for VoiceResponse/validation
// ============================================================================

// Clerk webhook handler - syncs users and organizations to Convex
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("CLERK_WEBHOOK_SECRET is not set");
      return new Response("Server configuration error", { status: 500 });
    }

    const svix_id = request.headers.get("svix-id");
    const svix_timestamp = request.headers.get("svix-timestamp");
    const svix_signature = request.headers.get("svix-signature");

    if (!svix_id || !svix_timestamp || !svix_signature) {
      return new Response("Missing svix headers", { status: 400 });
    }

    const payload = await request.text();
    const wh = new Webhook(webhookSecret);

    let event: any;
    try {
      event = wh.verify(payload, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      });
    } catch (err) {
      console.error("Webhook verification failed:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    const eventType = event.type;
    console.log(`Received Clerk webhook: ${eventType}`);

    try {
      switch (eventType) {
        case "organization.created":
          await ctx.runMutation(internal.organizations.createFromClerk, {
            clerkOrgId: event.data.id,
            name: event.data.name,
            slug: event.data.slug || event.data.id,
          });
          break;

        case "organization.updated":
          await ctx.runMutation(internal.organizations.updateFromClerk, {
            clerkOrgId: event.data.id,
            name: event.data.name,
            slug: event.data.slug,
          });
          break;

        case "organization.deleted":
          // Cascade delete all related data when org is deleted from Clerk
          await ctx.runMutation(internal.organizations.deleteFromClerk, {
            clerkOrgId: event.data.id,
          });
          break;

        case "organizationMembership.created": {
          const clerkRole = event.data.role;
          const clerkUserId = event.data.public_user_data.user_id;
          const clerkOrgId = event.data.organization.id;
          const email = event.data.public_user_data.identifier || "";
          const firstName = event.data.public_user_data.first_name || "";
          const lastName = event.data.public_user_data.last_name || "";
          const name = `${firstName} ${lastName}`.trim() || "User";
          const avatarUrl = event.data.public_user_data.image_url;

          // Check if this is a platform-level role
          if (isPlatformRole(clerkRole)) {
            // Add as platform user
            await ctx.runMutation(internal.platformUsers.upsertFromClerk, {
              clerkUserId,
              email,
              name,
              avatarUrl,
              role: mapClerkRoleToPlatformRole(clerkRole),
            });
          } else {
            // Add as regular tenant user
            await ctx.runMutation(internal.users.addToOrganization, {
              clerkUserId,
              clerkOrgId,
              role: mapClerkRoleToTenantRole(clerkRole),
            });
          }
          break;
        }

        case "organizationMembership.updated": {
          const clerkRole = event.data.role;
          const clerkUserId = event.data.public_user_data.user_id;
          const clerkOrgId = event.data.organization.id;

          // Check if role changed to/from platform role
          if (isPlatformRole(clerkRole)) {
            // Upgrade to platform user
            const email = event.data.public_user_data.identifier || "";
            const firstName = event.data.public_user_data.first_name || "";
            const lastName = event.data.public_user_data.last_name || "";
            const name = `${firstName} ${lastName}`.trim() || "User";
            const avatarUrl = event.data.public_user_data.image_url;

            await ctx.runMutation(internal.platformUsers.upsertFromClerk, {
              clerkUserId,
              email,
              name,
              avatarUrl,
              role: mapClerkRoleToPlatformRole(clerkRole),
            });
          } else {
            // Update tenant user role
            await ctx.runMutation(internal.users.addToOrganization, {
              clerkUserId,
              clerkOrgId,
              role: mapClerkRoleToTenantRole(clerkRole),
            });
          }
          break;
        }

        case "organizationMembership.deleted":
          await ctx.runMutation(internal.users.removeFromOrganization, {
            clerkUserId: event.data.public_user_data.user_id,
            clerkOrgId: event.data.organization.id,
          });
          break;

        case "user.created":
        case "user.updated":
          await ctx.runMutation(internal.users.upsertFromClerk, {
            clerkUserId: event.data.id,
            email: event.data.email_addresses[0]?.email_address || "",
            name: `${event.data.first_name || ""} ${event.data.last_name || ""}`.trim() || "User",
            avatarUrl: event.data.image_url,
          });
          break;

        case "user.deleted":
          await ctx.runMutation(internal.users.deleteFromClerk, {
            clerkUserId: event.data.id,
          });
          break;
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Error processing webhook:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }),
});

// Check if a Clerk role is a platform-level role
function isPlatformRole(clerkRole: string): boolean {
  return clerkRole === "org:super_admin" || clerkRole === "org:platform_staff";
}

// Map Clerk role to platform role
function mapClerkRoleToPlatformRole(clerkRole: string): "super_admin" | "platform_staff" {
  switch (clerkRole) {
    case "org:super_admin":
      return "super_admin";
    case "org:platform_staff":
      return "platform_staff";
    default:
      return "platform_staff"; // Default to lower privilege
  }
}

// Map Clerk role to tenant role
function mapClerkRoleToTenantRole(clerkRole: string): "tenant_admin" | "supervisor" | "agent" {
  switch (clerkRole) {
    case "org:admin":
      return "tenant_admin";
    case "org:supervisor":
      return "supervisor";
    case "org:member":
    default:
      return "agent";
  }
}

export default http;
