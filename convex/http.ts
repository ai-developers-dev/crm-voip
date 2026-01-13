import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const http = httpRouter();

// ============================================================================
// TwiML Helper Functions (for safe XML generation without twilio npm package)
// ============================================================================

/**
 * Escape special XML characters to prevent injection
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate TwiML for rejecting a call with a message
 */
function rejectCallTwiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Generate TwiML for putting caller in a conference
 */
function conferenceCallTwiml(options: {
  conferenceName: string;
  callerId: string;
  waitUrl?: string;
}): string {
  const waitUrl = options.waitUrl || "http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(options.callerId)}" timeout="30">
    <Conference beep="false" startConferenceOnEnter="false" endConferenceOnExit="false" waitUrl="${escapeXml(waitUrl)}">
      ${escapeXml(options.conferenceName)}
    </Conference>
  </Dial>
</Response>`;
}

/**
 * Return a TwiML Response
 */
function twimlResponse(twiml: string): Response {
  return new Response(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}

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

// Twilio voice webhook handler
http.route({
  path: "/twilio/voice",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const formData = await request.formData();
    const callSid = formData.get("CallSid") as string;
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;

    console.log(`Incoming call: ${callSid} from ${from} to ${to}`);

    // Look up phone number to get organization
    const phoneNumber = await ctx.runQuery(internal.phoneNumbers.getByNumber, {
      phoneNumber: to,
    });

    if (!phoneNumber) {
      // Return TwiML to reject unknown numbers
      return twimlResponse(rejectCallTwiml("Sorry, this number is not configured."));
    }

    // Create active call record
    await ctx.runMutation(internal.calls.createIncoming, {
      organizationId: phoneNumber.organizationId,
      twilioCallSid: callSid,
      from,
      to,
    });

    // Return TwiML to put caller in conference (waiting for agent)
    const conferenceName = `call-${callSid}`;
    return twimlResponse(conferenceCallTwiml({
      conferenceName,
      callerId: to,
    }));
  }),
});

// Twilio status callback handler
http.route({
  path: "/twilio/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const formData = await request.formData();
    const callSid = formData.get("CallSid") as string;
    const callStatus = formData.get("CallStatus") as string;
    const callDuration = formData.get("CallDuration") as string;

    console.log(`Call status update: ${callSid} -> ${callStatus}`);

    // Map Twilio status to our call states
    const stateMap: Record<string, string> = {
      initiated: "ringing",
      ringing: "ringing",
      "in-progress": "connected",
      completed: "ended",
      busy: "ended",
      failed: "ended",
      "no-answer": "ended",
      canceled: "ended",
    };

    const outcomeMap: Record<string, string> = {
      completed: "answered",
      busy: "busy",
      failed: "failed",
      "no-answer": "missed",
      canceled: "cancelled",
    };

    await ctx.runMutation(internal.calls.updateStatus, {
      twilioCallSid: callSid,
      state: stateMap[callStatus] || "ended",
      outcome: outcomeMap[callStatus],
      duration: parseInt(callDuration) || 0,
    });

    return new Response("OK", { status: 200 });
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
