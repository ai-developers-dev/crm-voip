/**
 * National General Agency portal driver (natgenagency.com)
 *
 * Flow: login → start auto quote → fill name/DOB/address →
 *   NatGen auto-populates vehicles via DMV lookup → confirm vehicles →
 *   select standard coverages → get quote result.
 *
 * Uses playwright-core (already installed) — no Puppeteer needed.
 */

import { chromium } from "playwright-core";

export interface PortalCredentials {
  username: string;
  password: string;
  /** Override the hardcoded portal URL (e.g. https://natgenagency.com/Account/Login.aspx) */
  portalUrl?: string;
}

export interface InsuranceLeadData {
  firstName: string;
  lastName: string;
  dob: string;           // "YYYY-MM-DD"
  gender?: string;
  maritalStatus?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  // Property (home quotes only)
  property?: {
    yearBuilt?: number;
    sqft?: number;
    constructionType?: string;
    ownershipType?: string;
  };
}

export interface QuoteResult {
  success: boolean;
  quoteId?: string;
  carrier?: string;
  monthlyPremium?: number;
  annualPremium?: number;
  coverageDetails?: Record<string, any>;
  error?: string;
}

// Standard coverage defaults
const STANDARD_COVERAGES = {
  bodilyInjury: "100/300",
  propertyDamage: "100",
  uninsuredMotorist: "100/300",
  comprehensiveDeductible: "500",
  collisionDeductible: "500",
};

const PORTAL_URL = "https://natgenagency.com";
const LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Launch a browser — uses Browserless.io if API key is set, otherwise local Chrome. */
async function launchBrowser() {
  const browserlessKey = process.env.BROWSERLESS_API_KEY;
  if (browserlessKey) {
    const browser = await chromium.connectOverCDP(
      `wss://chrome.browserless.io?token=${browserlessKey}&stealth`,
      { timeout: 60_000 }
    );
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    return { browser, context, page };
  }

  // Local fallback — uses system Chrome/Chromium
  const browser = await chromium.launch({
    headless: true,
    args: LAUNCH_ARGS,
    channel: "chrome",   // use system Chrome if available
  });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { browser, context, page };
}

// ── Login Test (interactive — holds browser open for 2FA) ──────────────

interface PortalTestSession {
  browser: any;
  page: any;
  createdAt: number;
}

// Module-level session store for in-progress login tests
const TEST_SESSIONS = new Map<string, PortalTestSession>();
const SESSION_TTL = 3 * 60 * 1000; // 3 minutes

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [id, s] of TEST_SESSIONS.entries()) {
    if (now - s.createdAt > SESSION_TTL) {
      s.browser.close().catch(() => {});
      TEST_SESSIONS.delete(id);
    }
  }
}

export async function startLoginTest(creds: PortalCredentials): Promise<
  | { status: "logged_in"; message: string }
  | { status: "needs_2fa"; sessionId: string; message: string }
  | { status: "error"; message: string }
> {
  pruneExpiredSessions();
  const { browser, page } = await launchBrowser();
  const sessionId = crypto.randomUUID();

  const portalUrl = creds.portalUrl?.trim() || PORTAL_URL;
  try {
    // Step 1: Navigate to portal
    let gotoError: string | null = null;
    try {
      await page.goto(portalUrl, { waitUntil: "load", timeout: 45000 });
    } catch (e: any) {
      gotoError = e.message;
    }

    const landedUrl = page.url();
    const pageTitle = await page.title().catch(() => "(no title)");

    if (gotoError) {
      await browser.close();
      return { status: "error", message: `❌ Page load failed for ${portalUrl}\nError: ${gotoError}\nLanded on: ${landedUrl}` };
    }

    // Step 2: Wait for a visible (non-hidden) input
    let visibleInputFound = false;
    try {
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll("input")).some(
          (i: any) => i.type !== "hidden" && i.offsetParent !== null
        ),
        undefined,
        { timeout: 20000 }
      );
      visibleInputFound = true;
    } catch {
      visibleInputFound = false;
    }
    await delay(1000);

    // Collect diagnostic info regardless of outcome
    const diagnostics = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input")).map((i: any) => ({
        type: i.type, name: i.name, id: i.id,
        visible: i.type !== "hidden" && i.offsetParent !== null,
      }));
      const bodyText = (document.body as any)?.innerText?.slice(0, 300) ?? "";
      const title = document.title;
      return { inputs, bodyText, title };
    });

    if (!visibleInputFound) {
      await browser.close();
      return {
        status: "error",
        message: [
          `⚠️ Page loaded but no visible login form found.`,
          `URL: ${landedUrl}`,
          `Title: "${diagnostics.title}"`,
          `Inputs on page (${diagnostics.inputs.length}): ${JSON.stringify(diagnostics.inputs)}`,
          `Page text preview: ${diagnostics.bodyText}`,
        ].join("\n"),
      };
    }

    // NatGen uses a TWO-STEP login: User ID first → SIGN IN → then password page
    // Step A: Fill User ID (field name is "txtUserID")
    const usernameField = await findInput(page, [
      'input[name="txtUserID"]', 'input[id="txtUserID"]',
      // fallbacks
      'input[name="username"]', 'input[id="username"]',
      'input[id$="UserName"]', 'input[id$="UserID"]', 'input[name$="UserID"]',
      'input[type="text"]:not([type="hidden"])',
    ]);

    if (!usernameField) {
      await browser.close();
      return {
        status: "error",
        message: [
          `⚠️ Page loaded (${diagnostics.title}) but User ID field not found.`,
          `URL: ${landedUrl}`,
          `All inputs: ${JSON.stringify(diagnostics.inputs)}`,
        ].join("\n"),
      };
    }

    await usernameField.fill(creds.username);
    await delay(300);

    // Click "SIGN IN" button to advance to the password step
    const clickedSignIn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a'));
      const btn = btns.find((b: any) =>
        b.textContent?.trim().toLowerCase() === "sign in" ||
        b.value?.toLowerCase().includes("sign in") ||
        b.id?.toLowerCase().includes("signin") ||
        b.id?.toLowerCase().includes("login") ||
        b.textContent?.toLowerCase().includes("sign in") ||
        b.textContent?.toLowerCase().includes("log in")
      ) as HTMLElement | undefined;
      if (btn) { btn.click(); return btn.id || btn.textContent || "found"; }
      return null;
    });
    if (!clickedSignIn) await page.keyboard.press("Enter");

    // Wait for the password step to load
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await delay(1500);

    // Step B: Now look for the password field
    const passwordField = await findInput(page, [
      'input[name="txtPassword"]', 'input[id="txtPassword"]',
      'input[type="password"]',
      'input[name="password"]', 'input[id="password"]',
      'input[id$="Password"]', 'input[name$="Password"]',
      'input[placeholder*="password" i]',
    ]);

    if (!passwordField) {
      // Collect new diagnostics after the step-1 submit
      const diag2 = await page.evaluate(() => ({
        inputs: Array.from(document.querySelectorAll("input")).map((i: any) => ({
          type: i.type, name: i.name, id: i.id, visible: i.type !== "hidden" && i.offsetParent !== null,
        })),
        bodyText: (document.body as any)?.innerText?.slice(0, 400) ?? "",
        url: location.href,
      }));
      await browser.close();
      return {
        status: "error",
        message: [
          `⚠️ User ID submitted but password field not found on next page.`,
          `URL: ${diag2.url}`,
          `Inputs: ${JSON.stringify(diag2.inputs)}`,
          `Page text: ${diag2.bodyText}`,
        ].join("\n"),
      };
    }

    await passwordField.fill(creds.password);
    await delay(300);

    // Submit password
    const clickedSubmit = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
      const btn = btns.find((b: any) =>
        b.textContent?.trim().toLowerCase() === "sign in" ||
        b.textContent?.toLowerCase().includes("sign in") ||
        b.textContent?.toLowerCase().includes("log in") ||
        b.textContent?.toLowerCase().includes("submit") ||
        b.value?.toLowerCase().includes("sign in") ||
        b.value?.toLowerCase().includes("submit")
      ) as HTMLElement | undefined;
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clickedSubmit) await page.keyboard.press("Enter");

    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await delay(1000);

    // Grab the actual page text (original case for display, lowercase for matching)
    const pageTextRaw = await page.evaluate(() => (document.body as any)?.innerText?.trim() ?? "");
    const pageText = pageTextRaw.toLowerCase();
    const currentUrl2 = page.url();

    // Check for 2FA prompt
    const needs2fa =
      pageText.includes("verification code") ||
      pageText.includes("two-factor") ||
      pageText.includes("2-factor") ||
      pageText.includes("one-time") ||
      pageText.includes("authenticat") ||
      pageText.includes("security code") ||
      pageText.includes("otp") ||
      pageText.includes("enter code") ||
      pageText.includes("sent a code") ||
      pageText.includes("text message") ||
      pageText.includes("passcode");

    if (needs2fa) {
      // NatGen shows a method-selection page first.
      // Auto-click "Get a text message with a verification code" button.
      const clickedTextMsg = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a, label'));
        const btn = all.find((b: any) => {
          const t = (b.textContent || b.value || "").toLowerCase();
          return t.includes("text message") || t.includes("sms") || t.includes("phone");
        }) as HTMLElement | undefined;
        if (btn) { btn.click(); return (btn as any).textContent?.trim() || "clicked"; }
        return null;
      });

      if (clickedTextMsg) {
        // Wait for the code input page to load
        await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
        await delay(1500);
      }

      TEST_SESSIONS.set(sessionId, { browser, page, createdAt: Date.now() });
      return {
        status: "needs_2fa",
        sessionId,
        message: clickedTextMsg
          ? "NatGen is sending a verification code to your phone (***) ***-**00. Check your texts and enter the code below."
          : `NatGen requires verification — choose your method on the portal:\n\n${pageTextRaw.slice(0, 300)}\n\nEnter the code below once you receive it.`,
      };
    }

    // Check for login failure
    const currentUrl = page.url();
    const loginFailed =
      currentUrl.includes("login") ||
      currentUrl.includes("signin") ||
      pageText.includes("invalid") ||
      pageText.includes("incorrect") ||
      pageText.includes("wrong password") ||
      pageText.includes("failed");

    if (loginFailed) {
      const errEl = await page.evaluate(() => {
        const el = document.querySelector('.error, .alert-danger, [class*="error"], [class*="invalid"]');
        return el?.textContent?.trim() ?? null;
      });
      await browser.close();
      return { status: "error", message: errEl ?? "Login failed — check username and password" };
    }

    // Success — logged in without 2FA
    await browser.close();
    return { status: "logged_in", message: "Login successful! Your NatGen credentials are working." };

  } catch (err: any) {
    await browser.close().catch(() => {});
    return { status: "error", message: err.message ?? "Login test failed" };
  }
}

export async function submitLoginTest2FA(sessionId: string, code: string): Promise<
  | { status: "logged_in"; message: string }
  | { status: "error"; message: string }
> {
  const session = TEST_SESSIONS.get(sessionId);
  if (!session) {
    return { status: "error", message: "Session expired. Please try the login test again." };
  }

  const { browser, page } = session;
  TEST_SESSIONS.delete(sessionId);

  try {
    // Find the OTP / code input field
    const codeField = await findInput(page, [
      'input[name="code"]', 'input[id="code"]',
      'input[name="otp"]', 'input[id="otp"]',
      'input[name="token"]', 'input[type="tel"]',
      'input[autocomplete="one-time-code"]',
      'input[placeholder*="code" i]', 'input[placeholder*="digit" i]',
      'input[type="number"]', 'input[type="text"]:not([type="hidden"])',
    ]);

    if (!codeField) {
      await browser.close();
      return { status: "error", message: "Could not find the 2FA code input field on the page." };
    }

    await codeField.fill(code.trim());
    await delay(200);

    // Submit the code
    let submitClicked = false;
    try {
      submitClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        const btn = btns.find((b: any) =>
          b.textContent?.toLowerCase().includes("verify") ||
          b.textContent?.toLowerCase().includes("confirm") ||
          b.textContent?.toLowerCase().includes("submit") ||
          b.textContent?.toLowerCase().includes("continue") ||
          b.value?.toLowerCase().includes("verify")
        ) as HTMLElement | undefined;
        if (btn) { btn.click(); return true; }
        return false;
      });
    } catch { /* context may already be navigating */ }
    if (!submitClicked) await page.keyboard.press("Enter").catch(() => {});

    // Wait for navigation — "Execution context was destroyed" means a page navigation
    // happened, which is what we expect on successful 2FA.
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await delay(1000);

    let currentUrl = "";
    let pageText = "";
    try {
      currentUrl = page.url();
      pageText = await page.evaluate(() => (document.body as any).innerText.toLowerCase());
    } catch (evalErr: any) {
      // "Execution context was destroyed" = navigation occurred = success
      if (evalErr?.message?.includes("context") || evalErr?.message?.includes("navigation")) {
        await browser.close().catch(() => {});
        return { status: "logged_in", message: "Login successful! Your NatGen credentials are working." };
      }
      throw evalErr;
    }

    const failed =
      pageText.includes("invalid code") ||
      pageText.includes("incorrect code") ||
      pageText.includes("wrong code") ||
      pageText.includes("expired") ||
      currentUrl.includes("login");

    await browser.close().catch(() => {});

    if (failed) {
      return { status: "error", message: "Invalid or expired verification code." };
    }
    return { status: "logged_in", message: "Login successful! Your NatGen credentials are working." };

  } catch (err: any) {
    await browser.close().catch(() => {});
    // Navigation after successful 2FA can cause context errors — treat as success
    if (err?.message?.includes("context was destroyed") || err?.message?.includes("navigation")) {
      return { status: "logged_in", message: "Login successful! Your NatGen credentials are working." };
    }
    return { status: "error", message: err.message ?? "2FA verification failed" };
  }
}

export function cleanupLoginTestSession(sessionId: string) {
  const session = TEST_SESSIONS.get(sessionId);
  if (session) {
    session.browser.close().catch(() => {});
    TEST_SESSIONS.delete(sessionId);
  }
}

// ── Login ─────────────────────────────────────────────────────────────

async function login(page: any, creds: PortalCredentials): Promise<void> {
  const portalUrl = creds.portalUrl?.trim() || PORTAL_URL;
  await page.goto(portalUrl, { waitUntil: "load", timeout: 45000 });

  // Wait for the User ID field to appear
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("input")).some(
      (i: any) => i.type !== "hidden" && i.offsetParent !== null
    ),
    undefined,
    { timeout: 20000 }
  ).catch(() => {});
  await delay(1000);

  // Step 1: Fill User ID (NatGen uses "txtUserID")
  const usernameField = await findInput(page, [
    'input[name="txtUserID"]', 'input[id="txtUserID"]',
    'input[name="username"]', 'input[id="username"]',
    'input[id$="UserID"]', 'input[name$="UserID"]',
    'input[id$="UserName"]', 'input[id$="Username"]',
    'input[type="text"]:not([type="hidden"])',
  ]);

  if (!usernameField) {
    const found = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input")).map((i: any) => ({ type: i.type, name: i.name, id: i.id }))
    );
    throw new Error(`Could not find User ID field. Inputs: ${JSON.stringify(found).slice(0, 300)}`);
  }

  await usernameField.fill(creds.username);
  await delay(300);

  // Click "SIGN IN" to go to the password step
  const clickedSignIn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
    const btn = btns.find((b: any) =>
      b.textContent?.trim().toLowerCase() === "sign in" ||
      b.textContent?.toLowerCase().includes("sign in") ||
      b.value?.toLowerCase().includes("sign in")
    ) as HTMLElement | undefined;
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!clickedSignIn) await page.keyboard.press("Enter");

  // Wait for navigation to the password page — same approach as startLoginTest()
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await delay(1500);

  // Step 2: Fill password
  const passwordField = await findInput(page, [
    'input[name="txtPassword"]', 'input[id="txtPassword"]',
    'input[type="password"]',
    'input[id$="Password"]', 'input[name$="Password"]',
    'input[placeholder*="password" i]',
  ]);

  if (!passwordField) {
    // Collect full diagnostics so we can see what NatGen is showing
    const diag = await page.evaluate(() => ({
      url: location.href,
      inputs: Array.from(document.querySelectorAll("input")).map((i: any) => ({
        type: i.type, name: i.name, id: i.id,
        visible: i.type !== "hidden" && i.offsetParent !== null,
      })),
      bodyText: (document.body as any)?.innerText?.slice(0, 600) ?? "",
    }));

    // Check if we're already on a 2FA page (some sessions skip straight to MFA)
    const bodyLower = diag.bodyText.toLowerCase();
    const on2faPage =
      bodyLower.includes("verification code") || bodyLower.includes("two-factor") ||
      bodyLower.includes("text message") || bodyLower.includes("multi-factor") ||
      bodyLower.includes("security code") || bodyLower.includes("authenticat");
    if (on2faPage) {
      // Auto-click "text message" method if present, then surface a clear error
      await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a, label'));
        const btn = all.find((b: any) => {
          const t = ((b as any).textContent || (b as any).value || "").toLowerCase();
          return t.includes("text message") || t.includes("sms");
        }) as HTMLElement | undefined;
        btn?.click();
      }).catch(() => {});
      throw new Error("NatGen requires 2FA verification. Please use the Test Login button in Settings → Insurance Portals to complete the 2FA step first, then retry quoting.");
    }

    throw new Error(
      `User ID accepted but password field not found.\n` +
      `URL: ${diag.url}\n` +
      `Inputs: ${JSON.stringify(diag.inputs)}\n` +
      `Page text: ${diag.bodyText}`
    );
  }

  await passwordField.fill(creds.password);
  await delay(300);

  // Submit password
  const clickedSubmit = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
    const btn = btns.find((b: any) =>
      b.textContent?.toLowerCase().includes("sign in") ||
      b.textContent?.toLowerCase().includes("log in") ||
      b.textContent?.toLowerCase().includes("submit") ||
      b.value?.toLowerCase().includes("sign in") ||
      b.value?.toLowerCase().includes("submit")
    ) as HTMLElement | undefined;
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!clickedSubmit) await page.keyboard.press("Enter");

  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await delay(1000);

  const postUrl = page.url();
  const postText = await page.evaluate(() => (document.body as any)?.innerText?.toLowerCase() ?? "");

  // If a 2FA method-selection page appears, click "text message" automatically
  if (postText.includes("multi-factor") || postText.includes("text message") || postText.includes("verification")) {
    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a, label'));
      const btn = all.find((b: any) => {
        const t = (b.textContent || (b as any).value || "").toLowerCase();
        return t.includes("text message") || t.includes("sms") || t.includes("phone");
      }) as HTMLElement | undefined;
      btn?.click();
    });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await delay(1500);
    // The quoting agent can't handle 2FA interactively — throw a descriptive error
    throw new Error("NatGen requires 2FA verification. Please use the Test Login button in Settings → Insurance Portals to complete the 2FA step first, then retry quoting.");
  }

  if (postUrl.toLowerCase().includes("login") || postText.includes("invalid") || postText.includes("incorrect")) {
    const errorText = await page.evaluate(() => {
      const el = document.querySelector('.error, .alert, [class*="error"], [class*="invalid"]');
      return el?.textContent?.trim() ?? null;
    });
    throw new Error(`Portal login failed — ${errorText ?? "check username/password"}`);
  }
}

/** Try each selector in order, return the first element found. */
async function findInput(page: any, selectors: string[]): Promise<any | null> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        // Verify it's actually visible
        const visible = await el.isVisible().catch(() => false);
        if (visible) return el;
      }
    } catch { /* try next */ }
  }
  return null;
}

// ── Auto Quote ───────────────────────────────────────────────────────
// NatGen fetches vehicles automatically via DMV lookup after applicant info.
// We just need to: fill applicant → confirm vehicles → select coverages → get quote.

export async function runNatGenAutoQuote(
  creds: PortalCredentials,
  lead: InsuranceLeadData
): Promise<QuoteResult> {
  const { browser, page } = await launchBrowser();

  try {
    // Step 1: Login
    await login(page, creds);
    await delay(1500);

    // Step 2: Start a new auto quote
    const startedFromNav = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a, button"));
      const link = links.find((l: any) =>
        l.textContent?.toLowerCase().includes("new quote") ||
        l.textContent?.toLowerCase().includes("start quote") ||
        l.textContent?.toLowerCase().includes("get quote") ||
        l.textContent?.toLowerCase().includes("quick quote")
      ) as HTMLElement | undefined;
      if (link) { link.click(); return true; }
      return false;
    });

    if (!startedFromNav) {
      await page.goto(`${PORTAL_URL}/quote/auto`, { waitUntil: "networkidle", timeout: 15000 });
    } else {
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    }
    await delay(800);

    // Step 3: If prompted to choose quote type, select Auto/Vehicle
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("a, button, label, div[role='button'], input[type='radio']"));
      const autoItem = items.find((el: any) =>
        el.textContent?.toLowerCase().includes("auto") ||
        el.textContent?.toLowerCase().includes("vehicle") ||
        el.value?.toLowerCase().includes("auto")
      ) as HTMLElement | undefined;
      autoItem?.click();
    });
    await delay(500);

    // Step 4: Fill applicant info — name, DOB, address
    // NatGen will use this to pull driving history and vehicles from DMV.
    await fillFieldByLabelOrName(page, ["first name", "firstname", "first_name", "fname"], lead.firstName);
    await fillFieldByLabelOrName(page, ["last name", "lastname", "last_name", "lname"], lead.lastName);
    await fillFieldByLabelOrName(page, ["date of birth", "dob", "birthdate", "birth_date", "birth date"], formatDob(lead.dob));
    await fillFieldByLabelOrName(page, ["address", "street", "street address", "addr1", "address1"], lead.street);
    await fillFieldByLabelOrName(page, ["city"], lead.city);
    await fillFieldByLabelOrName(page, ["zip", "postal", "zipcode", "zip code"], lead.zip);

    // State — try select first, then text input
    await selectByLabelOrName(page, ["state"], lead.state);
    await fillFieldByLabelOrName(page, ["state"], lead.state);

    if (lead.maritalStatus) {
      await selectByLabelOrName(page, ["marital", "marital status"], lead.maritalStatus);
    }
    if (lead.gender) {
      await selectByLabelOrName(page, ["gender", "sex"], lead.gender);
    }

    // Click Next to proceed — NatGen will look up vehicles
    await clickNextOrContinue(page);
    await delay(2000); // Wait for DMV lookup

    // Step 5: Vehicle confirmation — NatGen has auto-populated vehicles.
    // Just click through to accept them.
    await clickNextOrContinue(page);
    await delay(1500);

    // Step 6: Click through any driver/history pages
    // (NatGen pulls violations/accidents automatically — just accept defaults)
    for (let i = 0; i < 3; i++) {
      const hasNext = await clickNextOrContinue(page);
      if (!hasNext) break;
      await delay(1200);

      // Stop if we've reached the coverage selection page
      const onCoveragePage = await page.evaluate(() => {
        const text = (document.body as any).innerText.toLowerCase();
        return (
          text.includes("coverage") ||
          text.includes("deductible") ||
          text.includes("bodily injury") ||
          text.includes("liability")
        );
      });
      if (onCoveragePage) break;
    }

    await delay(1000);

    // Step 7: Select standard coverages
    await selectStandardCoverages(page);
    await delay(800);

    // Step 8: Submit for quote
    await clickNextOrContinue(page);

    // Wait for premium results to appear
    try {
      await page.waitForFunction(
        () => {
          const text = (document.body as any).innerText.toLowerCase();
          return (
            text.includes("premium") ||
            text.includes("per month") ||
            text.includes("quote number") ||
            text.includes("your quote") ||
            text.includes("estimated rate") ||
            text.includes("/mo") ||
            text.includes("/yr")
          );
        },
        undefined,
        { timeout: 45000 }
      );
    } catch {
      // Try one more Next click in case there was an intermediate page
      await clickNextOrContinue(page);
      await delay(3000);
    }

    await delay(1000);

    // Step 9: Scrape results
    const result = await page.evaluate(() => {
      const body = (document.body as any).innerText;

      // Quote number
      const quoteMatch = body.match(/quote\s*(#|number|no\.?)\s*:?\s*([A-Z0-9\-]+)/i);
      const quoteId = quoteMatch?.[2] ?? null;

      // Monthly premium
      const monthlyMatch = body.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:\/\s*mo|per\s*month|monthly)/i);
      const monthly = monthlyMatch ? parseFloat(monthlyMatch[1].replace(/,/g, "")) : null;

      // Annual premium
      const annualMatch = body.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:\/\s*yr|per\s*year|annual|annually)/i);
      const annual = annualMatch ? parseFloat(annualMatch[1].replace(/,/g, "")) : null;

      // Coverage details from page
      const coverageLines: string[] = [];
      const lines = body.split("\n");
      for (const line of lines) {
        const l = line.toLowerCase();
        if (
          l.includes("bodily") || l.includes("property damage") ||
          l.includes("uninsured") || l.includes("comprehensive") ||
          l.includes("collision") || l.includes("deductible")
        ) {
          if (line.trim().length > 5 && line.trim().length < 150) {
            coverageLines.push(line.trim());
          }
        }
      }

      return { quoteId, monthly, annual, coverageLines, fullText: body.slice(0, 2000) };
    });

    if (!result.monthly && !result.annual) {
      return {
        success: false,
        error: `Quote page reached but no premium found. Content: ${result.fullText.slice(0, 400)}`,
      };
    }

    return {
      success: true,
      carrier: "National General",
      quoteId: result.quoteId ?? undefined,
      monthlyPremium: result.monthly ?? undefined,
      annualPremium: result.annual ?? (result.monthly ? Math.round(result.monthly * 12) : undefined),
      coverageDetails: {
        coverages: result.coverageLines,
        rawText: result.fullText.slice(0, 1000),
      },
    };

  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  } finally {
    await browser.close();
  }
}

// ── Home Quote ───────────────────────────────────────────────────────

export async function runNatGenHomeQuote(
  creds: PortalCredentials,
  lead: InsuranceLeadData
): Promise<QuoteResult> {
  const { browser, page } = await launchBrowser();

  try {
    await login(page, creds);
    await delay(1500);

    const startedFromNav = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a, button"));
      const link = links.find((l: any) =>
        l.textContent?.toLowerCase().includes("new quote") ||
        l.textContent?.toLowerCase().includes("start quote")
      ) as HTMLElement | undefined;
      if (link) { link.click(); return true; }
      return false;
    });

    if (!startedFromNav) {
      await page.goto(`${PORTAL_URL}/quote/home`, { waitUntil: "networkidle", timeout: 15000 });
    } else {
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    }
    await delay(800);

    // Select homeowners
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("a, button, label, div[role='button']"));
      const homeItem = items.find((el: any) =>
        el.textContent?.toLowerCase().includes("home") ||
        el.textContent?.toLowerCase().includes("homeowner") ||
        el.textContent?.toLowerCase().includes("dwelling")
      ) as HTMLElement | undefined;
      homeItem?.click();
    });
    await delay(500);

    // Fill property address + applicant info
    await fillFieldByLabelOrName(page, ["address", "street", "property address", "addr1"], lead.street);
    await fillFieldByLabelOrName(page, ["city"], lead.city);
    await fillFieldByLabelOrName(page, ["zip", "postal", "zipcode"], lead.zip);
    await selectByLabelOrName(page, ["state"], lead.state);
    await fillFieldByLabelOrName(page, ["state"], lead.state);

    if (lead.property?.yearBuilt) {
      await fillFieldByLabelOrName(page, ["year built", "yearbuilt", "year_built"], String(lead.property.yearBuilt));
    }
    if (lead.property?.sqft) {
      await fillFieldByLabelOrName(page, ["square feet", "sqft", "sq ft", "living area"], String(lead.property.sqft));
    }

    await fillFieldByLabelOrName(page, ["first name", "firstname", "fname"], lead.firstName);
    await fillFieldByLabelOrName(page, ["last name", "lastname", "lname"], lead.lastName);
    await fillFieldByLabelOrName(page, ["date of birth", "dob", "birthdate"], formatDob(lead.dob));

    await clickNextOrContinue(page);
    await delay(1500);

    // Click through intermediate pages
    for (let i = 0; i < 2; i++) {
      await clickNextOrContinue(page);
      await delay(1200);
    }

    // Wait for results
    try {
      await page.waitForFunction(
        () => {
          const text = (document.body as any).innerText.toLowerCase();
          return text.includes("premium") || text.includes("per month") || text.includes("quote number");
        },
        undefined,
        { timeout: 45000 }
      );
    } catch { /* try anyway */ }

    await delay(1000);

    const result = await page.evaluate(() => {
      const body = (document.body as any).innerText;
      const quoteMatch = body.match(/quote\s*(#|number|no\.?)\s*:?\s*([A-Z0-9\-]+)/i);
      const monthlyMatch = body.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:\/\s*mo|per\s*month|monthly)/i);
      const annualMatch = body.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:\/\s*yr|per\s*year|annual|annually)/i);
      return {
        quoteId: quoteMatch?.[2] ?? null,
        monthly: monthlyMatch ? parseFloat(monthlyMatch[1].replace(/,/g, "")) : null,
        annual: annualMatch ? parseFloat(annualMatch[1].replace(/,/g, "")) : null,
        fullText: body.slice(0, 2000),
      };
    });

    if (!result.monthly && !result.annual) {
      return {
        success: false,
        error: `No premium found. Content: ${result.fullText.slice(0, 400)}`,
      };
    }

    return {
      success: true,
      carrier: "National General",
      quoteId: result.quoteId ?? undefined,
      monthlyPremium: result.monthly ?? undefined,
      annualPremium: result.annual ?? (result.monthly ? Math.round(result.monthly * 12) : undefined),
      coverageDetails: { rawText: result.fullText.slice(0, 1000) },
    };

  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  } finally {
    await browser.close();
  }
}

// ── Coverage Selection ─────────────────────────────────────────────

async function selectStandardCoverages(page: any): Promise<void> {
  const coverageMap: Array<[string[], string]> = [
    [["bodily injury", "bi limit", "bi_limit", "bodilyinjury"], STANDARD_COVERAGES.bodilyInjury],
    [["property damage", "pd limit", "pd_limit", "propertydamage"], STANDARD_COVERAGES.propertyDamage],
    [["uninsured", "um limit", "um_limit", "uninsuredmotorist"], STANDARD_COVERAGES.uninsuredMotorist],
    [["comprehensive deductible", "comp deductible", "comp_ded", "comprehensiveded"], STANDARD_COVERAGES.comprehensiveDeductible],
    [["collision deductible", "coll deductible", "coll_ded", "collisionded"], STANDARD_COVERAGES.collisionDeductible],
  ];

  for (const [keywords, value] of coverageMap) {
    await selectByLabelOrName(page, keywords, value).catch(() => {});
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatDob(dob: string): string {
  const [y, m, d] = dob.split("-");
  return `${m}/${d}/${y}`;
}

async function fillFieldByLabelOrName(page: any, keywords: string[], value: string): Promise<void> {
  await page.evaluate(
    (kws: string[], val: string) => {
      const inputs = Array.from(document.querySelectorAll("input, textarea"));
      const target = inputs.find((el: any) => {
        const name = (el.name ?? "").toLowerCase();
        const id = (el.id ?? "").toLowerCase();
        const placeholder = (el.placeholder ?? "").toLowerCase();
        const label = document.querySelector(`label[for="${el.id}"]`)?.textContent?.toLowerCase() ?? "";
        return kws.some((kw) =>
          name.includes(kw) || id.includes(kw) || placeholder.includes(kw) || label.includes(kw)
        );
      }) as HTMLInputElement | undefined;
      if (target) {
        target.focus();
        target.value = val;
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    keywords,
    value
  );
  await delay(150);
}

async function selectByLabelOrName(page: any, keywords: string[], value: string): Promise<void> {
  await page.evaluate(
    (kws: string[], val: string) => {
      const selects = Array.from(document.querySelectorAll("select"));
      const target = selects.find((el) => {
        const name = el.name.toLowerCase();
        const id = el.id.toLowerCase();
        const label = document.querySelector(`label[for="${el.id}"]`)?.textContent?.toLowerCase() ?? "";
        return kws.some((kw) => name.includes(kw) || id.includes(kw) || label.includes(kw));
      }) as HTMLSelectElement | undefined;
      if (target) {
        const option =
          Array.from(target.options).find(
            (o) => o.value === val || o.text.toLowerCase() === val.toLowerCase()
          ) ??
          Array.from(target.options).find(
            (o) => o.text.toLowerCase().includes(val.toLowerCase()) || o.value.toLowerCase().includes(val.toLowerCase())
          );
        if (option) {
          target.value = option.value;
          target.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    },
    keywords,
    value
  );
  await delay(150);
}

/** Click Next/Continue/Submit. Returns true if a button was found and clicked. */
async function clickNextOrContinue(page: any): Promise<boolean> {
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]'));
    const btn = btns.find((b: any) =>
      b.textContent?.toLowerCase().match(/^(next|continue|submit|proceed|get quote|calculate|finish)/) ||
      b.value?.toLowerCase().match(/next|continue|submit/)
    ) as HTMLElement | undefined;
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (clicked) {
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await delay(500);
  }
  return clicked ?? false;
}
