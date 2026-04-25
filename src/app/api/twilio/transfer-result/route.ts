import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import twilio from "twilio";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { validateTwilioWebhook } from "@/lib/twilio/webhook-auth";
import { getOrgTwilioClient } from "@/lib/twilio/client";

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * Action callback for the TARGET's <Dial><Conference> in transfer-ring.
 * Fires when the target's leg ends — either because (a) the conference
 * ended cleanly (everyone hung up after a successful transfer), or
 * (b) the target never answered / declined / hung up before joining.
 *
 * For case (b) on a COLD transfer, the caller is sitting alone in the
 * transfer conference with hold music. We need to redirect them back
 * to the source agent so the call doesn't dead-end.
 *
 * For case (b) on a WARM transfer, the source agent is already in the
 * conference with the caller, so we just dismiss the pending transfer
 * record and leave them to keep talking.
 *
 * Returns empty TwiML — this is the TARGET's leg, which ends here.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    const isValid = await validateTwilioWebhook(request, params, convex);
    if (!isValid) return new NextResponse("Forbidden", { status: 403 });

    const transferId = request.nextUrl.searchParams.get("transferId");
    const dialCallStatus = params["DialCallStatus"]; // completed | no-answer | busy | failed | canceled

    const twiml = new VoiceResponse();

    if (!transferId) {
      twiml.hangup();
      return twimlResponse(twiml);
    }

    console.log(`[transfer-result] ${transferId} status: ${dialCallStatus}`);

    // Look up the transfer so we know mode + the source identity to
    // redirect the caller back to.
    const transfer = await convex
      .query(api.pendingTransfers.getById, {
        transferId: transferId as Id<"pendingTransfers">,
      })
      .catch(() => null);

    if (dialCallStatus === "completed") {
      // Target answered and the conference ended (both parties hung up).
      // Nothing more to do.
      twiml.hangup();
      return twimlResponse(twiml);
    }

    // Target didn't answer / declined. Mark the transfer terminal —
    // pendingTransfers.decline handles the DB-side state restore
    // (return to source / parking). Fail-soft: if decline throws
    // because the row is already terminal, ignore it.
    try {
      await convex.mutation(api.pendingTransfers.decline, {
        transferId: transferId as Id<"pendingTransfers">,
      });
    } catch (declineErr) {
      console.warn("[transfer-result] decline mutation:", declineErr);
    }

    // For a COLD transfer the source agent's leg is GONE (their <Dial>
    // bridge broke when we moved the caller into the conference). The
    // caller is sitting alone in the conference with hold music. We
    // need to redirect them back to the source agent so the call
    // doesn't dead-end.
    //
    // For WARM, the source agent is still in the conference with the
    // caller, so leave them be — no redirect needed.
    if (
      transfer?.mode === "cold" &&
      transfer.sourceIdentity &&
      transfer.clerkOrgId &&
      transfer.twilioCallSid
    ) {
      try {
        const { client } = await getOrgTwilioClient(transfer.clerkOrgId);
        const reconnectTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">The agent is unavailable. Reconnecting you.</Say>
  <Dial>
    <Client>${transfer.sourceIdentity}</Client>
  </Dial>
</Response>`;
        await client.calls(transfer.twilioCallSid).update({
          twiml: reconnectTwiml,
        });
        console.log(
          `[transfer-result] cold-decline: redirected caller ${transfer.twilioCallSid} back to ${transfer.sourceIdentity}`,
        );
      } catch (redirectErr) {
        console.error(
          "[transfer-result] failed to redirect caller back to source:",
          redirectErr,
        );
      }
    }

    twiml.hangup();
    return twimlResponse(twiml);
  } catch (error) {
    console.error("[transfer-result] error:", error);
    const twiml = new VoiceResponse();
    twiml.hangup();
    return twimlResponse(twiml);
  }
}

function twimlResponse(twiml: twilio.twiml.VoiceResponse) {
  return new NextResponse(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
