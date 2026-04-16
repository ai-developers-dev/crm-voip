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
import crypto from "crypto";
import * as SEL from "./natgen-selectors";

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
  occupation?: string;
  email?: string;
  phone?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  // Property (home quotes only)
  property?: {
    yearBuilt?: number;
    sqft?: number;
    stories?: number;
    constructionType?: string;
    ownershipType?: string;
    roofType?: string;
    primaryHeatType?: string;
    numberOfFamilies?: number;
    occupancy?: string;
    residenceClass?: string;
    hasPool?: boolean;
    hasTrampoline?: boolean;
    burglarAlarm?: string;
    fireAlarm?: string;
    sprinklerSystem?: string;
    numberOfFullBath?: number;
    numberOfHalfBath?: number;
    numberOfGarages?: number;
    numberOfFireplaces?: number;
  };
  // Prior insurance (for underwriting)
  priorInsurance?: {
    carrier?: string;
    biCoverage?: string;
    expirationDate?: string;
    yearsContinuous?: number;
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
  capturedDrivers?: Array<{ firstName: string; lastName: string; dateOfBirth?: string; relationship?: string; licenseNumber?: string; licenseState?: string }>;
  capturedVehicles?: Array<{ year: string; make: string; model: string; vin?: string }>;
  capturedPriorInsurance?: { priorCarrier?: string; priorBi?: string; priorExpDate?: string; monthsRecent?: string };
}

/** Callback to report quoting stage progress */
export type ProgressCallback = (stage: string) => Promise<void>;

// Standard coverage defaults
const STANDARD_AUTO_COVERAGES = {
  coverageLevel: "Custom360 Signature",
  bodilyInjury: "100/300",
  propertyDamage: "50,000",
  medicalPayments: "1,000",
  uninsuredMotorist: "100/300",
  comprehensiveDeductible: "500 Deductible",
  collisionDeductible: "1000 Deductible",
};

const STANDARD_HOME_COVERAGES = {
  allPerilsDeductible: "$1,000.00",
  windstormDeductible: "Included w",
  coverageLevel: "Custom360",
};

// Old portal (still used for login)
const PORTAL_URL_OLD = "https://natgenagency.com";
// New portal (blue/white — where quoting happens)
const PORTAL_URL_NEW = "https://custom360.nationalgeneral.com";
const PORTAL_URL = PORTAL_URL_OLD; // Login still goes through old portal
const LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Check if the current page is a login page (not the dashboard).
 *  NatGen's login page URL can be just natgenagency.com (no /login path),
 *  so we check BOTH URL and page CONTENT. */
async function isOnLoginPage(page: any): Promise<boolean> {
  try {
    // Wait for any redirects to settle
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});

    const url = page.url().toLowerCase();

    // Definite dashboard URLs — NOT a login page
    if (url.includes("mainmenu") || url.includes("contentpages") || url.includes("ho.natgenagency")) {
      return false;
    }

    // Explicit login URLs
    if (url.includes("login.aspx") || url.includes("/signin")) return true;

    // Check page content for login vs dashboard indicators
    const onLogin = await page.evaluate(() => {
      const text = document.body?.innerText?.toLowerCase() || "";
      const hasLoginIndicators =
        text.includes("forgot user id") ||
        (text.includes("user id") && !text.includes("main menu") &&
         (text.includes("sign in") || text.includes("enable login")));
      const hasDashboardIndicators =
        text.includes("main menu") || text.includes("new quote") || text.includes("find customer");
      return hasLoginIndicators && !hasDashboardIndicators;
    });
    return onLogin;
  } catch {
    return false;
  }
}

/** Launch a browser — Browserless.io if API key is set, @sparticuz/chromium on
 *  Vercel/Lambda, otherwise local Chrome. Pass storageState JSON string to
 *  restore cookies from a previous session. Set visible: true for the mapper. */
async function launchBrowser(options?: { storageState?: string; visible?: boolean }) {
  const browserlessKey = process.env.BROWSERLESS_API_KEY;
  const isVercel = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const isRailway = !!process.env.RAILWAY_ENVIRONMENT;

  // Parse storageState if provided (restore cookies/localStorage)
  let storageStateObj: any = undefined;
  if (options?.storageState) {
    try {
      storageStateObj = JSON.parse(options.storageState);
    } catch {
      console.warn("[launchBrowser] Invalid storageState JSON, launching fresh");
    }
  }

  const contextOptions: any = {
    userAgent: UA,
    viewport: { width: 1280, height: 720 },
    ...(storageStateObj ? { storageState: storageStateObj } : {}),
  };

  if (browserlessKey) {
    const browser = await chromium.connectOverCDP(
      `wss://chrome.browserless.io?token=${browserlessKey}&stealth`,
      { timeout: 60_000 }
    );
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    return { browser, context, page };
  }

  if (isRailway) {
    // Railway — uses Playwright's bundled Chromium from the Docker image.
    // No `channel: "chrome"` because Chrome isn't installed — Chromium is.
    const browser = await chromium.launch({
      headless: true,
      args: LAUNCH_ARGS,
    });
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    return { browser, context, page };
  }

  if (isVercel) {
    // Vercel/Lambda — use bundled @sparticuz/chromium (no system Chrome available)
    const sparticuz = (await import("@sparticuz/chromium")).default;
    const browser = await chromium.launch({
      headless: true,
      args: [...sparticuz.args, ...LAUNCH_ARGS],
      executablePath: await sparticuz.executablePath(),
    });
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    return { browser, context, page };
  }

  // Local fallback — uses system Chrome/Chromium
  const isVisible = options?.visible ?? false;
  const browser = await chromium.launch({
    headless: !isVisible,
    args: LAUNCH_ARGS,
    channel: "chrome",
    ...(isVisible ? { slowMo: 500 } : {}),
  });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { browser, context, page };
}

// ── Login Test (interactive — holds browser open for 2FA) ──────────────

interface PortalTestSession {
  browser: any;
  page: any;
  createdAt: number;
  username: string;
}

// Module-level session store for in-progress login tests
const TEST_SESSIONS = new Map<string, PortalTestSession>();
const SESSION_TTL = 3 * 60 * 1000; // 3 minutes

// Session store for quote agent (holds browser open during 2FA)
interface QuoteSession {
  browser: any;
  context: any;
  page: any;
  createdAt: number;
  credentials: PortalCredentials;
}
const QUOTE_SESSIONS = new Map<string, QuoteSession>();
const QUOTE_SESSION_TTL = 5 * 60 * 1000; // 5 minutes

function pruneExpiredQuoteSessions() {
  const now = Date.now();
  for (const [id, s] of QUOTE_SESSIONS.entries()) {
    if (now - s.createdAt > QUOTE_SESSION_TTL) {
      s.browser.close().catch(() => {});
      QUOTE_SESSIONS.delete(id);
    }
  }
}

// ── Persistent authenticated browser session ──────────────────────────
// Keeps the browser alive across multiple quote runs so NatGen doesn't
// require 2FA every time. Session lasts 30 minutes of inactivity.
interface AuthenticatedSession {
  browser: any;
  context: any;
  page: any;
  lastUsed: number;
}
let PERSISTENT_SESSION: AuthenticatedSession | null = null;
const PERSISTENT_TTL = 30 * 60 * 1000; // 30 minutes — auto-closes after inactivity

/** Get the persistent authenticated session, or null if expired/closed */
function getPersistentSession(): AuthenticatedSession | null {
  if (!PERSISTENT_SESSION) return null;
  if (Date.now() - PERSISTENT_SESSION.lastUsed > PERSISTENT_TTL) {
    console.log("[session] Persistent session expired, closing...");
    PERSISTENT_SESSION.browser.close().catch(() => {});
    PERSISTENT_SESSION = null;
    return null;
  }
  return PERSISTENT_SESSION;
}

/** Save a browser session for reuse across quote runs */
function savePersistentSession(browser: any, context: any, page: any) {
  PERSISTENT_SESSION = { browser, context, page, lastUsed: Date.now() };
}

/** Touch the session to extend its TTL */
function touchPersistentSession() {
  if (PERSISTENT_SESSION) {
    PERSISTENT_SESSION.lastUsed = Date.now();
  }
}

/** Check if persistent session is still alive (browser not crashed) */
async function isPersistentSessionAlive(): Promise<boolean> {
  if (!PERSISTENT_SESSION) return false;
  try {
    // Try to access the page — if browser crashed this will throw
    await PERSISTENT_SESSION.page.evaluate(() => document.title);
    return true;
  } catch {
    console.log("[session] Persistent session is dead, clearing...");
    PERSISTENT_SESSION = null;
    return false;
  }
}

export function getQuoteSession(sessionId: string): QuoteSession | undefined {
  return QUOTE_SESSIONS.get(sessionId);
}

export function cleanupQuoteSession(sessionId: string) {
  const session = QUOTE_SESSIONS.get(sessionId);
  if (session) {
    session.browser.close().catch(() => {});
    QUOTE_SESSIONS.delete(sessionId);
  }
}

// ── Cookie/Session Persistence ─────────────────────────────────────────
// Saves and restores browser cookies so NatGen's "remember device" works
// across browser restarts. Dual storage: filesystem (/tmp) + Convex DB.

const SESSION_STATE_EXPIRY = 25 * 24 * 60 * 60 * 1000; // 25 days

function credentialHash(username: string): string {
  return crypto.createHash("sha256").update(username).digest("hex").slice(0, 12);
}

/** Save browser cookies/localStorage after successful login */
async function saveSessionState(
  context: any,
  carrierKey: string,
  username: string,
  convex?: any, // ConvexHttpClient
): Promise<void> {
  try {
    const state = await context.storageState();
    const stateJson = JSON.stringify(state);
    const hash = credentialHash(username);

    // Save to filesystem (fast, local dev)
    try {
      const fs = await import("fs");
      const path = await import("path");
      const dir = path.join("/tmp", "portal-sessions");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${carrierKey}-${hash}.json`), stateJson);
      console.log(`[session] Saved cookies to /tmp/portal-sessions/${carrierKey}-${hash}.json`);
    } catch (e) {
      console.warn("[session] Could not save to filesystem:", e);
    }

    // Save to Convex DB (survives deployments)
    if (convex) {
      try {
        const { api } = await import("../../../convex/_generated/api");
        await convex.mutation(api.portalSessions.saveStorageState, {
          carrierKey,
          credentialHash: hash,
          storageState: stateJson,
        });
        console.log("[session] Saved cookies to Convex DB");
      } catch (e) {
        console.warn("[session] Could not save to Convex:", e);
      }
    }
  } catch (e) {
    console.warn("[session] Could not extract storageState:", e);
  }
}

/** Load saved cookies from filesystem (fast path). Falls back to the
 *  legacy "test-login" key so cookies saved by older test-login code
 *  still unlock the quote flow on first run after upgrade. */
function loadSessionStateFromFile(carrierKey: string, username: string): string | null {
  const tryRead = (hashKey: string): string | null => {
    try {
      const fs = require("fs");
      const path = require("path");
      const filePath = path.join("/tmp", "portal-sessions", `${carrierKey}-${hashKey}.json`);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (Date.now() - stat.mtimeMs > SESSION_STATE_EXPIRY) {
          console.log("[session] Filesystem cookies expired (>25 days), ignoring");
          return null;
        }
        return fs.readFileSync(filePath, "utf-8");
      }
    } catch {}
    return null;
  };

  const state = tryRead(credentialHash(username));
  if (state) {
    console.log("[session] Loaded cookies from filesystem");
    return state;
  }
  const legacy = tryRead(credentialHash("test-login"));
  if (legacy) {
    console.log("[session] Loaded cookies from filesystem via legacy 'test-login' key");
    return legacy;
  }
  return null;
}

/** Load saved cookies from Convex DB. Falls back to the legacy
 *  "test-login" key so cookies saved by older test-login code still
 *  unlock the quote flow on first run after upgrade. */
async function loadSessionStateFromDB(
  carrierKey: string,
  username: string,
  convex: any,
): Promise<string | null> {
  try {
    const { api } = await import("../../../convex/_generated/api");
    const realHash = credentialHash(username);
    const state = await convex.query(api.portalSessions.getStorageState, {
      carrierKey,
      credentialHash: realHash,
    });
    if (state) {
      console.log("[session] Loaded cookies from Convex DB");
      return state;
    }

    const legacyHash = credentialHash("test-login");
    const legacy = await convex.query(api.portalSessions.getStorageState, {
      carrierKey,
      credentialHash: legacyHash,
    });
    if (legacy) {
      console.log("[session] Loaded cookies from Convex DB via legacy 'test-login' key — will re-save under real username after successful login");
      return legacy;
    }
    return null;
  } catch (e) {
    console.warn("[session] Could not load from Convex:", e);
    return null;
  }
}

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
  const { browser, page } = await launchBrowser({ visible: true });
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
    await delay(500);

    // ── SCREEN 1 → SCREEN 2: Click SIGN IN ──
    // The button is: <a id="btnLogin" href="javascript:doPostBack('btnLogin','')">
    console.log("[login] Step A: Clicking #btnLogin...");
    await page.click("#btnLogin");

    // Wait generously for page 2 to fully render
    await delay(3000);
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await delay(1000);

    console.log(`[login] Step A done — URL: ${page.url()}`);

    // Now wait specifically for the password field to appear (up to 10 seconds)
    // Screen 2 is on login.natgenagency.com — different page structure
    let passwordField = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      passwordField = await findInput(page, [
        'input[type="password"]',
        'input[name="txtPassword"]', 'input[id="txtPassword"]',
        'input[name="Password"]', 'input[id="Password"]',
      ]);
      if (passwordField) break;
      await delay(1000);
      console.log(`[login] Waiting for password field... attempt ${attempt + 1}`);
    }

    // Also re-fill User ID on screen 2 (it carries over but may need re-entry)
    const usernameField2 = await findInput(page, [
      'input[name="txtUserID"]', 'input[id="txtUserID"]',
    ]);
    if (usernameField2) {
      await usernameField2.fill(creds.username);
      await delay(300);
    }

    if (!passwordField) {
      // Collect diagnostics from whatever page we're on
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
          `⚠️ User ID accepted but password field not found.`,
          `URL: ${diag2.url}`,
          `Inputs: ${JSON.stringify(diag2.inputs)}`,
          `Page text: ${diag2.bodyText}`,
        ].join("\n"),
      };
    }

    await passwordField.fill(creds.password);
    await delay(300);

    // Submit password — screen 2 uses <button type="submit"> not <a id="btnLogin">
    console.log("[login] Step B: Clicking submit button on Password page...");
    try {
      await page.click('button[type="submit"]');
    } catch {
      // Navigation may destroy context — expected
    }
    await delay(3000);
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});

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

      TEST_SESSIONS.set(sessionId, { browser, page, createdAt: Date.now(), username: creds.username });
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

export async function submitLoginTest2FA(
  sessionId: string,
  code: string,
  convex?: any, // ConvexHttpClient — persist cookies so the quote agent can reuse them
): Promise<
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

    // Check "Don't ask for 2FA again" / "Remember this device" checkbox
    await check2faRememberBox(page);
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

    // Save cookies before closing — so future loginForQuoting calls can skip 2FA.
    // Key: save under the actual username so loginForQuoting finds them on lookup.
    if (!failed) {
      try {
        const ctx = page.context();
        await saveSessionState(ctx, "natgen", session.username, convex);
        console.log(`[test-login] Saved cookies under username "${session.username}" after successful 2FA`);
      } catch (e) {
        console.warn("[test-login] Could not save cookies:", e);
      }
    }

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
  // Wait generously for redirects (cookies may auto-redirect to MainMenu via JS)
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await delay(3000); // Extra wait for client-side JS redirects

  // Check if we're already logged in (cookies auto-redirected to dashboard)
  const currentUrl = page.url().toLowerCase();
  const alreadyLoggedIn = currentUrl.includes("mainmenu") ||
    currentUrl.includes("contentpages") ||
    currentUrl.includes("ho.natgenagency") ||
    currentUrl.includes("dashboard");
  if (alreadyLoggedIn) {
    console.log(`[login] Already on dashboard (${page.url()}) — skipping login form`);
    return;
  }
  // Double-check with content
  if (!(await isOnLoginPage(page))) {
    console.log("[login] Not on login page — already authenticated, skipping login form");
    return;
  }

  // Wait for the page to render
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("input")).some(
      (i: any) => i.type !== "hidden" && i.offsetParent !== null
    ),
    undefined,
    { timeout: 20000 }
  ).catch(() => {});
  await delay(1000);

  // Handle "You appear to be logged in via another window" — click "Enable Login"
  const enableClicked = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a'));
    const btn = all.find((b: any) => {
      const text = ((b as any).textContent || (b as any).value || "").toLowerCase().trim();
      return text.includes("enable login") || text === "enable login";
    }) as HTMLElement | undefined;
    if (btn) { btn.click(); return true; }
    return false;
  }).catch(() => false);

  if (enableClicked) {
    console.log("[login] Clicked 'Enable Login' (another session warning)");
    await delay(3000);
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await delay(1000);

    // After Enable Login, NatGen may go straight to dashboard or back to full login
    if (!(await isOnLoginPage(page))) {
      console.log("[login] Enable Login went straight to dashboard — already authenticated!");
      return; // Already logged in
    }
  }

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
  // NatGen's SIGN IN is <a id="btnLogin" href="javascript:doPostBack(...)"> — NOT a <button>
  console.log("[login] Clicking #btnLogin...");
  try {
    await page.click("#btnLogin");
  } catch {
    // Fallback: try finding any clickable "Sign In" element (including <a> tags)
    const clicked = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"]'));
      const el = all.find((b: any) =>
        (b.textContent?.trim().toLowerCase() === "sign in" ||
         b.textContent?.toLowerCase().includes("sign in") ||
         b.value?.toLowerCase().includes("sign in"))
      ) as HTMLElement | undefined;
      if (el) { el.click(); return true; }
      return false;
    });
    if (!clicked) await page.keyboard.press("Enter");
  }

  // Wait generously for page 2 (password page) to fully render
  await delay(3000);
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await delay(1000);

  console.log(`[login] After SIGN IN — URL: ${page.url()}`);

  // Check if cookies auto-authenticated us (SIGN IN redirected straight to dashboard)
  const postSignInUrl = page.url().toLowerCase();
  if (postSignInUrl.includes("mainmenu") || postSignInUrl.includes("contentpages") || postSignInUrl.includes("ho.natgenagency")) {
    console.log("[login] Cookies auto-authenticated — already on dashboard after SIGN IN click!");
    return; // login() caller will handle saving session
  }

  // Step 2: Wait for the password field with retries (same approach as startLoginTest)
  let passwordField = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    passwordField = await findInput(page, [
      'input[type="password"]',
      'input[name="txtPassword"]', 'input[id="txtPassword"]',
      'input[name="Password"]', 'input[id="Password"]',
      'input[id$="Password"]', 'input[name$="Password"]',
      'input[placeholder*="password" i]',
    ]);
    if (passwordField) break;
    await delay(1000);
    console.log(`[login] Waiting for password field... attempt ${attempt + 1}`);
  }

  // Re-fill User ID on screen 2 if it exists (NatGen sometimes needs it)
  const usernameField2 = await findInput(page, [
    'input[name="txtUserID"]', 'input[id="txtUserID"]',
  ]);
  if (usernameField2) {
    await usernameField2.fill(creds.username);
    await delay(300);
  }

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

  // Submit password — screen 2 uses <button type="submit"> (same as startLoginTest)
  console.log("[login] Submitting password...");
  try {
    await page.click('button[type="submit"]');
  } catch {
    // Navigation may destroy context — try other methods
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
      const btn = btns.find((b: any) =>
        b.textContent?.toLowerCase().includes("sign in") ||
        b.textContent?.toLowerCase().includes("log in") ||
        b.textContent?.toLowerCase().includes("submit") ||
        b.value?.toLowerCase().includes("sign in")
      ) as HTMLElement | undefined;
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);
    if (!clicked) await page.keyboard.press("Enter");
  }

  await delay(3000);
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
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

/**
 * Login for quoting — same flow as login() but instead of throwing on 2FA,
 * saves the browser session and returns a status so the UI can collect the code.
 */
export async function loginForQuoting(
  creds: PortalCredentials,
  onProgress?: ProgressCallback,
  convex?: any, // ConvexHttpClient — for reading/writing persistent cookies
  options?: { visible?: boolean },
): Promise<
  | { status: "logged_in"; browser: any; page: any; context?: any }
  | { status: "needs_2fa"; sessionId: string; message: string }
  | { status: "error"; message: string }
> {
  pruneExpiredQuoteSessions();

  // ── 1. Reuse in-memory persistent session (fastest) — skip if visible browser requested ──
  if (!options?.visible && await isPersistentSessionAlive()) {
    const session = getPersistentSession()!;
    console.log("[login] Reusing persistent authenticated session");
    touchPersistentSession();

    try {
      await session.page.goto(PORTAL_URL, { waitUntil: "load", timeout: 15000 });
      await delay(2000);
      if (!(await isOnLoginPage(session.page))) {
        return { status: "logged_in", browser: session.browser, page: session.page, context: session.context };
      }
      console.log("[login] Persistent session expired on portal side, re-logging in...");
    } catch {
      console.log("[login] Persistent session browser crashed, creating new one...");
    }
    PERSISTENT_SESSION = null;
  }

  // ── 2. Try loading saved cookies (survives restarts) ─────────────
  let savedState: string | null = null;
  savedState = loadSessionStateFromFile("natgen", creds.username);
  if (!savedState && convex) {
    savedState = await loadSessionStateFromDB("natgen", creds.username, convex);
  }

  // ── 3. Launch browser (with restored cookies if available) ───────
  const { browser, context, page } = await launchBrowser({
    ...(savedState ? { storageState: savedState } : {}),
    visible: options?.visible,
  });

  try {
    await onProgress?.("login");

    // If we have saved cookies, try navigating directly to dashboard
    if (savedState) {
      console.log("[login] Have saved cookies — navigating to portal...");
      await page.goto(PORTAL_URL, { waitUntil: "load", timeout: 15000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await delay(3000);

      // Poll URL for up to 10 seconds — NatGen may do slow JS redirects
      let onDashboard = false;
      for (let i = 0; i < 5; i++) {
        const checkUrl = page.url().toLowerCase();
        console.log(`[login] Cookie check attempt ${i + 1}: URL = ${checkUrl}`);
        if (checkUrl.includes("mainmenu") || checkUrl.includes("contentpages") || checkUrl.includes("ho.natgenagency")) {
          onDashboard = true;
          break;
        }
        // Check for "Enable Login" button and click it
        const clicked = await page.evaluate(() => {
          const all = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a'));
          const btn = all.find((b: any) => {
            const t = ((b as any).textContent || (b as any).value || "").toLowerCase().trim();
            return t === "enable login" || t === "enable log in";
          }) as HTMLElement | undefined;
          if (btn) { btn.click(); return true; }
          return false;
        }).catch(() => false);
        if (clicked) {
          console.log("[login] Clicked 'Enable Login'");
          await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
          await delay(3000);
          const afterUrl = page.url().toLowerCase();
          if (afterUrl.includes("mainmenu") || afterUrl.includes("contentpages")) {
            onDashboard = true;
            break;
          }
        }
        await delay(2000);
      }

      if (onDashboard) {
        console.log("[login] Cookies restored session — on dashboard, no 2FA needed!");
        savePersistentSession(browser, context, page);
        await saveSessionState(context, "natgen", creds.username, convex);
        return { status: "logged_in", browser, page, context };
      }

      console.log("[login] Saved cookies didn't work, doing full login...");
    }

    // Full login flow
    await login(page, creds);

    // Login succeeded — save cookies for next time
    savePersistentSession(browser, context, page);
    await saveSessionState(context, "natgen", creds.username, convex);
    console.log("[login] Saved persistent session (4h TTL) + cookies to storage");

    return { status: "logged_in", browser, page, context };
  } catch (err: any) {
    const msg = err?.message ?? String(err);

    // Check if the error is 2FA-related
    if (msg.includes("2FA") || msg.includes("verification")) {
      const sessionId = crypto.randomUUID();

      QUOTE_SESSIONS.set(sessionId, {
        browser,
        context,
        page,
        createdAt: Date.now(),
        credentials: creds,
      });

      const pageText = await page.evaluate(() =>
        (document.body as any)?.innerText?.slice(0, 500) ?? ""
      ).catch(() => "");

      return {
        status: "needs_2fa",
        sessionId,
        message: pageText.includes("verification")
          ? "NatGen sent a verification code to your phone. Enter it below."
          : "Two-factor authentication required. Check your phone for the code.",
      };
    }

    // Real error — close browser
    await browser.close();
    return { status: "error", message: msg };
  }
}

/**
 * Complete 2FA for a quote session and return the authenticated page.
 */
export async function completeQuoting2FA(
  sessionId: string,
  code: string,
  convex?: any, // ConvexHttpClient — for saving cookies after 2FA
): Promise<
  | { status: "logged_in"; browser: any; page: any; context?: any }
  | { status: "error"; message: string }
> {
  const session = QUOTE_SESSIONS.get(sessionId);
  if (!session) {
    return { status: "error", message: "Session expired. Please try again." };
  }

  const { browser, page } = session;

  try {
    // Find the code input field
    let codeField = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      codeField = await findInput(page, [
        'input[name="txtCode"]', 'input[name="code"]', 'input[id="txtCode"]',
        'input[type="text"][placeholder*="code" i]',
        'input[type="text"][placeholder*="verification" i]',
        'input[type="tel"]',
      ]);
      if (codeField) break;
      await delay(1000);
    }

    if (!codeField) {
      // Maybe the page needs us to click "text message" first
      await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a, label'));
        const btn = all.find((b: any) => {
          const t = ((b as any).textContent || (b as any).value || "").toLowerCase();
          return t.includes("text message") || t.includes("sms");
        }) as HTMLElement | undefined;
        btn?.click();
      }).catch(() => {});
      await delay(3000);

      // Try finding the code field again
      for (let attempt = 0; attempt < 5; attempt++) {
        codeField = await findInput(page, [
          'input[name="txtCode"]', 'input[name="code"]', 'input[id="txtCode"]',
          'input[type="text"][placeholder*="code" i]',
          'input[type="tel"]',
        ]);
        if (codeField) break;
        await delay(1000);
      }
    }

    if (!codeField) {
      QUOTE_SESSIONS.delete(sessionId);
      await browser.close();
      return { status: "error", message: "Could not find verification code input field." };
    }

    await codeField.fill(code);
    await delay(200);

    // Check "Don't ask for 2FA again" / "Remember this device" checkbox
    await check2faRememberBox(page);
    await delay(200);

    // Submit the code
    try {
      await page.click('button[type="submit"]');
    } catch {
      const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
        const btn = btns.find((b: any) =>
          b.textContent?.toLowerCase().includes("verify") ||
          b.textContent?.toLowerCase().includes("submit") ||
          b.value?.toLowerCase().includes("verify")
        ) as HTMLElement | undefined;
        if (btn) { btn.click(); return true; }
        return false;
      }).catch(() => false);
      if (!clicked) await page.keyboard.press("Enter");
    }

    await delay(3000);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await delay(1000);

    // Check if we're now logged in
    const currentUrl = page.url();
    const bodyText = await page.evaluate(() => (document.body as any)?.innerText?.toLowerCase() ?? "").catch(() => "");

    if (bodyText.includes("verification") && bodyText.includes("code")) {
      QUOTE_SESSIONS.delete(sessionId);
      await browser.close();
      return { status: "error", message: "Verification code was incorrect. Please try again." };
    }

    // 2FA succeeded — save cookies! This is the critical save point.
    // NatGen just set the "remember device" cookie.
    const ctx = session.context || page.context();
    savePersistentSession(browser, ctx, page);
    await saveSessionState(ctx, "natgen", session.credentials.username, convex);
    console.log("[2FA] Saved cookies after successful 2FA — device should be remembered");

    QUOTE_SESSIONS.delete(sessionId);
    return { status: "logged_in", browser, page, context: ctx };

  } catch (err: any) {
    QUOTE_SESSIONS.delete(sessionId);
    await browser.close();
    return { status: "error", message: err?.message ?? "2FA verification failed" };
  }
}

/** Check the "Don't ask for 2FA again" / "Remember this device" checkbox on 2FA pages */
async function check2faRememberBox(page: any): Promise<void> {
  try {
    await page.evaluate(() => {
      // Find any unchecked checkbox near text about remembering / not asking again
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      for (const cb of checkboxes) {
        if ((cb as HTMLInputElement).checked) continue;
        // Check by label text
        const label = cb.closest("label")?.textContent?.toLowerCase() ?? "";
        const forLabel = cb.id ? document.querySelector(`label[for="${cb.id}"]`)?.textContent?.toLowerCase() ?? "" : "";
        const parentText = (cb.parentElement?.textContent ?? "").toLowerCase();
        const nearbyText = `${label} ${forLabel} ${parentText}`;
        if (
          nearbyText.includes("don't ask") || nearbyText.includes("do not ask") ||
          nearbyText.includes("remember") || nearbyText.includes("trust") ||
          nearbyText.includes("don't require") || nearbyText.includes("skip") ||
          nearbyText.includes("30 day") || nearbyText.includes("not ask again")
        ) {
          (cb as HTMLInputElement).checked = true;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
          cb.dispatchEvent(new Event("click", { bubbles: true }));
          console.log("[2FA] Checked 'remember' checkbox");
          return;
        }
      }
      // Fallback: if there's only one checkbox on the page, check it
      const unchecked = checkboxes.filter((cb) => !(cb as HTMLInputElement).checked);
      if (unchecked.length === 1) {
        (unchecked[0] as HTMLInputElement).checked = true;
        unchecked[0].dispatchEvent(new Event("change", { bubbles: true }));
        unchecked[0].dispatchEvent(new Event("click", { bubbles: true }));
        console.log("[2FA] Checked the only checkbox on the 2FA page");
      }
    });
  } catch {
    // Non-critical — continue even if we can't find/check the box
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
  lead: InsuranceLeadData,
  onProgress?: ProgressCallback,
  existingSession?: { browser: any; page: any }
): Promise<QuoteResult> {
  // Use existing authenticated session or create a new one
  const { browser, page } = existingSession ?? await launchBrowser();
  const _shouldCloseBrowser = !existingSession; // Only close if we created it

  try {
    // Step 1: Login (skip if already authenticated via 2FA flow)
    if (!existingSession) {
      await onProgress?.("login");
      await login(page, creds);
      await delay(1500);
    }

    // Step 2: Dashboard — select state + product + click Begin
    // VERIFIED IDs from portal discovery:
    //   State:   #ctl00_MainContent_wgtMainMenuNewQuote_ddlState
    //   Product: #ctl00_MainContent_wgtMainMenuNewQuote_ddlProduct (empty until state selected!)
    //   Begin:   #ctl00_MainContent_wgtMainMenuNewQuote_btnContinue (<a> tag, not submit)
    await onProgress?.("search");
    console.log("[auto-quote] Step 2: Dashboard — exact IDs...");

    const stateAbbrev = lead.state.length === 2 ? lead.state.toUpperCase() : lead.state;

    // Select state — triggers ASP.NET autopostback which populates the product dropdown
    console.log(`[auto-quote] Selecting state: ${stateAbbrev}`);
    await page.selectOption(SEL.DASHBOARD.stateDropdown, stateAbbrev);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await delay(2000); // Wait for product dropdown to populate via postback

    // Select product — now populated after state postback
    // Wait for options to appear in the product dropdown
    const productValue = await page.evaluate((sel: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      if (!select || select.options.length === 0) return null;
      // Look for Custom360 first, then take first non-empty option
      const custom360 = Array.from(select.options).find((o: any) =>
        o.text?.toLowerCase().includes("custom360") || o.text?.toLowerCase().includes("custom 360")
      );
      if (custom360) return custom360.value;
      // Take first non-placeholder option
      const first = Array.from(select.options).find((o: any) => o.value && o.value !== "-Select-" && o.value !== "");
      return first?.value ?? null;
    }, SEL.DASHBOARD.productDropdown);

    if (productValue) {
      console.log(`[auto-quote] Selecting product: ${productValue}`);
      await page.selectOption(SEL.DASHBOARD.productDropdown, productValue);
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await delay(1000);
    } else {
      console.log("[auto-quote] WARNING: No products available in dropdown after state selection");
    }

    // Click Begin — it's an <a> tag, use Playwright click
    console.log("[auto-quote] Clicking Begin...");
    await page.click(SEL.DASHBOARD.beginButton);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await delay(2000);

    // Step 3: Client Search — exact IDs from discovery
    console.log("[auto-quote] Step 3: Client Search...");
    await page.fill('#MainContent_txtFirstName', lead.firstName).catch(() => {});
    await page.fill('#MainContent_txtLastName', lead.lastName).catch(() => {});
    await page.fill('#MainContent_txtZipCode', lead.zip).catch(() => {});

    // Click Search button
    await page.click('#MainContent_btnSearch');
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await delay(2000);

    // Step 4: Click "Add New Customer"
    console.log("[auto-quote] Step 4: Add New Customer...");
    await page.click('#MainContent_btnAddNewClient').catch(async () => {
      // Fallback if the exact ID doesn't match
      await page.click('input[value="Add New Customer"]').catch(() => {});
    });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await delay(2000);

    // Step 5: Client Information form — fill ALL fields in ONE evaluate call (fast!)
    await onProgress?.("client_info");
    console.log("[auto-quote] Step 5: Client Information form (batch fill)...");

    const phoneParts = lead.phone ? (() => {
      const d = lead.phone!.replace(/\D/g, "");
      return { area: d.slice(0, 3), prefix: d.slice(3, 6), line: d.slice(6, 10) };
    })() : null;

    // Set Policy Effective Date FIRST (separate step — it may trigger a postback that reloads the page)
    const effDate = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    })();
    await page.evaluate((date: string) => {
      const el = document.getElementById("MainContent_ucGeneralInformation_txtPolicyEffDate") as HTMLInputElement;
      if (el && el.value !== date) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(el, date); else el.value = date;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
      }
    }, effDate).catch(() => {});
    // Wait for any postback triggered by date change
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await delay(2000);

    // Now fill all other fields (date is already set and any postback is done)
    await page.evaluate(
      (data: any) => {
        // Helper: set input value with proper events
        function setVal(id: string, val: string) {
          const el = document.getElementById(id) as HTMLInputElement | null;
          if (!el || !val) return;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          if (setter) setter.call(el, val); else el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        // Helper: set select value
        function setSel(id: string, val: string) {
          const el = document.getElementById(id) as HTMLSelectElement | null;
          if (!el || !val) return;
          const opt = Array.from(el.options).find(
            (o) => o.value === val || o.text === val ||
              o.text.toLowerCase().includes(val.toLowerCase())
          );
          if (opt) el.value = opt.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }

        // Named Insured
        setVal("MainContent_ucNamedInsured_txtFirstName", data.firstName);
        setVal("MainContent_ucNamedInsured_txtLastName", data.lastName);
        setVal("MainContent_ucNamedInsured_txtDateOfBirth", data.dob);

        // Dropdowns
        setSel("MainContent_ucNamedInsured_ddlGender", data.gender);
        setSel("MainContent_ucNamedInsured_ddlMaritalStatus", data.marital);
        setSel("MainContent_ucNamedInsured_ddlOccupation", data.occupation);

        // Phone type + 3-part number
        if (data.phoneArea) {
          setSel("MainContent_ucContactInfo_ucPhoneNumber_ddlPhoneType", "Mobile");
          setVal("MainContent_ucContactInfo_ucPhoneNumber_txtAreaCode", data.phoneArea);
          setVal("MainContent_ucContactInfo_ucPhoneNumber_txtPrefix", data.phonePrefix);
          setVal("MainContent_ucContactInfo_ucPhoneNumber_txtLineNumber", data.phoneLine);
        }

        // Email
        if (data.email) {
          setVal("MainContent_ucContactInfo_ucEmailAddress_txtEmailAddress", data.email);
          setVal("MainContent_ucContactInfo_ucEmailAddress_txtEmailAddressConfirmation", data.email);
        }

        // Opt-in → No, Consent → Yes
        setSel("MainContent_ucContactInfo_ddlOptIn", "No");
        setSel("MainContent_ucContactInfo_ddlAutomatedContact", "Yes");

        // Residential Address
        setVal("MainContent_ucResidentialAddress_txtAddress", data.street);
        setVal("MainContent_ucResidentialAddress_txtCity", data.city);
        setVal("MainContent_ucResidentialAddress_txtZipCode", data.zip);
      },
      {
        firstName: lead.firstName,
        lastName: lead.lastName,
        dob: formatDob(lead.dob),
        gender: lead.gender || "Male",
        marital: lead.maritalStatus || "Married",
        occupation: "Other",
        phoneArea: phoneParts?.area || "",
        phonePrefix: phoneParts?.prefix || "",
        phoneLine: phoneParts?.line || "",
        email: lead.email || "",
        street: lead.street,
        city: lead.city,
        zip: lead.zip,
      }
    ).catch((err: any) => console.error("[quote] Batch fill failed:", err));

    console.log("[auto-quote] Client info batch fill complete");

    // Click Continue — exact ID: #MainContent_btnContinue
    console.log("[auto-quote] Clicking Continue on Client Information...");
    await page.click(SEL.CLIENT_INFO.nextButton).catch(async () => {
      const clicked = await clickButton(page, SEL.CLIENT_INFO.nextButton);
      if (!clicked) await clickNextOrContinue(page);
    });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await delay(2000);

    // Step 6: Quote Prefill — DMV lookup results
    // Drivers: First = Named Insured (keep). ALL additional drivers → Reject + "unknown to insured"
    // Vehicles: Accept ONLY the first vehicle, reject all others.
    await onProgress?.("prefill");
    console.log("[auto-quote] Step 6: Quote Prefill (drivers + vehicles)...");

    // Step 6a: Click "Reject All Additional Drivers" button (does a postback)
    // This is faster and more reliable than setting each dropdown individually
    console.log("[auto-quote] Clicking 'Reject All Additional Drivers'...");
    try {
      await page.click('#MainContent_ucPrefillDriver_btnRejectAllDrivers');
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await delay(2000);
      console.log("[auto-quote] Reject All clicked — page reloaded");
    } catch {
      // Fallback: manually set each dropdown by name attribute
      console.log("[auto-quote] Reject All button not found, setting dropdowns manually...");
      const driverSelects = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('select.driverStatus'))
          .filter((sel) => !(sel as HTMLSelectElement).disabled)
          .map((sel) => (sel as HTMLSelectElement).getAttribute("name") || "");
      });
      for (const name of driverSelects) {
        await page.evaluate((n: string) => {
          const sel = document.querySelector(`select[name="${n}"]`) as HTMLSelectElement | null;
          if (!sel) return;
          const rejectOpt = Array.from(sel.options).find((o) => o.value === "R");
          if (rejectOpt) {
            sel.value = rejectOpt.value;
            // Use the exact __doPostBack pattern from the page source
            setTimeout(() => (window as any).__doPostBack(n, ""), 0);
          }
        }, name);
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await delay(1000);
      }
    }

    // Now set ALL rejection reason dropdowns to "Driver is unknown to insured"
    // These appear after the Reject All postback completes
    const reasonResult = await page.evaluate(() => {
      const results: string[] = [];
      // Find by class or by options containing "unknown"
      const allSelects = Array.from(document.querySelectorAll('select'));
      const reasonDropdowns = allSelects.filter((sel) =>
        sel.getAttribute("name")?.toLowerCase().includes("rejectionreason") ||
        Array.from(sel.options).some((o) => o.text.toLowerCase().includes("unknown to"))
      );

      results.push(`Found ${reasonDropdowns.length} rejection reason dropdowns`);

      for (const sel of reasonDropdowns) {
        const unknownOpt = Array.from(sel.options).find((o) =>
          o.text.toLowerCase().includes("unknown to the insured") ||
          o.text.toLowerCase().includes("unknown to insured")
        );
        if (unknownOpt) {
          sel.value = unknownOpt.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          results.push(`Reason: ${sel.getAttribute("name")} → ${unknownOpt.text}`);
        }
      }
      return results;
    });
    console.log("[auto-quote] Rejection reasons:", reasonResult);
    // Wait for any postback from rejection reason changes
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await delay(2000);

    // Step 6b: Vehicles — Accept FIRST, Reject all others
    // Get vehicle radio button names for Playwright-native clicking
    // Try multiple times in case the page is still reloading
    let vehicleRadios: Array<{ name: string; vehicleName: string; action: string }> = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      vehicleRadios = await page.evaluate(() => {
      const results: Array<{ name: string; vehicleName: string; action: string }> = [];
      const vehicleTable = document.getElementById("gvPrefillAuto");
      if (!vehicleTable) return results;

      const rows = Array.from(vehicleTable.querySelectorAll("tr")).slice(1);
      rows.forEach((row, idx) => {
        const acceptRadio = row.querySelector('span.autoAccept input[type="radio"]') as HTMLInputElement | null;
        const rejectRadio = row.querySelector('span.autoReject input[type="radio"]') as HTMLInputElement | null;
        const vehicleName = row.querySelector("td")?.textContent?.trim() || `Vehicle ${idx}`;

        if (idx === 0 && acceptRadio) {
          results.push({ name: acceptRadio.name, vehicleName, action: "accept" });
        } else if (rejectRadio) {
          results.push({ name: rejectRadio.name, vehicleName, action: "reject" });
        }
      });
      return results;
    }).catch(() => []);

      if (vehicleRadios.length > 0) break;
      console.log(`[auto-quote] Vehicle table not found (attempt ${attempt + 1}), waiting...`);
      await delay(2000);
    }

    // Click each radio using Playwright's native click (not DOM click)
    const vehicleResult: string[] = [`Found ${vehicleRadios.length} vehicle rows`];
    for (const vr of vehicleRadios) {
      try {
        await page.click(`input[name="${vr.name}"]`);
        vehicleResult.push(`${vr.action === "accept" ? "Accepted" : "Rejected"}: ${vr.vehicleName} (${vr.name})`);
        await delay(300);
      } catch (e: any) {
        vehicleResult.push(`Failed ${vr.action} ${vr.vehicleName}: ${e.message?.slice(0, 60)}`);
      }
    }
    console.log("[auto-quote] Vehicle results:", vehicleResult);
    await delay(500);

    // Capture drivers and vehicles from the Prefill page tables
    const capturedDriversVehicles = await page.evaluate(() => {
      const drivers: Array<{ name: string; license: string }> = [];
      const vehicles: Array<{ description: string; vin: string }> = [];

      // Parse driver table
      const driverTable = document.getElementById("gvPrefillDriver");
      if (driverTable) {
        const rows = Array.from(driverTable.querySelectorAll("tr")).slice(1); // skip header
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll("td"));
          if (cells.length >= 2) {
            drivers.push({
              name: cells[0]?.textContent?.trim() || "",
              license: cells[1]?.textContent?.trim() || "",
            });
          }
        }
      }

      // Parse vehicle table
      const vehicleTable = document.getElementById("gvPrefillAuto");
      if (vehicleTable) {
        const rows = Array.from(vehicleTable.querySelectorAll("tr")).slice(1);
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll("td"));
          if (cells.length >= 2) {
            vehicles.push({
              description: cells[0]?.textContent?.trim() || "",
              vin: cells[1]?.textContent?.trim() || "",
            });
          }
        }
      }

      return { drivers, vehicles };
    }).catch(() => ({ drivers: [], vehicles: [] }));

    console.log(`[auto-quote] Captured ${capturedDriversVehicles.drivers.length} drivers, ${capturedDriversVehicles.vehicles.length} vehicles`);

    // Parse into structured format for saving
    const parsedDrivers = capturedDriversVehicles.drivers.map((d: any) => {
      const nameParts = (d.name || "").split(" ");
      return {
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" ") || "",
        relationship: undefined as string | undefined,
        licenseNumber: d.license !== "Unknown" ? d.license : undefined,
      };
    }).filter((d: any) => d.firstName);

    const parsedVehicles = capturedDriversVehicles.vehicles.map((v: any) => {
      // Description format: "2023 NISSAN MURANO"
      const parts = (v.description || "").split(" ");
      return {
        year: parts[0] || "",
        make: parts[1] || "",
        model: parts.slice(2).join(" ") || "",
        vin: v.vin || undefined,
      };
    }).filter((v: any) => v.year && v.make);

    console.log("[auto-quote] Parsed drivers:", JSON.stringify(parsedDrivers));
    console.log("[auto-quote] Parsed vehicles:", JSON.stringify(parsedVehicles));

    console.log("[auto-quote] Clicking Next on Quote Prefill...");
    await clickNextOrContinue(page);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await delay(1500);

    // Step 7: Navigate remaining screens by clicking Next on each page
    // NatGen sidebar links are DISABLED (aspNetDisabled) until each screen is visited,
    // so we MUST click Next sequentially through each screen.
    await onProgress?.("underwriting");
    console.log("[auto-quote] Step 7: REAL-CLICK-V2 — Navigating remaining screens...");

    const remainingScreens = [
      { name: "Drivers", stage: "underwriting" },
      { name: "Driver Violations", stage: "underwriting" },
      { name: "Vehicles", stage: "underwriting" },
      { name: "Vehicle Coverages", stage: "coverage" },
      { name: "Auto Underwriting", stage: "underwriting" },
      { name: "Premium Summary", stage: "premium" },
    ];

    // Get quote state once for all screens
    const quoteState = await page.evaluate(() => {
      const infoLine = document.getElementById("lblInfo")?.textContent || "";
      const m = infoLine.match(/^([A-Z]{2})\s/);
      return m ? m[1] : "IL";
    }).catch(() => "IL");

    for (const screen of remainingScreens) {
      const currentUrl = page.url();
      const pageTitle = await page.evaluate(() => {
        const titleEl = document.querySelector("#lblHeaderPageTitle, .pageTitle");
        return titleEl?.textContent?.trim() || document.title;
      }).catch(() => "");
      console.log(`[auto-quote]   On: "${pageTitle}" (${currentUrl})`);

      if (screen.stage) await onProgress?.(screen.stage);

      // Check if we're already on Premium Summary
      if (pageTitle.toLowerCase().includes("premium")) {
        console.log("[auto-quote] Already on Premium Summary — done navigating!");
        break;
      }

      // ── Handle Drivers page: fill required dropdowns ONE AT A TIME with full postback ──
      if (pageTitle.toLowerCase().includes("driver") && !pageTitle.toLowerCase().includes("violation")) {
        console.log("[auto-quote]   === DRIVERS PAGE V5 (SPA framework — IDs with dots) ===");

        // These dropdowns use IDs like "driver.0.FieldName" with NO name attribute.
        // They're managed by a JS SPA framework (not ASP.NET WebForms).
        // We must use getElementById (not querySelector with CSS escaping) and
        // fire proper input/change events so the framework picks up the change.

        const driverFields = [
          { id: "driver.0.DriverHouseholdMember", preferValue: "True" },
          { id: "driver.0.LicenseStatus", preferValue: "Active" },
          { id: "driver.0.LicenseState", preferValue: quoteState },
          { id: "driver.0.DynamicDrive", preferValue: "True" },
        ];

        for (const field of driverFields) {
          const result = await page.evaluate((args: { id: string; preferValue: string }) => {
            const sel = document.getElementById(args.id) as HTMLSelectElement | null;
            if (!sel || sel.disabled) return { status: "not_found", id: args.id };

            // Check if option exists
            const opt = Array.from(sel.options).find(o => o.value === args.preferValue);
            if (!opt) {
              // Try partial text match
              const altOpt = Array.from(sel.options).find(o =>
                o.text.toLowerCase().includes(args.preferValue.toLowerCase()) ||
                o.value.toLowerCase().includes(args.preferValue.toLowerCase())
              );
              if (!altOpt) {
                return {
                  status: "no_option",
                  id: args.id,
                  currentVal: sel.value,
                  available: Array.from(sel.options).map(o => `${o.value}="${o.text}"`).join(", "),
                };
              }
              args.preferValue = altOpt.value;
            }

            // Set value using the native setter to trigger framework bindings
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              HTMLSelectElement.prototype, "value"
            )?.set;
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(sel, args.preferValue);
            } else {
              sel.value = args.preferValue;
            }

            // Fire ALL events that JS frameworks listen to
            sel.dispatchEvent(new Event("input", { bubbles: true }));
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            sel.dispatchEvent(new Event("blur", { bubbles: true }));

            // Also try triggering Knockout.js / Angular change detection
            const evt = new Event("change", { bubbles: true, cancelable: true });
            sel.dispatchEvent(evt);

            // Remove error class
            sel.classList.remove("ctlError");

            return { status: "set", id: args.id, value: args.preferValue };
          }, { id: field.id, preferValue: field.preferValue }).catch((e: any) => ({
            status: "error", id: field.id, message: e.message?.slice(0, 100)
          }));

          console.log(`[auto-quote]     ${field.id}: ${JSON.stringify(result)}`);
          await delay(500);
        }

        // Handle any other dropdowns with ctlError class
        const errorDropdowns = await page.evaluate(() => {
          const results: Array<{ id: string; currentVal: string; options: string }> = [];
          document.querySelectorAll("select.ctlError").forEach((sel: any) => {
            if (sel.disabled) return;
            results.push({
              id: sel.id,
              currentVal: sel.value,
              options: Array.from(sel.options).slice(0, 5).map((o: any) => `${o.value}="${o.text}"`).join(", "),
            });
          });
          return results;
        }).catch(() => []);

        if (errorDropdowns.length > 0) {
          console.log(`[auto-quote]   Still ${errorDropdowns.length} dropdowns with ctlError:`);
          for (const dd of errorDropdowns) {
            console.log(`[auto-quote]     ${dd.id} = "${dd.currentVal}" [${dd.options}]`);
            // Try setting to "True" or first valid option
            await page.evaluate((id: string) => {
              const sel = document.getElementById(id) as HTMLSelectElement;
              if (!sel) return;
              const target = Array.from(sel.options).find(o =>
                o.value === "True" || (o.value && o.value !== "-1" && o.value !== "False" && !o.text.includes("Select"))
              ) || Array.from(sel.options).find(o => o.value && o.value !== "-1");
              if (target) {
                const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
                if (setter) setter.call(sel, target.value);
                else sel.value = target.value;
                sel.dispatchEvent(new Event("input", { bubbles: true }));
                sel.dispatchEvent(new Event("change", { bubbles: true }));
                sel.classList.remove("ctlError");
              }
            }, dd.id).catch(() => {});
            await delay(300);
          }
        }

        // Final state dump
        const finalState = await page.evaluate(() => {
          return Array.from(document.querySelectorAll("select.sbs-dropdown"))
            .filter((s: any) => s.offsetParent !== null)
            .map((s: any) => `${s.id.split(".").pop()}=${s.value}${s.classList.contains("ctlError") ? " ⚠" : ""}`)
            .join(", ");
        }).catch(() => "");
        console.log(`[auto-quote]   Final state: ${finalState}`);

        // Capture driver details (name, DOB, relationship) from the Drivers page
        const driversPageData = await page.evaluate(() => {
          const drivers: Array<{ firstName: string; lastName: string; dateOfBirth?: string; relationship?: string; licenseState?: string }> = [];
          // Find all driver blocks — look for driver.N.FirstName pattern
          let driverIndex = 0;
          while (true) {
            const firstNameEl = document.getElementById(`driver.${driverIndex}.FirstName`) as HTMLInputElement;
            if (!firstNameEl) break;
            const lastNameEl = document.getElementById(`driver.${driverIndex}.LastName`) as HTMLInputElement;
            const dobEl = document.getElementById(`driver.${driverIndex}.DateOfBirth`) as HTMLInputElement;
            const relEl = document.getElementById(`driver.${driverIndex}.RelationshipStatus`) as HTMLSelectElement;
            const licStateEl = document.getElementById(`driver.${driverIndex}.LicenseState`) as HTMLSelectElement;

            drivers.push({
              firstName: firstNameEl?.value || "",
              lastName: lastNameEl?.value || "",
              dateOfBirth: dobEl?.value || undefined,
              relationship: relEl?.selectedIndex > 0 ? relEl.options[relEl.selectedIndex]?.text : undefined,
              licenseState: licStateEl?.value && licStateEl.value !== "-1" ? licStateEl.value : undefined,
            });
            driverIndex++;
          }
          return drivers;
        }).catch(() => []);

        if (driversPageData.length > 0) {
          console.log(`[auto-quote]   Captured ${driversPageData.length} drivers with DOBs from Drivers page`);
          // Merge DOB data from Drivers page into the parsedDrivers from Prefill
          // Drivers page has DOBs but only for accepted drivers
          // Prefill page has all drivers but no DOBs
          for (const dpd of driversPageData) {
            const existing = parsedDrivers.find((p: any) =>
              p.firstName.toLowerCase() === dpd.firstName.toLowerCase() &&
              p.lastName.toLowerCase() === dpd.lastName.toLowerCase()
            );
            if (existing) {
              // Merge DOB and relationship into existing entry
              if (dpd.dateOfBirth) existing.dateOfBirth = dpd.dateOfBirth;
              if (dpd.relationship) existing.relationship = dpd.relationship;
              if (dpd.licenseState) existing.licenseState = dpd.licenseState;
            } else {
              // Driver only on Drivers page (not on Prefill) — add it
              parsedDrivers.push(dpd);
            }
          }
        }

        await delay(2000);
        console.log("[auto-quote]   === DRIVERS PAGE V5 DONE ===");
      }

      // ── Handle Vehicles page (InsuredVehicles): fill required fields + handle popups ──
      if (pageTitle.toLowerCase() === "vehicles" || currentUrl.includes("InsuredVehicles")) {
        console.log("[auto-quote]   === VEHICLES PAGE ===");

        // Step 1: Handle Garaging Address popup if it appears
        // Wait a moment for any popup to render
        await delay(2000);

        // Check if there's a popup/overlay with "Garaging Address"
        const hasGaragingPopup = await page.evaluate(() => {
          const bodyText = document.body?.innerText || "";
          return bodyText.includes("Garaging Address") && bodyText.includes("Street Address");
        }).catch(() => false);

        if (hasGaragingPopup) {
          console.log("[auto-quote]     Garaging Address popup detected — trying to close...");

          // Try clicking the X/close button using Playwright locators
          let closed = false;
          try {
            // Try various close button patterns
            const closeBtn = await page.$("a.popup-close, .popup-close, [class*='close']");
            if (closeBtn) {
              await closeBtn.click();
              closed = true;
            }
          } catch {}

          if (!closed) {
            // Try clicking any element that looks like an X close
            try {
              await page.click("text=✕", { timeout: 2000 });
              closed = true;
            } catch {}
          }
          if (!closed) {
            try {
              await page.click("text=×", { timeout: 2000 });
              closed = true;
            } catch {}
          }
          if (!closed) {
            try {
              await page.click("text=X", { timeout: 2000 });
              closed = true;
            } catch {}
          }

          if (closed) {
            console.log("[auto-quote]     Closed garaging popup");
            await delay(1500);
          } else {
            console.log("[auto-quote]     Could not close popup — trying to fill it instead");
            // Fill the popup fields with lead address data
            await page.evaluate((state: string) => {
              // Find all visible inputs and selects that are empty
              const inputs = Array.from(document.querySelectorAll("input[type='text']")) as HTMLInputElement[];
              const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];

              for (const inp of inputs) {
                if (inp.disabled || inp.offsetParent === null || inp.value) continue;
                const label = inp.closest("li,tr,td,div")?.querySelector("label")?.textContent?.toLowerCase() || "";
                if (label.includes("street address 1")) { inp.value = "Same as insured"; inp.dispatchEvent(new Event("change", { bubbles: true })); }
                else if (label.includes("city")) { inp.value = "Same"; inp.dispatchEvent(new Event("change", { bubbles: true })); }
                else if (label.includes("zip")) { inp.value = "62521"; inp.dispatchEvent(new Event("change", { bubbles: true })); }
              }
              for (const sel of selects) {
                if (sel.disabled || sel.offsetParent === null) continue;
                if (sel.value === "-1" || sel.value === "") {
                  const label = sel.closest("li,tr,td,div")?.querySelector("label")?.textContent?.toLowerCase() || "";
                  if (label.includes("state")) {
                    const opt = Array.from(sel.options).find(o => o.value === state);
                    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
                  } else {
                    const opt = Array.from(sel.options).find(o => o.value && o.value !== "-1");
                    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
                  }
                }
              }
            }, quoteState).catch(() => {});
            await delay(500);

            // Click Save button in the popup
            try {
              const saveBtn = await page.$("input[value='Save']");
              if (saveBtn) {
                await saveBtn.click();
                console.log("[auto-quote]     Clicked Save on garaging popup");
              } else {
                await page.click("button:has-text('Save')", { timeout: 3000 });
                console.log("[auto-quote]     Clicked Save (text match)");
              }
              await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
              await delay(2000);
            } catch {
              console.log("[auto-quote]     No Save button found");
            }
          }
        }

        // Step 2: Fill ALL empty SPA dropdowns (find by class, not by guessed IDs)
        const filledDropdowns = await page.evaluate(() => {
          const results: string[] = [];
          const sels = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
          for (const sel of sels) {
            if (sel.disabled || sel.offsetParent === null) continue;
            if (sel.value && sel.value !== "-1" && sel.value !== "") continue;
            // Skip popup/hidden selects
            if (sel.id?.includes("DecPopUp") || sel.id?.includes("Declination")) continue;

            const idLower = (sel.id || "").toLowerCase();
            let opt: HTMLOptionElement | undefined;

            // Special handling: GaragingAddress — pick existing address, NOT "add"
            if (idLower.includes("garagingaddress") || idLower.includes("garaging")) {
              // Look for an option that is NOT "add" and NOT "Select"
              opt = Array.from(sel.options).find(o =>
                o.value && o.value !== "-1" && o.value !== "add" &&
                !o.text.includes("Select") && !o.text.includes("--") && !o.text.includes("Add")
              );
              // If no existing address option, skip this dropdown entirely to avoid the popup
              if (!opt) {
                results.push(`${sel.id} → SKIPPED (no existing address, avoiding popup)`);
                continue;
              }
            } else {
              opt = Array.from(sel.options).find(o =>
                o.value && o.value !== "-1" && !o.text.includes("Select") && !o.text.includes("--")
              );
            }

            if (opt) {
              const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
              if (setter) setter.call(sel, opt.value);
              else sel.value = opt.value;
              sel.dispatchEvent(new Event("input", { bubbles: true }));
              sel.dispatchEvent(new Event("change", { bubbles: true }));
              sel.classList.remove("ctlError");
              results.push(`${sel.id || sel.name || "?"} → ${opt.value}`);
            }
          }
          return results;
        }).catch(() => [] as string[]);
        console.log(`[auto-quote]     Filled ${filledDropdowns.length} dropdowns: ${filledDropdowns.join(", ")}`);

        // Step 3: Fill DatePurchased directly by finding it via ID pattern
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const purchaseDate = `${oneMonthAgo.getMonth() + 1}/${oneMonthAgo.getDate()}/${oneMonthAgo.getFullYear()}`;

        // Try to find and fill DatePurchased by scanning ALL inputs on page
        const dateFilled = await page.evaluate((date: string) => {
          // Search by ID patterns
          const patterns = ["DatePurchased", "datePurchased", "txtDatePurchased", "PurchaseDate"];
          for (const pat of patterns) {
            // Try getElementById
            const byId = document.getElementById(`vehicle.0.${pat}`) as HTMLInputElement;
            if (byId) {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
              if (setter) setter.call(byId, date);
              else byId.value = date;
              byId.dispatchEvent(new Event("input", { bubbles: true }));
              byId.dispatchEvent(new Event("change", { bubbles: true }));
              byId.dispatchEvent(new Event("blur", { bubbles: true }));
              byId.classList.remove("ctlError");
              return `found by id: vehicle.0.${pat}`;
            }
          }
          // Search ALL inputs for any with "date" and "purchase" in id
          const allInputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
          for (const inp of allInputs) {
            const id = (inp.id || "").toLowerCase();
            if (id.includes("date") && id.includes("purchas") && !inp.disabled && inp.offsetParent !== null) {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
              if (setter) setter.call(inp, date);
              else inp.value = date;
              inp.dispatchEvent(new Event("input", { bubbles: true }));
              inp.dispatchEvent(new Event("change", { bubbles: true }));
              inp.dispatchEvent(new Event("blur", { bubbles: true }));
              inp.classList.remove("ctlError");
              return `found by search: ${inp.id}`;
            }
          }
          // Last resort: find by label text
          const labels = Array.from(document.querySelectorAll("label, td, span"));
          for (const lbl of labels) {
            const text = (lbl.textContent || "").toLowerCase();
            if (text.includes("date") && text.includes("purchased")) {
              const inp = lbl.closest("tr,li,div")?.querySelector("input") as HTMLInputElement;
              if (inp && !inp.disabled) {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
                if (setter) setter.call(inp, date);
                else inp.value = date;
                inp.dispatchEvent(new Event("input", { bubbles: true }));
                inp.dispatchEvent(new Event("change", { bubbles: true }));
                inp.dispatchEvent(new Event("blur", { bubbles: true }));
                return `found by label: ${inp.id}`;
              }
            }
          }
          return "not_found";
        }, purchaseDate).catch(() => "error");
        console.log(`[auto-quote]     DatePurchased (${purchaseDate}): ${dateFilled}`);

        const filledInputs = await page.evaluate((args: { purchaseDate: string }) => {
          const results: string[] = [];
          const inputs = Array.from(document.querySelectorAll("input[type='text'], input:not([type])")) as HTMLInputElement[];
          for (const inp of inputs) {
            if (inp.disabled || inp.readOnly || inp.offsetParent === null) continue;
            if (inp.value && inp.value.trim() !== "") continue;

            const idLower = (inp.id || "").toLowerCase();
            const label = inp.closest("li,tr,td,div")?.querySelector("label")?.textContent?.trim()?.toLowerCase() || "";
            let val = "";

            if (idLower.includes("datepurchased") || idLower.includes("purchasedate") ||
                (label.includes("date") && label.includes("purchased"))) {
              val = args.purchaseDate;
            } else if (idLower.includes("annualmileage") || idLower.includes("mileage") ||
                       label.includes("annual mileage") || label.includes("mileage")) {
              val = "12000";
            }

            if (val) {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
              if (setter) setter.call(inp, val);
              else inp.value = val;
              inp.dispatchEvent(new Event("input", { bubbles: true }));
              inp.dispatchEvent(new Event("change", { bubbles: true }));
              inp.dispatchEvent(new Event("blur", { bubbles: true }));
              inp.classList.remove("ctlError");
              results.push(`${inp.id || label} → ${val}`);
            }
          }
          return results;
        }, { purchaseDate }).catch(() => [] as string[]);
        console.log(`[auto-quote]     Filled ${filledInputs.length} inputs: ${filledInputs.join(", ")}`);

        // Step 4: Check if garaging address popup appeared AGAIN after filling
        const popupStillVisible = await page.evaluate(() => {
          const popup = Array.from(document.querySelectorAll(".popup-container, [class*='popup']"))
            .find(el => (el as HTMLElement).offsetParent !== null && el.textContent?.includes("Garaging"));
          return !!popup;
        }).catch(() => false);

        if (popupStillVisible) {
          console.log("[auto-quote]     Garaging popup still visible — filling with contact address...");
          // Fill the garaging address fields in the popup with the contact's address
          await page.evaluate(() => {
            // Find visible inputs in the popup context
            const popup = Array.from(document.querySelectorAll(".popup-container, [class*='popup']"))
              .find(el => (el as HTMLElement).offsetParent !== null && el.textContent?.includes("Garaging"));
            if (!popup) return;

            // Try to copy from the main page's garaging fields
            const mainStreet = (document.querySelector("[id*='GaragingAddress'], [id*='txtAddress']") as HTMLInputElement)?.value || "";
            const mainCity = (document.querySelector("[id*='GaragingCity'], [id*='txtCity']") as HTMLInputElement)?.value || "";
            const mainZip = (document.querySelector("[id*='GaragingZip'], [id*='txtZip']") as HTMLInputElement)?.value || "";

            const inputs = Array.from(popup.querySelectorAll("input[type='text']")) as HTMLInputElement[];
            const selects = Array.from(popup.querySelectorAll("select")) as HTMLSelectElement[];

            for (const inp of inputs) {
              const label = inp.closest("li,tr,td")?.querySelector("label")?.textContent?.toLowerCase() || "";
              let val = "";
              if (label.includes("street address 1") || label.includes("address 1")) val = mainStreet || "Same as insured";
              else if (label.includes("city")) val = mainCity || "Same";
              else if (label.includes("zip")) val = mainZip || "";
              if (val && !inp.value) {
                inp.value = val;
                inp.dispatchEvent(new Event("input", { bubbles: true }));
                inp.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }
            for (const sel of selects) {
              if (sel.value === "-1" || sel.value === "") {
                const opt = Array.from(sel.options).find(o => o.value && o.value !== "-1");
                if (opt) {
                  sel.value = opt.value;
                  sel.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }
            }
          }).catch(() => {});
          await delay(500);

          // Click Save on the popup
          const saved = await page.$("input[value='Save'], button:has-text('Save')");
          if (saved) {
            await saved.click().catch(() => {});
            console.log("[auto-quote]     Clicked Save on garaging popup");
            await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
            await delay(2000);
          }
        }

        await delay(1000);
        console.log("[auto-quote]   === VEHICLES PAGE DONE ===");
      }

      // ── Handle Vehicle Coverages: select standard coverages ──
      if (pageTitle.toLowerCase().includes("vehicle coverage")) {
        await onProgress?.("coverage");
        console.log("[auto-quote] Step 8: Coverage selection...");
        await selectStandardCoverages(page);
        await delay(800);
      }

      // ── Handle Auto Underwriting: fill prior insurance + remaining fields ──
      if (pageTitle.toLowerCase().includes("underwriting") && !pageTitle.toLowerCase().includes("final")) {
        console.log("[auto-quote]   === AUTO UNDERWRITING ===");

        // FULL DUMP of ALL form elements INCLUDING hidden/vendor columns
        const uwDump = await page.evaluate(() => {
          const items: string[] = [];
          // ALL selects (including hidden ones for vendor data)
          document.querySelectorAll("select").forEach((s: any) => {
            const label = s.closest("li,tr,td,div")?.querySelector("label")?.textContent?.trim()?.slice(0, 40) || "";
            const selText = s.selectedIndex > 0 ? s.options[s.selectedIndex]?.text : "";
            const vis = s.offsetParent !== null ? "VIS" : "HID";
            items.push(`SEL[${vis}] id="${s.id}" name="${s.name}" val="${s.value}" text="${selText}" label="${label}"`);
          });
          // ALL inputs (including hidden ones, text fields with vendor data)
          document.querySelectorAll("input").forEach((i: any) => {
            if (i.type === "hidden" && !i.id?.includes("Vendor") && !i.id?.includes("Prior") && !i.id?.includes("Carrier")) return;
            const label = i.closest("li,tr,td,div")?.querySelector("label")?.textContent?.trim()?.slice(0, 40) || "";
            const vis = i.offsetParent !== null ? "VIS" : "HID";
            items.push(`INP[${vis}] id="${i.id}" name="${i.name}" val="${i.value}" type="${i.type}" label="${label}"`);
          });
          // Also look for any span/td/div with text that looks like carrier data
          const vendorSection = document.querySelector("[id*='Vendor'], [class*='vendor'], [id*='vendor']");
          if (vendorSection) {
            items.push(`VENDOR_SECTION: ${vendorSection.id} text="${vendorSection.textContent?.slice(0, 200)}"`);
          }
          // Look for any text containing carrier names near "Vendor" labels
          document.querySelectorAll("td, span, div, label").forEach((el: any) => {
            const text = (el.textContent || "").trim();
            const id = el.id || "";
            if ((id.includes("Vendor") || id.includes("vendor") || text.includes("Vendor")) && text.length < 200 && text.length > 0) {
              items.push(`TEXT id="${id}" text="${text.slice(0, 100)}"`);
            }
          });
          return items;
        }).catch(() => []);
        console.log(`[auto-quote]     === UW PAGE FULL DUMP (${uwDump.length} elements) ===`);
        for (const item of uwDump) {
          console.log(`[auto-quote]       ${item}`);
        }
        console.log(`[auto-quote]     === END UW DUMP ===`);

        // Fill prior insurance fields from lead data if available
        const priorIns = lead.priorInsurance;
        if (priorIns) {
          console.log(`[auto-quote]     Prior insurance data: carrier=${priorIns.carrier}, BI=${priorIns.biCoverage}, exp=${priorIns.expirationDate}`);
        }

        // Fill ALL empty SPA dropdowns using native setter (same as Drivers/Vehicles)
        const uwFilled = await page.evaluate((args: { carrier?: string; bi?: string; expDate?: string; months?: number; state?: string }) => {
          const results: string[] = [];
          const sels = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
          for (const sel of sels) {
            if (sel.disabled || sel.offsetParent === null) continue;
            if (sel.value && sel.value !== "-1" && sel.value !== "") continue;
            if (sel.id?.includes("DecPopUp") || sel.id?.includes("Declination")) continue;

            const idLower = (sel.id || "").toLowerCase();
            let targetValue: string | undefined;

            // Match specific prior insurance fields
            if (idLower.includes("priorinsurance") || idLower.includes("priorcarrier")) {
              if (args.carrier) {
                const opt = Array.from(sel.options).find(o =>
                  o.text.toLowerCase().includes(args.carrier!.toLowerCase())
                );
                targetValue = opt?.value;
              }
            } else if (idLower.includes("priorbicoverage") || idLower.includes("priorbi")) {
              if (args.bi) {
                const opt = Array.from(sel.options).find(o =>
                  o.text.includes(args.bi!) || o.value.includes(args.bi!)
                );
                targetValue = opt?.value;
              }
            } else if (idLower.includes("monthsmostrecent") || idLower.includes("monthswith")) {
              if (args.months) {
                const opt = Array.from(sel.options).find(o => {
                  const val = parseInt(o.value);
                  return !isNaN(val) && val >= args.months!;
                });
                targetValue = opt?.value;
              }
            }

            // Fallback: first valid option for any remaining empty dropdown
            if (!targetValue) {
              const opt = Array.from(sel.options).find(o =>
                o.value && o.value !== "-1" && !o.text.includes("Select") && !o.text.includes("--")
              );
              targetValue = opt?.value;
            }

            if (targetValue) {
              const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
              if (setter) setter.call(sel, targetValue);
              else sel.value = targetValue;
              sel.dispatchEvent(new Event("input", { bubbles: true }));
              sel.dispatchEvent(new Event("change", { bubbles: true }));
              sel.classList.remove("ctlError");
              results.push(`${sel.id || "?"} → ${targetValue}`);
            }
          }

          // Fill text inputs (expiration date, etc.)
          const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
          for (const inp of inputs) {
            if (inp.disabled || inp.offsetParent === null || inp.type === "hidden") continue;
            if (inp.value && inp.value.trim() !== "") continue;
            const idLower = (inp.id || "").toLowerCase();

            let val = "";
            if (idLower.includes("expiration") || idLower.includes("priorexp")) {
              val = args.expDate || "";
              // Default to 6 months from now if no data
              if (!val) {
                const d = new Date();
                d.setMonth(d.getMonth() + 6);
                val = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
              }
            }

            if (val) {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
              if (setter) setter.call(inp, val);
              else inp.value = val;
              inp.dispatchEvent(new Event("input", { bubbles: true }));
              inp.dispatchEvent(new Event("change", { bubbles: true }));
              inp.classList.remove("ctlError");
              results.push(`${inp.id || "?"} → ${val}`);
            }
          }
          return results;
        }, {
          carrier: priorIns?.carrier,
          bi: priorIns?.biCoverage,
          expDate: priorIns?.expirationDate,
          months: priorIns?.yearsContinuous ? priorIns.yearsContinuous * 12 : undefined,
          state: quoteState,
        }).catch(() => [] as string[]);

        console.log(`[auto-quote]     Filled ${uwFilled.length} fields: ${uwFilled.join(", ")}`);

        // Capture prior insurance from VENDOR column (right side — "Current" prefix IDs)
        // These are the exact IDs from the page dump:
        // ddlCurrentPriorInsCo, ddlCurrentPriorBICoverage, txtCurrentExpDate, ddlCurrentMonthsWMostRecentIns
        const capturedUW = await page.evaluate(() => {
          const getSelText = (id: string) => {
            const sel = document.getElementById(id) as HTMLSelectElement;
            if (!sel) return "";
            if (sel.selectedIndex > 0) return sel.options[sel.selectedIndex]?.text || sel.value;
            return sel.value && sel.value !== "-1" ? sel.value : "";
          };
          const getInpVal = (id: string) => {
            return (document.getElementById(id) as HTMLInputElement)?.value || "";
          };

          // VENDOR (right column) — "Current" prefix = vendor-provided data
          const vendorCarrier = getSelText("MainContent_ucPolicyCarrierInfo_ddlCurrentPriorInsCo");
          const vendorBi = getSelText("MainContent_ucPolicyCarrierInfo_ddlCurrentPriorBICoverage");
          const vendorExp = getInpVal("MainContent_ucPolicyCarrierInfo_txtCurrentExpDate");
          // For months, get the VALUE (numeric) not the text
          const vendorMonthsSel = document.getElementById("MainContent_ucPolicyCarrierInfo_ddlCurrentMonthsWMostRecentIns") as HTMLSelectElement;
          const vendorMonths = vendorMonthsSel?.value && vendorMonthsSel.value !== "-1"
            ? vendorMonthsSel.value
            : getSelText("MainContent_ucPolicyCarrierInfo_ddlCurrentMonthsWMostRecentIns");

          // INSURED (left column) — fallback if vendor is empty
          const insuredCarrier = getSelText("MainContent_ucPolicyCarrierInfo_ddlPriorInsCo");
          const insuredBi = getSelText("MainContent_ucPolicyCarrierInfo_ddlPriorBICoverage");
          const insuredExp = getInpVal("MainContent_ucPolicyCarrierInfo_txtPriorExpDate");
          const insuredMonths = getSelText("MainContent_ucPolicyCarrierInfo_ddlPriorMonthsWMostRecentIns");

          return {
            priorCarrier: vendorCarrier || insuredCarrier,
            priorBi: vendorBi || insuredBi,
            priorExpDate: vendorExp || insuredExp,
            monthsRecent: vendorMonths || insuredMonths,
          };
        }).catch(() => null);

        if (capturedUW) {
          console.log(`[auto-quote]     Captured UW data: ${JSON.stringify(capturedUW)}`);
          // Store for saving to contact later
          (lead as any)._capturedPriorInsurance = capturedUW;
        }

        await delay(1000);
        console.log("[auto-quote]   === AUTO UNDERWRITING DONE ===");
      }

      // Click Next to advance — use __doPostBack directly for ASP.NET forms
      console.log(`[auto-quote]   Clicking Next to advance past ${pageTitle || screen.name}...`);
      const urlBefore = page.url();

      // Find and click Next/Continue using Playwright locators (avoids page.evaluate strict mode issues)
      let submitted = "none";
      try {
        // Try ASP.NET button first
        const aspBtn = await page.$("#MainContent_btnContinue");
        if (aspBtn) {
          await aspBtn.click();
          submitted = "pw-click:MainContent_btnContinue";
        } else {
          // Try input[value='Next']
          const inputNext = await page.$("input[value='Next']");
          if (inputNext) {
            await inputNext.click();
            submitted = "pw-click:input-next";
          } else {
            // Try any visible button/link with "Next" text using Playwright's text selector
            const textNext = await page.$("button:has-text('Next'), a:has-text('Next'), input[value='Next']");
            if (textNext) {
              await textNext.click();
              submitted = "pw-text:next";
            } else {
              // Last resort: use getByRole
              try {
                await page.getByRole("button", { name: "Next" }).click({ timeout: 3000 });
                submitted = "pw-role:next";
              } catch {
                submitted = "none";
              }
            }
          }
        }
      } catch (e: any) {
        submitted = "pw-error:" + (e?.message?.slice(0, 60) || "unknown");
      }

      console.log(`[auto-quote]   Submit method: ${submitted}`);

      // Wait for any "Processing..." overlay to disappear (NatGen shows modal during AJAX)
      try {
        await page.waitForFunction(() => {
          const body = document.body?.innerText || "";
          const hasOverlay = body.includes("Processing...") || body.includes("Please wait");
          const modalVisible = document.querySelector(".popup-container, .loading-overlay, [style*='display: block']");
          return !hasOverlay || !modalVisible;
        }, undefined, { timeout: 30000 });
      } catch {
        console.log("[auto-quote]   Processing overlay still visible after 30s, continuing...");
      }
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await delay(3000);

      const urlAfter = page.url();
      const titleAfter = await page.evaluate(() => {
        const titleEl = document.querySelector("#lblHeaderPageTitle, .pageTitle");
        return titleEl?.textContent?.trim() || "";
      }).catch(() => "");

      // Detailed diagnostics if we didn't advance
      if (urlAfter === urlBefore || titleAfter === pageTitle) {
        const diag = await page.evaluate(() => {
          // Check ALL error sources
          const serverErrors = document.querySelector("#lstErrors")?.textContent?.trim() || "";
          const jsErrors = document.querySelector("#lstJSErrors")?.textContent?.trim() || "";
          const jsMessages = document.querySelector("#lstJSMessages")?.textContent?.trim() || "";
          // Check for JS validation messages
          const redText = Array.from(document.querySelectorAll("span[style*='color:red'], span.error, .validationMessage, span[style*='Red']"))
            .map(el => el.textContent?.trim()).filter(Boolean).join(" | ");
          // Check for any visible validation summary
          const valSummary = document.querySelector(".validation-summary-errors, #ValidationSummary")?.textContent?.trim() || "";
          // Check empty required dropdowns
          const emptyRequired: string[] = [];
          document.querySelectorAll("select").forEach((sel: any) => {
            if (!sel.disabled && (sel.value === "-1" || sel.value === "" || sel.selectedIndex === 0)) {
              const label = sel.closest("li,tr,div")?.querySelector("label")?.textContent?.trim() || sel.name;
              emptyRequired.push(`${label} (name=${sel.name}, val="${sel.value}")`);
            }
          });
          // Check empty required inputs
          const emptyInputs: string[] = [];
          document.querySelectorAll("input[type='text']").forEach((inp: any) => {
            if (!inp.disabled && !inp.readOnly && inp.value === "" && inp.className?.includes("required")) {
              const label = inp.closest("li,tr,div")?.querySelector("label")?.textContent?.trim() || inp.name;
              emptyInputs.push(`${label} (name=${inp.name})`);
            }
          });
          return { serverErrors, jsErrors, jsMessages, redText, valSummary, emptyRequired, emptyInputs };
        }).catch(() => ({ serverErrors: "", jsErrors: "", jsMessages: "", redText: "", valSummary: "", emptyRequired: [] as string[], emptyInputs: [] as string[] }));

        console.log(`[auto-quote]   ❌ PAGE DID NOT ADVANCE! Still on: "${titleAfter}" (${urlAfter})`);
        console.log(`[auto-quote]   Server errors: "${diag.serverErrors}"`);
        console.log(`[auto-quote]   JS errors: "${diag.jsErrors}"`);
        console.log(`[auto-quote]   JS messages: "${diag.jsMessages}"`);
        console.log(`[auto-quote]   Red text: "${diag.redText}"`);
        console.log(`[auto-quote]   Validation: "${diag.valSummary}"`);
        console.log(`[auto-quote]   Empty required dropdowns: ${JSON.stringify(diag.emptyRequired)}`);
        console.log(`[auto-quote]   Empty required inputs: ${JSON.stringify(diag.emptyInputs)}`);

        // Try filling any remaining empty fields and retry once
        if (diag.emptyRequired.length > 0 || diag.emptyInputs.length > 0) {
          console.log("[auto-quote]   Attempting to fill remaining empty fields...");
          await page.evaluate(() => {
            // Fill empty dropdowns
            document.querySelectorAll("select").forEach((sel: any) => {
              if (!sel.disabled && (sel.value === "-1" || sel.value === "" || sel.selectedIndex === 0)) {
                const opt = Array.from(sel.options as HTMLOptionElement[]).find((o: HTMLOptionElement) =>
                  o.value && o.value !== "-1" && !o.text.includes("Select") && !o.text.includes("--")
                );
                if (opt) sel.value = opt.value;
              }
            });
            // Fill empty required text inputs with placeholder
            document.querySelectorAll("input[type='text'].required").forEach((inp: any) => {
              if (!inp.disabled && !inp.readOnly && inp.value === "") {
                inp.value = "N/A";
              }
            });
          }).catch(() => {});
          await delay(500);

          // Retry clicking Next (handles both ASP.NET and SPA buttons)
          await page.evaluate(() => {
            const btn = document.querySelector("#MainContent_btnContinue, input[value='Next']") as HTMLInputElement;
            if (btn?.name && (window as any).__doPostBack) {
              (window as any).__doPostBack(btn.name, "");
              return;
            }
            if (btn) { btn.click(); return; }
            // SPA fallback
            const allEls = Array.from(document.querySelectorAll("a, button, input, span"));
            const next = allEls.find(el => {
              const text = ((el as any).value || el.textContent || "").trim().toLowerCase();
              return text === "next" && (el as HTMLElement).offsetParent !== null;
            }) as HTMLElement;
            if (next) next.click();
          }).catch(() => {});
          await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
          await delay(1500);
        }
      }
    }

    // Step 9: Verify we're on Premium Summary
    await onProgress?.("premium");
    console.log("[auto-quote] Step 9: Getting premium...");

    // Double-check we're on a premium page
    const onPremiumPage = await page.evaluate(() => {
      const text = (document.body as any).innerText.toLowerCase();
      return text.includes("premium summary") || text.includes("quote number") ||
             text.includes("total premium") || text.includes("final premium") ||
             text.includes("payment");
    }).catch(() => false);

    if (!onPremiumPage) {
      // Try clicking Next a few more times to get there
      for (let i = 0; i < 3; i++) {
        console.log(`[auto-quote]   Not on premium page yet, clicking Next (attempt ${i + 1})...`);
        await clickNextOrContinue(page);
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await delay(2000);
        const reached = await page.evaluate(() => {
          const text = (document.body as any).innerText.toLowerCase();
          return text.includes("premium") || text.includes("quote number") || text.includes("payment");
        }).catch(() => false);
        if (reached) break;
      }
    }

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

    // Log current page for debugging
    const premPageTitle = await page.evaluate(() => {
      const titleEl = document.querySelector("#lblHeaderPageTitle, .pageTitle");
      return titleEl?.textContent?.trim() || document.title;
    }).catch(() => "");
    const premPageUrl = page.url();
    console.log(`[auto-quote]   Premium page: "${premPageTitle}" (${premPageUrl})`);

    // Step 9: Scrape results
    const result = await page.evaluate(() => {
      const body = (document.body as any).innerText;

      // Quote number — NatGen shows it in the header: "Quote 240041410"
      const quoteMatch = body.match(/quote\s*(#|number|no\.?)?\s*:?\s*(\d{6,})/i);
      const quoteId = quoteMatch?.[2] ?? null;

      // Look for ALL dollar amounts on the page
      const allDollarAmounts: Array<{ amount: number; context: string }> = [];
      const dollarRegex = /\$\s*([\d,]+(?:\.\d{2})?)/g;
      let match;
      while ((match = dollarRegex.exec(body)) !== null) {
        const amount = parseFloat(match[1].replace(/,/g, ""));
        if (amount > 0) {
          const start = Math.max(0, match.index - 50);
          const end = Math.min(body.length, match.index + match[0].length + 50);
          allDollarAmounts.push({ amount, context: body.slice(start, end).replace(/\n/g, " ").trim() });
        }
      }

      // Monthly premium — look for patterns
      const monthlyMatch = body.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:\/\s*mo|per\s*month|monthly)/i);
      const monthly = monthlyMatch ? parseFloat(monthlyMatch[1].replace(/,/g, "")) : null;

      // Annual/Total premium — look for patterns
      const annualMatch = body.match(/(?:total|annual|full)\s*(?:premium|pay|cost)?\s*:?\s*\$\s*([\d,]+(?:\.\d{2})?)/i);
      let annual = annualMatch ? parseFloat(annualMatch[1].replace(/,/g, "")) : null;

      // Also try: "$X.XX / yr" or "$X.XX per year"
      if (!annual) {
        const yrMatch = body.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:\/\s*yr|per\s*year|annual|annually)/i);
        annual = yrMatch ? parseFloat(yrMatch[1].replace(/,/g, "")) : null;
      }

      // NatGen specific: look for "Premium" label followed by dollar amount
      if (!monthly && !annual) {
        const premMatch = body.match(/premium\s*(?:summary)?\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
        if (premMatch) {
          const val = parseFloat(premMatch[1].replace(/,/g, ""));
          if (val > 0) annual = val;
        }
      }

      // If still nothing, take the largest dollar amount as the annual premium
      if (!monthly && !annual && allDollarAmounts.length > 0) {
        const sorted = allDollarAmounts.sort((a, b) => b.amount - a.amount);
        // The largest reasonable amount (under $50k) is likely the annual premium
        const reasonable = sorted.find(d => d.amount < 50000 && d.amount > 50);
        if (reasonable) annual = reasonable.amount;
      }

      // Coverage details from page
      const coverageLines: string[] = [];
      const lines = body.split("\n");
      for (const line of lines) {
        const l = line.toLowerCase();
        if (
          l.includes("bodily") || l.includes("property damage") ||
          l.includes("uninsured") || l.includes("comprehensive") ||
          l.includes("collision") || l.includes("deductible") ||
          l.includes("liability") || l.includes("medical")
        ) {
          if (line.trim().length > 5 && line.trim().length < 150) {
            coverageLines.push(line.trim());
          }
        }
      }

      return {
        quoteId, monthly, annual, coverageLines,
        dollarAmounts: allDollarAmounts.slice(0, 10),
        fullText: body.slice(0, 3000),
      };
    });

    console.log(`[auto-quote]   Quote ID: ${result.quoteId}`);
    console.log(`[auto-quote]   Monthly: ${result.monthly}`);
    console.log(`[auto-quote]   Annual: ${result.annual}`);
    console.log(`[auto-quote]   Dollar amounts found: ${JSON.stringify(result.dollarAmounts?.slice(0, 5))}`);
    console.log(`[auto-quote]   Page text (first 500): ${result.fullText?.slice(0, 500)}`);

    if (!result.monthly && !result.annual) {
      return {
        success: false,
        error: `Quote page reached but no premium found. Content: ${result.fullText?.slice(0, 400)}`,
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
      capturedDrivers: parsedDrivers,
      capturedVehicles: parsedVehicles,
      capturedPriorInsurance: (lead as any)._capturedPriorInsurance || undefined,
    };

  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  } finally {
    // Don't close the browser if it's the persistent session — keep it for reuse
    if (PERSISTENT_SESSION?.browser !== browser) {
      await browser.close();
    } else {
      // Navigate back to dashboard for next quote
      await page.goto(PORTAL_URL, { waitUntil: "load", timeout: 10000 }).catch(() => {});
      touchPersistentSession();
    }
  }
}

// ── Home Quote ───────────────────────────────────────────────────────

export async function runNatGenHomeQuote(
  creds: PortalCredentials,
  lead: InsuranceLeadData,
  onProgress?: ProgressCallback,
  existingSession?: { browser: any; page: any }
): Promise<QuoteResult> {
  const { browser, page } = existingSession ?? await launchBrowser();

  try {
    // Step 1: Login (skip if already authenticated)
    if (!existingSession) {
      await onProgress?.("login");
      await login(page, creds);
      await delay(1500);
    }

    // Step 2: Dashboard — exact IDs from discovery
    await onProgress?.("search");
    console.log("[home-quote] Step 2: Dashboard — exact IDs...");

    const stateAbbrev = lead.state.length === 2 ? lead.state.toUpperCase() : lead.state;

    await page.selectOption(SEL.DASHBOARD.stateDropdown, stateAbbrev);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await delay(2000);

    const productValue = await page.evaluate((sel: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      if (!select || select.options.length === 0) return null;
      const custom360 = Array.from(select.options).find((o: any) =>
        o.text?.toLowerCase().includes("custom360") || o.text?.toLowerCase().includes("custom 360")
      );
      if (custom360) return custom360.value;
      const first = Array.from(select.options).find((o: any) => o.value && o.value !== "-Select-" && o.value !== "");
      return first?.value ?? null;
    }, SEL.DASHBOARD.productDropdown);

    if (productValue) {
      await page.selectOption(SEL.DASHBOARD.productDropdown, productValue);
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await delay(1000);
    }

    await page.click(SEL.DASHBOARD.beginButton);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await delay(2000);

    // Step 3: Client Search — exact IDs
    console.log("[home-quote] Step 3: Client Search...");
    await page.fill('#MainContent_txtFirstName', lead.firstName).catch(() => {});
    await page.fill('#MainContent_txtLastName', lead.lastName).catch(() => {});
    await page.fill('#MainContent_txtZipCode', lead.zip).catch(() => {});
    await page.click('#MainContent_btnSearch');
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await delay(2000);

    // Step 4: Add New Customer
    await page.click('#MainContent_btnAddNewClient').catch(async () => {
      await page.click('input[value="Add New Customer"]').catch(() => {});
    });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await delay(2000);

    // Step 5: Client Information form (same as auto — yellow required fields)
    await onProgress?.("client_info");
    console.log("[home-quote] Step 5: Client Information...");

    await fillFieldByLabelOrName(page, ["first name", "firstname", "FirstName"], lead.firstName);
    await fillFieldByLabelOrName(page, ["last name", "lastname", "LastName"], lead.lastName);
    await fillFieldByLabelOrName(page, ["date of birth", "dob", "dateofbirth", "DateOfBirth", "DOB"], formatDob(lead.dob));
    await selectByLabelOrName(page, ["gender", "Gender"], lead.gender || "Male");
    await selectByLabelOrName(page, ["marital", "maritalstatus", "MaritalStatus"], lead.maritalStatus || "Married");
    await selectByLabelOrName(page, ["occupation", "Occupation"], "Other");

    if (lead.phone) {
      await fillFieldByLabelOrName(page, ["phone", "Phone", "phonenumber", "PhoneNumber"], lead.phone);
    }
    if (lead.email) {
      await fillFieldByLabelOrName(page, ["email", "Email", "emailaddress", "EmailAddress"], lead.email);
      await fillFieldByLabelOrName(page, ["confirm email", "confirmemail", "ConfirmEmail"], lead.email);
    }

    await fillFieldByLabelOrName(page, ["street address 1", "streetaddress1", "StreetAddress1", "street1", "Street1", "address"], lead.street);
    await fillFieldByLabelOrName(page, ["city", "City"], lead.city);
    await fillFieldByLabelOrName(page, ["zip code", "zipcode", "ZipCode", "zip", "Zip"], lead.zip);
    await selectByLabelOrName(page, ["state", "State"], lead.state);

    await selectByLabelOrName(page, ["opt-in", "optin", "OptIn", "transactional"], "No").catch(() => {});
    await selectByLabelOrName(page, ["consent", "Consent"], "No").catch(() => {});

    await clickNextOrContinue(page);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await delay(2000);

    // Step 6: Property Information (Screenshot 6)
    await onProgress?.("property");
    console.log("[home-quote] Step 6: Property Information...");

    if (lead.property?.yearBuilt) {
      await fillFieldByLabelOrName(page, ["year built", "yearbuilt", "YearBuilt"], String(lead.property.yearBuilt));
    }
    if (lead.property?.sqft) {
      await fillFieldByLabelOrName(page, ["square feet", "sqft", "SquareFoot", "SqFt"], String(lead.property.sqft));
    }

    // Click through remaining pages to premium
    await onProgress?.("underwriting");
    for (let i = 0; i < 6; i++) {
      await clickNextOrContinue(page);
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await delay(1200);

      const onPremiumPage = await page.evaluate(() => {
        const text = (document.body as any).innerText.toLowerCase();
        return text.includes("premium summary") || text.includes("quote number") || text.includes("total premium");
      });
      if (onPremiumPage) break;
    }

    // Wait for results
    await onProgress?.("premium");
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
    if (PERSISTENT_SESSION?.browser !== browser) {
      await browser.close();
    } else {
      await page.goto(PORTAL_URL, { waitUntil: "load", timeout: 10000 }).catch(() => {});
      touchPersistentSession();
    }
  }
}

// ── Coverage Selection ─────────────────────────────────────────────

async function selectStandardCoverages(page: any): Promise<void> {
  const coverageMap: Array<[string[], string]> = [
    [["bodily injury", "bi limit", "bi_limit", "bodilyinjury"], STANDARD_AUTO_COVERAGES.bodilyInjury],
    [["property damage", "pd limit", "pd_limit", "propertydamage"], STANDARD_AUTO_COVERAGES.propertyDamage],
    [["uninsured", "um limit", "um_limit", "uninsuredmotorist"], STANDARD_AUTO_COVERAGES.uninsuredMotorist],
    [["comprehensive deductible", "comp deductible", "comp_ded", "comprehensiveded"], STANDARD_AUTO_COVERAGES.comprehensiveDeductible],
    [["collision deductible", "coll deductible", "coll_ded", "collisionded"], STANDARD_AUTO_COVERAGES.collisionDeductible],
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

// ── Selector-First Helpers ─────────────────────────────────────────────
// These use exact CSS selectors (from natgen-selectors.ts) as the primary
// lookup method, falling back to keyword matching only if selectors fail.

/**
 * Fill an input field using a comma-separated CSS selector string.
 * Tries each selector in order until one matches a visible element.
 * Returns true if a field was found and filled.
 */
async function _fillField(page: any, selectorString: string, value: string): Promise<boolean> {
  if (!value) return false;
  const selectors = selectorString.split(",").map((s) => s.trim());
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const visible = await el.isVisible().catch(() => false);
        if (visible) {
          await el.fill(value);
          await delay(100);
          return true;
        }
      }
    } catch { /* try next selector */ }
  }
  return false;
}

/**
 * Select a dropdown option using a comma-separated CSS selector string.
 * Tries by label first, then by value.
 * Returns true if an option was selected.
 */
async function _selectOption(page: any, selectorString: string, value: string): Promise<boolean> {
  if (!value) return false;
  const selectors = selectorString.split(",").map((s) => s.trim());
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      // Try by visible label text first
      try {
        await page.selectOption(sel, { label: value });
        await delay(100);
        return true;
      } catch { /* try by value */ }
      // Try by option value
      try {
        await page.selectOption(sel, value);
        await delay(100);
        return true;
      } catch { /* try partial match */ }
      // Try partial text match via evaluate
      const matched = await page.evaluate(
        ({ selector, val }: { selector: string; val: string }) => {
          const select = document.querySelector(selector) as HTMLSelectElement | null;
          if (!select) return false;
          const option = Array.from(select.options).find(
            (o) => o.text.toLowerCase().includes(val.toLowerCase()) ||
                   o.value.toLowerCase().includes(val.toLowerCase())
          );
          if (option) {
            select.value = option.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
          return false;
        },
        { selector: sel, val: value }
      );
      if (matched) return true;
    } catch { /* try next selector */ }
  }
  return false;
}

/**
 * Click a button/link using a comma-separated CSS selector string.
 * Returns true if clicked.
 */
async function clickButton(page: any, selectorString: string): Promise<boolean> {
  const selectors = selectorString.split(",").map((s) => s.trim());
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        return true;
      }
    } catch { /* try next selector */ }
  }
  return false;
}

// ── Legacy Keyword-Based Helpers (fallback) ───────────────────────────

async function fillFieldByLabelOrName(page: any, keywords: string[], value: string): Promise<void> {
  await page.evaluate(
    ({ kws, val }: { kws: string[]; val: string }) => {
      const inputs = Array.from(document.querySelectorAll("input, textarea"));
      const target = inputs.find((el: any) => {
        const name = (el.name ?? "").toLowerCase();
        const id = (el.id ?? "").toLowerCase();
        const placeholder = (el.placeholder ?? "").toLowerCase();
        const label = document.querySelector(`label[for="${el.id}"]`)?.textContent?.toLowerCase() ?? "";
        return kws.some((kw: string) =>
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
    { kws: keywords, val: value }
  );
  await delay(150);
}

async function selectByLabelOrName(page: any, keywords: string[], value: string): Promise<void> {
  await page.evaluate(
    ({ kws, val }: { kws: string[]; val: string }) => {
      const selects = Array.from(document.querySelectorAll("select"));
      const target = selects.find((el) => {
        const name = el.name.toLowerCase();
        const id = el.id.toLowerCase();
        const label = document.querySelector(`label[for="${el.id}"]`)?.textContent?.toLowerCase() ?? "";
        return kws.some((kw: string) => name.includes(kw) || id.includes(kw) || label.includes(kw));
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
    { kws: keywords, val: value }
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
