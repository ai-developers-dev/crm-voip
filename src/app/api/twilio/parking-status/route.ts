import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { api } from "../../../../../convex/_generated/api";


/**
 * Handle parking lot conference status callbacks
 *
 * When the parked caller hangs up, Twilio sends a callback here.
 * We use this to clean up the parking lot entry.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const conferenceName = request.nextUrl.searchParams.get("conference");
    const statusCallbackEvent = formData.get("StatusCallbackEvent") as string;
    const conferenceSid = formData.get("ConferenceSid") as string;
    const callSid = formData.get("CallSid") as string;

    console.log(`🅿️ PARKING STATUS CALLBACK:`, {
      event: statusCallbackEvent,
      conference: conferenceName,
      conferenceSid,
      callSid,
    });

    // Handle participant-leave or conference-end events
    if (
      statusCallbackEvent === "participant-leave" ||
      statusCallbackEvent === "conference-end"
    ) {
      if (!conferenceName) {
        console.error("No conference name in callback URL");
        return NextResponse.json({ error: "Missing conference name" }, { status: 400 });
      }

      console.log(`🅿️ Cleaning up parking slot for conference: ${conferenceName}`);

      try {
        await convex.mutation(api.parkingLot.clearByConference, {
          conferenceName,
        });
        console.log(`✅ Parking slot cleared for conference: ${conferenceName}`);
      } catch (convexError) {
        console.error("Failed to clear parking slot:", convexError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Error handling parking status callback:", error);
    return NextResponse.json(
      { error: "Failed to process callback" },
      { status: 500 }
    );
  }
}
