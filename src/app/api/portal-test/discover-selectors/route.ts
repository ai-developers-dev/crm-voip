import { NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import { chromium } from "playwright-core";
import { loginForQuoting, completeQuoting2FA } from "@/lib/portals/natgen-portal";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { Page } from "playwright-core";

export const maxDuration = 300; // 5 minutes

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * POST /api/portal-test/discover-selectors
 *
 * Logs into NatGen, navigates through each screen, and dumps every form field's
 * actual CSS selector (name, id, tag, type). This data is used to verify/update
 * natgen-selectors.ts.
 *
 * Body: { organizationId, carrierId } or { username, password, portalUrl }
 * Optional: { action: "login_only" | "client_search" | "full_discovery" }
 *           { sessionId, twoFaCode } for 2FA step
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action || "full_discovery";

    // Get credentials
    const creds = await resolveCredentials(body);
    if (!creds) {
      return NextResponse.json({ error: "No credentials provided" }, { status: 400 });
    }

    const results: Record<string, any> = {};

    {
      // ── Step 1: Login (single browser, supports 2FA resume) ──
      console.log("[DISCOVER] Step 1: Logging in...");

      let browser: any;
      let page: any;

      // Check if this is a 2FA resume
      if (body.action === "resume_2fa" && body.sessionId && body.code) {
        const resumeResult = await completeQuoting2FA(body.sessionId, body.code);
        if (resumeResult.status !== "logged_in") {
          results.error = resumeResult.message;
          return NextResponse.json(results);
        }
        browser = resumeResult.browser;
        page = resumeResult.page;
        // Continue with discovery using the action from the original request
        console.log("[DISCOVER] 2FA complete, continuing discovery...");
      } else {
        // Fresh login
        const loginResult = await loginForQuoting(creds);

        if (loginResult.status === "needs_2fa") {
          return NextResponse.json({
            status: "needs_2fa",
            sessionId: loginResult.sessionId,
            message: loginResult.message,
          });
        }

        if (loginResult.status === "error") {
          results.error = loginResult.message;
          return NextResponse.json(results);
        }

        browser = loginResult.browser;
        page = loginResult.page;
      }

      results.afterLoginUrl = page.url();

      if (action === "login_only") {
        await browser.close();
        return NextResponse.json(results);
      }

      // Dump complete dashboard state BEFORE interacting
      console.log("[DISCOVER] Post-login page URL:", page.url());
      results.postLoginUrl = page.url();
      results.postLoginPageText = await page.evaluate(() =>
        (document.body as any)?.innerText?.slice(0, 2000) ?? ""
      ).catch(() => "");

      if (action === "dashboard_only") {
        results.dashboardFields = await dumpFormFields(page);
        results.dashboardSelects = await dumpSelectFields(page);
        results.dashboardButtons = await dumpButtons(page);
        await browser.close();
        return NextResponse.json(results);
      }

      // ── Step 2: Dashboard — select state + package + Begin ────
      // NatGen is ASP.NET WebForms — MUST use Playwright's selectOption()
      // to trigger proper postbacks. page.evaluate(sel.value=...) bypasses
      // ASP.NET's event system and causes server errors.
      console.log("[DISCOVER] Step 2: Dashboard — selecting state + package + Begin...");

      // Dump the dashboard first
      results.dashboardUrl = page.url();
      results.dashboardFields = await dumpFormFields(page);
      results.dashboardSelects = await dumpSelectFields(page);
      results.dashboardButtons = await dumpButtons(page);

      // Dashboard — exact IDs from discovery
      // Note: leadData is declared below in the Client Search section
      let stateSelected: string | null = "IL";

      // Use state from request body if available
      const stateToSelect: string = (body.state?.length === 2 ? body.state.toUpperCase() : null) || "IL";
      stateSelected = stateToSelect;

      console.log(`[DISCOVER] Selecting state: ${stateToSelect}`);
      await page.selectOption('#ctl00_MainContent_wgtMainMenuNewQuote_ddlState', stateToSelect).catch(() => {
        console.log("[DISCOVER] State dropdown select failed");
        stateSelected = null;
      });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await delay(2000);

      // Product dropdown — populated after state postback
      const productValue = await page.evaluate(() => {
        const sel = document.querySelector('#ctl00_MainContent_wgtMainMenuNewQuote_ddlProduct') as HTMLSelectElement;
        if (!sel || sel.options.length === 0) return null;
        const c360 = Array.from(sel.options).find((o: any) =>
          o.text?.toLowerCase().includes("custom360") || o.text?.toLowerCase().includes("custom 360")
        );
        if (c360) return c360.value;
        const first = Array.from(sel.options).find((o: any) => o.value && o.value !== "-Select-" && o.value !== "");
        return first?.value ?? null;
      });
      if (productValue) {
        console.log(`[DISCOVER] Selecting product: ${productValue}`);
        await page.selectOption('#ctl00_MainContent_wgtMainMenuNewQuote_ddlProduct', productValue);
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await delay(1000);
      }

      // Begin — <a> tag, use Playwright click
      console.log("[DISCOVER] Clicking Begin...");
      await page.click('#ctl00_MainContent_wgtMainMenuNewQuote_btnContinue').catch(() => {
        console.log("[DISCOVER] Begin button click failed");
      });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await delay(2000);

      // ── Step 3: Client Search ──────────────────────────────────
      console.log("[DISCOVER] Step 3: Client Search...");
      results.clientSearchUrl = page.url();
      results.clientSearchFields = await dumpFormFields(page);

      if (action === "client_search") {
        await browser.close();
        return NextResponse.json(results);
      }

      // Get real contact data for client search (from request body or fallback)
      let leadData = {
        firstName: body.firstName || "Test",
        lastName: body.lastName || "Discovery",
        zip: body.zip || (stateSelected === "IL" ? "62656" : "90210"),
        dob: body.dob || "",
        phone: body.phone || "",
        email: body.email || "",
        street: body.street || "",
        city: body.city || "",
        state: body.state || stateSelected || "IL",
        gender: body.gender || "Male",
        maritalStatus: body.maritalStatus || "Married",
      };

      // If contactId provided, fetch real contact data from Convex
      if (body.contactId && body.organizationId) {
        try {
          const contact = await convex.query(api.contacts.getById, { contactId: body.contactId });
          if (contact) {
            leadData = {
              firstName: contact.firstName || leadData.firstName,
              lastName: contact.lastName || leadData.lastName,
              zip: contact.zipCode || leadData.zip,
              dob: contact.dateOfBirth || leadData.dob,
              phone: contact.phoneNumbers?.[0]?.number || leadData.phone,
              email: contact.email || leadData.email,
              street: contact.streetAddress || leadData.street,
              city: contact.city || leadData.city,
              state: contact.state || leadData.state,
              gender: contact.gender || leadData.gender,
              maritalStatus: contact.maritalStatus || leadData.maritalStatus,
            };
            console.log(`[DISCOVER] Using real contact: ${leadData.firstName} ${leadData.lastName}`);
          }
        } catch (err) {
          console.log("[DISCOVER] Could not fetch contact, using provided data");
        }
      }

      // Fill with exact IDs from discovery
      await page.fill('#MainContent_txtFirstName', leadData.firstName).catch(() => {});
      await page.fill('#MainContent_txtLastName', leadData.lastName).catch(() => {});
      await page.fill('#MainContent_txtZipCode', leadData.zip).catch(() => {});

      await page.click('#MainContent_btnSearch');
      await page.waitForLoadState("networkidle").catch(() => {});
      await delay(2000);

      results.searchResultsUrl = page.url();
      results.searchResultsFields = await dumpFormFields(page);

      // Click "Add New Customer" — exact ID
      const hasAddNew = await page.$('#MainContent_btnAddNewClient');
      results.hasAddNewCustomerButton = !!hasAddNew;

      if (hasAddNew) {
        await page.click('#MainContent_btnAddNewClient');
        await page.waitForLoadState("networkidle").catch(() => {});
        await delay(2000);
      }

      // Check if we landed on an error page
      const currentUrl = page.url();
      if (currentUrl.includes("ErrorPage")) {
        console.log("[DISCOVER] Hit error page, trying to return to home...");
        const returnBtn = await findButton(page, ["Return to Home Screen", "Return Home"]);
        if (returnBtn) {
          await page.click(returnBtn);
          await page.waitForLoadState("networkidle").catch(() => {});
          await delay(2000);
        }
      }

      // ── Step 4: Client Information Form ────────────────────────
      console.log("[DISCOVER] Step 4: Dumping Client Information form...");
      results.clientInfoUrl = page.url();
      results.clientInfoFields = await dumpFormFields(page);
      results.clientInfoSelects = await dumpSelectFields(page);

      // Also get the sidebar navigation links
      const sidebarLinks = await page.$$eval('a', (links: any[]) =>
        links.filter((a: any) => {
          const text = a.textContent?.trim() || "";
          return ["Overview", "Client", "Quote", "Property", "Replacement", "Coverage",
                  "Underwriting", "Loss", "Driver", "Vehicle", "Premium", "Billing", "Final", "Wrap"].some(
            (k) => text.includes(k)
          );
        }).map((a: any) => ({
          text: a.textContent?.trim(),
          href: a.getAttribute("href"),
          id: a.getAttribute("id"),
          className: a.getAttribute("class"),
        }))
      );
      results.sidebarLinks = sidebarLinks;

      // ── Step 5: Navigate ALL sidebar screens ─────────────────────
      console.log("[DISCOVER] Step 5: Navigating all sidebar screens...");

      // Define the sidebar screens we want to visit (auto + home)
      const sidebarScreenNames = [
        "Overview",
        "Client Information",
        "Drivers",
        "Driver Violations",
        "Vehicles",
        "Vehicle Coverages",
        "Auto Underwriting",
        "Premium Summary",
        "Billing",
        "Final Underwriting",
        "Wrap Up",
        // Home quote screens
        "Property Information",
        "Replacement Cost",
        "Coverage",
        "Home Underwriting",
        "Loss History",
      ];

      const screens: Record<string, any> = {};

      // First, record Client Information as the current screen
      screens["clientInformation"] = {
        url: page.url(),
        inputs: results.clientInfoFields,
        selects: results.clientInfoSelects,
        buttons: await dumpButtons(page),
        labels: await dumpVisibleLabels(page),
      };

      // Now navigate each sidebar link
      for (const screenName of sidebarScreenNames) {
        // Skip Client Information since we already have it
        if (screenName === "Client Information") continue;

        // Try to find a matching sidebar link
        const linkSelector = await findSidebarLink(page, screenName);
        if (!linkSelector) {
          console.log(`[DISCOVER] Sidebar link not found: "${screenName}" - skipping`);
          continue;
        }

        console.log(`[DISCOVER] Navigating to: ${screenName}`);
        try {
          await page.click(linkSelector);
          await page.waitForLoadState("networkidle").catch(() => {});
          await delay(2000);

          // Check if we hit an error page
          const screenUrl = page.url();
          if (screenUrl.includes("ErrorPage")) {
            console.log(`[DISCOVER] Error page hit for "${screenName}" — skipping`);
            // Try going back
            await page.goBack().catch(() => {});
            await delay(1000);
            continue;
          }

          // Convert screen name to camelCase key
          const key = screenName
            .split(/\s+/)
            .map((w: string, i: number) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join("");

          screens[key] = {
            url: screenUrl,
            inputs: await dumpFormFields(page),
            selects: await dumpSelectFields(page),
            buttons: await dumpButtons(page),
            labels: await dumpVisibleLabels(page),
          };

          console.log(`[DISCOVER] Dumped ${screenName}: ${screens[key].inputs.length} inputs, ${screens[key].selects.length} selects, ${screens[key].buttons.length} buttons`);
        } catch (navErr: any) {
          console.log(`[DISCOVER] Error navigating to "${screenName}": ${navErr.message}`);
          // Try to recover by going back
          await page.goBack().catch(() => {});
          await delay(1000);
        }
      }

      results.screens = screens;

      // Close browser when done
      await browser.close();
    }

    return NextResponse.json(results);
  } catch (err: any) {
    console.error("[portal-test]", err);
    return NextResponse.json(
      { error: "Portal automation failed", code: "PORTAL_ERROR" },
      { status: 500 }
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

async function resolveCredentials(body: any) {
  if (body.username && body.password) {
    return { username: body.username, password: body.password, portalUrl: body.portalUrl };
  }
  if (body.organizationId && body.carrierId) {
    const carriers = await convex.query(api.tenantCommissions.getCarriersWithCredentials, {
      organizationId: body.organizationId as Id<"organizations">,
    });
    const carrier = carriers.find((c: any) => c.carrierId === body.carrierId);
    if (!carrier) return null;
    return {
      username: decrypt(carrier.portalUsername, body.organizationId),
      password: decrypt(carrier.portalPassword, body.organizationId),
      portalUrl: carrier.portalUrl,
    };
  }
  return null;
}

/** Dump all input, select, and textarea fields on the current page */
async function dumpFormFields(page: Page) {
  return page.$$eval("input, textarea", (elements: any[]) =>
    elements.map((el: any) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") || "text",
      name: el.getAttribute("name"),
      id: el.getAttribute("id"),
      placeholder: el.getAttribute("placeholder"),
      value: el.value?.slice(0, 50),
      className: el.getAttribute("class")?.slice(0, 80),
      visible: el.offsetParent !== null,
      label: el.closest("label")?.textContent?.trim()?.slice(0, 50) ||
             (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()?.slice(0, 50)) || null,
    }))
  );
}

/** Dump all select dropdowns */
async function dumpSelectFields(page: Page) {
  return page.$$eval("select", (elements: any[]) =>
    elements.map((el: any) => ({
      tag: "select",
      name: el.getAttribute("name"),
      id: el.getAttribute("id"),
      className: el.getAttribute("class")?.slice(0, 80),
      visible: el.offsetParent !== null,
      optionCount: el.options?.length || 0,
      selectedValue: el.value,
      options: Array.from(el.options || []).map((o: any) => ({
        value: o.value,
        text: o.textContent?.trim()?.slice(0, 40),
      })),
      label: el.closest("label")?.textContent?.trim()?.slice(0, 50) ||
             (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()?.slice(0, 50)) || null,
    }))
  );
}

/** Find a form field by trying multiple name/id patterns */
async function findField(page: Page, names: string[]): Promise<string | null> {
  for (const name of names) {
    for (const selector of [
      `input[name="${name}"]`,
      `input[id="${name}"]`,
      `input[id*="${name}"]`,
      `input[name*="${name}"]`,
      `textarea[name="${name}"]`,
    ]) {
      const el = await page.$(selector).catch(() => null);
      if (el) return selector;
    }
  }
  return null;
}

/** Find a button/submit by text content */
async function findButton(page: Page, texts: string[]): Promise<string | null> {
  for (const text of texts) {
    for (const selector of [
      `button:has-text("${text}")`,
      `input[type="submit"][value="${text}"]`,
      `input[type="button"][value="${text}"]`,
      `a:has-text("${text}")`,
    ]) {
      const el = await page.$(selector).catch(() => null);
      if (el) return selector;
    }
  }
  return null;
}

/** Dump all buttons, submit inputs, and anchor links */
async function dumpButtons(page: Page) {
  return page.$$eval("button, input[type='submit'], input[type='button'], a", (elements: any[]) =>
    elements
      .filter((el: any) => el.offsetParent !== null) // visible only
      .map((el: any) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || null,
        text: el.textContent?.trim()?.slice(0, 80) || null,
        value: el.getAttribute("value")?.slice(0, 80) || null,
        id: el.getAttribute("id"),
        name: el.getAttribute("name"),
        href: el.getAttribute("href"),
        className: el.getAttribute("class")?.slice(0, 80),
      }))
  );
}

/** Dump all visible labels on the page */
async function dumpVisibleLabels(page: Page) {
  return page.$$eval("label, .label, span, td", (elements: any[]) =>
    elements
      .filter((el: any) => {
        if (el.offsetParent === null) return false;
        const text = el.textContent?.trim();
        // Only include short text that looks like a label (not huge blocks)
        return text && text.length > 0 && text.length < 100 && !text.includes("\n");
      })
      .map((el: any) => el.textContent?.trim())
      .filter((text: string, i: number, arr: string[]) => arr.indexOf(text) === i) // dedupe
      .slice(0, 200) // cap at 200 labels to avoid huge payloads
  );
}

/** Find a sidebar link by screen name */
async function findSidebarLink(page: Page, screenName: string): Promise<string | null> {
  // Try exact text match first, then partial
  for (const selector of [
    `a:has-text("${screenName}")`,
    `a:text-is("${screenName}")`,
  ]) {
    const el = await page.$(selector).catch(() => null);
    if (el) return selector;
  }
  // Try partial match with first word
  const firstWord = screenName.split(" ")[0];
  if (firstWord.length > 3) {
    const selector = `a:has-text("${firstWord}")`;
    const el = await page.$(selector).catch(() => null);
    if (el) return selector;
  }
  return null;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
