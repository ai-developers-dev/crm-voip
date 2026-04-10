import { NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { loginForQuoting } from "@/lib/portals/natgen-portal";
import { api } from "../../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import type { Id } from "../../../../../convex/_generated/dataModel";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { organizationId, quoteNumber, carrierId } = await req.json();
  if (!organizationId || !quoteNumber) {
    return NextResponse.json({ error: "Missing organizationId or quoteNumber" }, { status: 400 });
  }

  try {
    // Get carrier credentials
    const configuredCarriers = await convex.query(
      api.tenantCommissions.getCarriersWithCredentials,
      { organizationId: organizationId as Id<"organizations"> }
    );

    const carrier = carrierId
      ? configuredCarriers.find((c: any) => c.carrierId === carrierId)
      : configuredCarriers[0];

    if (!carrier) {
      return NextResponse.json({ error: "No carrier credentials found" }, { status: 400 });
    }

    const creds = {
      username: decrypt(carrier.portalUsername, organizationId),
      password: decrypt(carrier.portalPassword, organizationId),
      portalUrl: carrier.portalUrl || undefined,
    };

    // Login with VISIBLE browser so user can see the quote
    const loginResult = await loginForQuoting(creds, undefined, convex, { visible: true });
    if (loginResult.status !== "logged_in") {
      return NextResponse.json({ error: "Login failed: " + (loginResult as any).message }, { status: 400 });
    }

    const { page } = loginResult;

    // Navigate to main menu and search for the quote
    const portalUrl = creds.portalUrl?.trim() || "https://natgenagency.com";
    await page.goto(portalUrl + "/MainMenu.aspx", { waitUntil: "load", timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await delay(2000);

    // Fill the "Search Quotes" field with the quote number
    const searched = await page.evaluate((qNum: string) => {
      // Find the Search Quotes input
      const searchInput = document.getElementById("ctl00_MainContent_wgtMainMenuSearchQuotes_txtSearchString") as HTMLInputElement;
      if (searchInput) {
        searchInput.value = qNum;
        return "filled";
      }
      return "not_found";
    }, quoteNumber).catch(() => "error");

    if (searched === "filled") {
      // Click the Search button
      await page.evaluate(() => {
        const doPostBack = (window as any).__doPostBack;
        if (doPostBack) {
          doPostBack("ctl00$MainContent$wgtMainMenuSearchQuotes$btnSearchQuote", "");
        }
      }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await delay(2000);

      // Click on the quote result to open it
      await page.evaluate((qNum: string) => {
        // Look for a link or row containing the quote number
        const allLinks = Array.from(document.querySelectorAll("a, tr, td"));
        const match = allLinks.find(el => el.textContent?.includes(qNum)) as HTMLElement;
        if (match?.tagName === "A") {
          match.click();
        } else if (match) {
          const link = match.querySelector("a") || match.closest("tr")?.querySelector("a");
          if (link) (link as HTMLElement).click();
        }
      }, quoteNumber).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await delay(1000);
    }

    // Auto-close browser after 5 minutes so it doesn't pile up in the dock
    const { browser } = loginResult;
    setTimeout(() => {
      browser?.close().catch(() => {});
    }, 5 * 60 * 1000);

    return NextResponse.json({
      status: "opened",
      message: `Opened quote ${quoteNumber} in NatGen portal`,
      url: page.url(),
    });
  } catch (err: any) {
    console.error("[portal-test]", err);
    return NextResponse.json(
      { error: "Portal automation failed", code: "PORTAL_ERROR" },
      { status: 500 }
    );
  }
}
