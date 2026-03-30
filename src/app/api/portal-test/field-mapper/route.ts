import { NextResponse } from "next/server";
import { convex } from "@/lib/convex/client";
import { auth } from "@clerk/nextjs/server";
import { loginForQuoting, cleanupQuoteSession, getQuoteSession } from "@/lib/portals/natgen-portal";
import type { PortalCredentials } from "@/lib/portals/natgen-portal";
import { api } from "../../../../../convex/_generated/api";
import { decrypt } from "@/lib/credentials/crypto";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const maxDuration = 300; // 5 min — keep browser open

// Store mapper sessions (browser stays open while user clicks fields)
interface SourceCapture {
  html: string;
  url: string;
  capturedAt: number;
}

interface MapperSession {
  browser: any;
  page: any;
  captures: any[];
  sources: Record<string, SourceCapture>; // screen name → { html, url, capturedAt }
  currentUrl: string;
  createdAt: number;
}
const MAPPER_SESSIONS = new Map<string, MapperSession>();

// Auto-close stale mapper sessions (browsers left open > 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of MAPPER_SESSIONS) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      session.browser?.close().catch(() => {});
      MAPPER_SESSIONS.delete(sid);
    }
  }
}, 60 * 1000); // Check every minute

/** Auto-capture cleaned page source for the current screen */
async function autoCapturePageSource(page: any, session: MapperSession) {
  try {
    const result = await page.evaluate(() => {
      // Don't capture login pages or error pages
      const text = document.body?.innerText?.toLowerCase() || "";
      if (text.includes("user id") && text.includes("sign in")) return null;
      if (text.includes("error has been detected")) return null;

      const clone = document.documentElement.cloneNode(true) as HTMLElement;
      // Remove noise
      clone.querySelectorAll("script, style, link, meta, noscript, #fieldMapperPanel").forEach((el) => el.remove());
      // Remove large hidden ASP.NET fields
      clone.querySelectorAll('input[type="hidden"]').forEach((el) => {
        const name = (el as HTMLInputElement).name?.toLowerCase() || "";
        if (name.includes("viewstate") || name.includes("eventvalidation") ||
            name.includes("previouspage") || name.includes("requestverification")) {
          el.remove();
        }
      });
      const mainContent = clone.querySelector("#contentBlock, #MainContent, [id*='MainContent'], main, form") || clone.querySelector("body");
      return {
        screenName: document.title || location.pathname.split("/").pop() || "unknown",
        html: (mainContent?.innerHTML || clone.innerHTML).slice(0, 200000),
        url: location.href,
      };
    });

    if (result) {
      session.sources[result.screenName] = {
        html: result.html,
        url: result.url,
        capturedAt: Date.now(),
      };
      console.log(`[mapper] Auto-captured source: "${result.screenName}" (${result.html.length} chars) ${result.url}`);
    }
  } catch {
    // Non-fatal — page may not be ready
  }
}

// Helper: set up capture push + injection for a page
async function setupFieldMapper(page: any, session: MapperSession) {
  // Expose a function the browser can call to push captures to the server
  // Only expose once — Playwright throws if you expose the same name twice
  try {
    await page.exposeFunction("__fieldMapperPush", (captureJson: string) => {
      try {
        const capture = JSON.parse(captureJson);

        // Handle manual page source captures (re-capture button)
        if (capture.tag === "page_source") {
          session.sources[capture.screen || "unknown"] = {
            html: capture.html,
            url: capture.url || "",
            capturedAt: Date.now(),
          };
          console.log(`[mapper] Manual source re-captured: ${capture.screen} (${(capture.html?.length || 0)} chars)`);
          return;
        }

        // Deduplicate by selector + screen (same button on different screens is NOT a duplicate)
        const dedupKey = `${capture.screen}::${capture.selector || capture.id || capture.name || ""}`;
        const exists = session.captures.some((c: any) => {
          const existKey = `${c.screen}::${c.selector || c.id || c.name || ""}`;
          return existKey === dedupKey && dedupKey !== `${capture.screen}::`;
        });
        if (!exists) {
          session.captures.push(capture);
        }
      } catch {}
    });
  } catch {
    // Already exposed from a previous call — that's fine
  }

  // Inject the capture script
  await injectMapperScript(page);

  // Re-inject on every navigation + auto-capture source
  page.on("load", async () => {
    try {
      session.currentUrl = page.url();
      await injectMapperScript(page);
      // Auto-capture page source after a short delay for DOM to settle
      setTimeout(async () => {
        await autoCapturePageSource(page, session);
      }, 2000);
    } catch {}
  });

  // Also capture the current page immediately
  await autoCapturePageSource(page, session);
}

async function injectMapperScript(page: any) {
  await page.evaluate(() => {
    // Don't inject twice on the same page
    if ((window as any).__fieldMapperActive) return;
    (window as any).__fieldMapperActive = true;

    // Create floating panel — positioned at bottom-left, narrow
    const panel = document.createElement("div");
    panel.id = "fieldMapperPanel";
    panel.innerHTML = `
      <div style="position:fixed;left:8px;bottom:8px;width:200px;background:#1a1a2e;
                  color:#eee;border-radius:8px;padding:8px;z-index:99999;font-family:system-ui;
                  font-size:10px;max-height:55vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.4);
                  border:1px solid #333;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-weight:700;font-size:11px;">🎯 Mapper</span>
          <div style="display:flex;gap:2px;">
            <button id="fmCaptureBtn" style="background:#4CAF50;border:none;color:white;padding:2px 6px;
                    border-radius:3px;cursor:pointer;font-size:9px;">
              ● Cap
            </button>
            <button id="fmNavigateBtn" style="background:#555;border:none;color:white;padding:2px 6px;
                    border-radius:3px;cursor:pointer;font-size:9px;">
              Nav
            </button>
            <button id="fmSourceBtn" style="background:#9C27B0;border:none;color:white;padding:2px 6px;
                    border-radius:3px;cursor:pointer;font-size:9px;">
              Src
            </button>
          </div>
        </div>
        <div style="background:#252540;padding:4px 6px;border-radius:4px;margin-bottom:6px;font-size:9px;color:#aaa;line-height:1.3;">
          <b style="color:#4CAF50;">Cap:</b> Click to record<br>
          <b style="color:#2196F3;">Nav:</b> Fill forms, Next
        </div>
        <div id="fmScreenLabel" style="font-size:9px;color:#888;margin-bottom:4px;">
          <span id="fmScreenName" style="color:#fff;font-size:10px;">${document.title || location.pathname}</span>
        </div>
        <div id="fmCaptureList" style="margin-bottom:4px;"></div>
        <div id="fmStatus" style="margin-top:4px;font-size:9px;color:#4CAF50;"></div>
      </div>
    `;
    document.body.appendChild(panel);

    let captureMode = true;
    let captureCount = 0;

    // Mode toggle buttons
    document.getElementById("fmCaptureBtn")!.onclick = () => {
      captureMode = true;
      document.getElementById("fmCaptureBtn")!.style.background = "#4CAF50";
      document.getElementById("fmNavigateBtn")!.style.background = "#555";
      document.getElementById("fmStatus")!.textContent = "Capture mode — click fields to record";
    };
    document.getElementById("fmNavigateBtn")!.onclick = () => {
      captureMode = false;
      document.getElementById("fmNavigateBtn")!.style.background = "#2196F3";
      document.getElementById("fmCaptureBtn")!.style.background = "#555";
      document.getElementById("fmStatus")!.textContent = "Navigate mode — fill forms normally";
    };

    // Source button — captures cleaned HTML of the current page
    document.getElementById("fmSourceBtn")!.onclick = () => {
      const statusEl = document.getElementById("fmStatus")!;
      statusEl.textContent = "Capturing page source...";
      statusEl.style.color = "#9C27B0";

      // Build cleaned HTML: keep form elements, tables, labels — strip scripts, viewstate, etc.
      const clone = document.documentElement.cloneNode(true) as HTMLElement;

      // Remove noise
      clone.querySelectorAll("script, style, link, meta, noscript, #fieldMapperPanel").forEach((el) => el.remove());

      // Remove large hidden ASP.NET fields (ViewState, etc.)
      clone.querySelectorAll('input[type="hidden"]').forEach((el) => {
        const name = (el as HTMLInputElement).name?.toLowerCase() || "";
        if (name.includes("viewstate") || name.includes("eventvalidation") || name.includes("previouspage") || name.includes("requestverification")) {
          el.remove();
        }
      });

      // Get the cleaned HTML
      const mainContent = clone.querySelector("#MainContent, [id*='MainContent'], main, form") || clone.querySelector("body");
      const html = mainContent?.innerHTML || clone.innerHTML;

      // Push to server
      try {
        (window as any).__fieldMapperPush(JSON.stringify({
          tag: "page_source",
          screen: document.title || location.pathname,
          html: html.slice(0, 200000), // Cap at 200KB
        }));
        statusEl.textContent = `✓ Source captured for "${document.title || location.pathname}"`;
        statusEl.style.color = "#4CAF50";
      } catch (err) {
        statusEl.textContent = "Failed to capture source";
        statusEl.style.color = "#f44336";
      }
    };

    // Find label for an element
    function findLabel(el: HTMLElement): string | null {
      if ((el as any).id) {
        const label = document.querySelector('label[for="' + (el as any).id + '"]');
        if (label) return label.textContent!.trim().replace(/\*/g, "").trim().slice(0, 50);
      }
      const parentLabel = el.closest("label");
      if (parentLabel) return parentLabel.textContent!.trim().replace(/\*/g, "").trim().slice(0, 50);
      const prev = el.previousElementSibling;
      if (prev && prev.tagName !== "INPUT" && prev.tagName !== "SELECT") {
        const text = prev.textContent?.trim();
        if (text && text.length < 50) return text.replace(/\*/g, "").trim();
      }
      // NatGen uses tables — check previous TD
      const td = el.closest("td");
      if (td) {
        const prevTd = td.previousElementSibling;
        if (prevTd) {
          const text = prevTd.textContent?.trim();
          if (text && text.length < 60) return text.replace(/\*/g, "").trim();
        }
      }
      return null;
    }

    // Hover highlight
    let lastHighlighted: HTMLElement | null = null;
    document.addEventListener("mouseover", (e) => {
      if (!captureMode) return;
      const el = e.target as HTMLElement;
      const isFormEl = ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(el.tagName);
      if (isFormEl && (el as any).type !== "hidden") {
        if (lastHighlighted && lastHighlighted !== el) {
          lastHighlighted.style.outline = (lastHighlighted as any).__origOutline || "";
        }
        if (!(el as any).__origOutline) (el as any).__origOutline = el.style.outline;
        el.style.outline = "3px solid #2196F3";
        lastHighlighted = el;
      }
    }, true);

    document.addEventListener("mouseout", (e) => {
      if (!captureMode) return;
      const el = e.target as HTMLElement;
      if (lastHighlighted === el) {
        el.style.outline = (el as any).__origOutline || "";
        lastHighlighted = null;
      }
    }, true);

    // Helper: push a capture to server + show in local panel
    function pushCapture(el: HTMLElement) {
      const inputEl = el as HTMLInputElement | HTMLSelectElement;
      const selEl = el as HTMLSelectElement;
      const isButton = el.tagName === "BUTTON" || el.tagName === "A" ||
        (el.tagName === "INPUT" && ["submit", "button"].includes((el as HTMLInputElement).type));
      const selectedOption = el.tagName === "SELECT" && selEl.selectedIndex >= 0
        ? selEl.options[selEl.selectedIndex]
        : null;

      // For buttons/links, get the visible text
      const buttonText = isButton
        ? (el.textContent?.trim() || (el as HTMLInputElement).value || "").slice(0, 60)
        : null;

      // Build selector — for buttons try id first, then text-based
      let selector: string | null = null;
      if (inputEl.id) {
        selector = "#" + inputEl.id;
      } else if (inputEl.getAttribute("name")) {
        selector = '[name="' + inputEl.getAttribute("name") + '"]';
      } else if (isButton && buttonText) {
        // Use text-based selector for buttons without id/name
        selector = `${el.tagName.toLowerCase()}:has-text("${buttonText.slice(0, 30)}")`;
      }

      const capture = {
        tag: el.tagName.toLowerCase(),
        id: inputEl.id || null,
        name: inputEl.getAttribute("name") || null,
        type: isButton ? "button" : (inputEl.getAttribute("type") || (el.tagName === "SELECT" ? "select" : "text")),
        label: isButton ? (buttonText || findLabel(el)) : findLabel(el),
        selector,
        selectedValue: el.tagName === "SELECT"
          ? selEl.value
          : isButton ? null : ((inputEl as HTMLInputElement).value || null),
        selectedText: selectedOption ? selectedOption.textContent?.trim() : null,
        options: el.tagName === "SELECT"
          ? Array.from(selEl.options).map((o) => ({ value: o.value, text: o.textContent?.trim() || "" }))
          : undefined,
        screen: document.title || location.pathname,
        capturedAt: new Date().toISOString(),
      };

      try {
        (window as any).__fieldMapperPush(JSON.stringify(capture));
      } catch (err) {
        console.error("[FieldMapper] push failed:", err);
      }

      captureCount++;
      el.style.outline = "3px solid #4CAF50";
      setTimeout(() => { el.style.outline = (el as any).__origOutline || ""; }, 500);

      const statusEl = document.getElementById("fmStatus");
      if (statusEl) statusEl.textContent = captureCount + " fields captured on this screen";

      const list = document.getElementById("fmCaptureList");
      if (list) {
        const item = document.createElement("div");
        item.style.cssText = "background:#252540;padding:4px 6px;border-radius:3px;margin-bottom:3px;" +
          "border-left:2px solid " + (capture.tag === "select" ? "#FF9800" : "#4CAF50") + ";";
        const valueDisplay = capture.selectedValue
          ? '<div style="color:#9C27B0;font-size:8px;margin-top:1px;">Sel: ' +
            (capture.selectedText || capture.selectedValue) + "</div>"
          : "";
        item.innerHTML = `
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#fff;font-weight:600;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px;">${capture.label || capture.id || "(unlabeled)"}</span>
            <span style="color:#888;font-size:8px;">${capture.tag}/${capture.type}</span>
          </div>
          <div style="color:#4CAF50;font-family:monospace;font-size:8px;margin-top:1px;word-break:break-all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${capture.selector}
          </div>
          ${valueDisplay}
          ${capture.options ? '<div style="color:#FF9800;font-size:10px;margin-top:2px;">' + capture.options.length + " options</div>" : ""}
        `;
        list.appendChild(item);
      }
    }

    // For SELECT elements: let dropdown open normally, capture on change
    const capturedSelects = new Set<string>();
    document.addEventListener("change", (e) => {
      if (!captureMode) return;
      const el = e.target as HTMLElement;
      if (el.tagName !== "SELECT") return;
      if (el.closest("#fieldMapperPanel")) return;

      const key = (el as HTMLSelectElement).id || (el as HTMLSelectElement).name;
      capturedSelects.add(key);
      pushCapture(el);
    }, true);

    // Click capture — INPUT, TEXTAREA, BUTTON, A (links), and submit inputs
    document.addEventListener("click", (e) => {
      if (!captureMode) return;

      let el = e.target as HTMLElement;
      // Skip selects — they're handled by `change` event above
      if (el.tagName === "SELECT") return;
      if (el.closest("#fieldMapperPanel")) return;

      // For buttons: also check if we clicked a child element (span inside a button)
      if (!["INPUT", "TEXTAREA", "BUTTON", "A"].includes(el.tagName)) {
        const parent = el.closest("button, a, input[type='submit'], input[type='button']") as HTMLElement | null;
        if (parent) el = parent;
        else return; // Not a capturable element
      }

      // Skip hidden inputs
      if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "hidden") return;

      // For regular inputs/textareas: prevent default to avoid interaction
      // For buttons/links: also prevent to avoid navigation
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      pushCapture(el);
      return false;
    }, true);

    document.getElementById("fmStatus")!.textContent = "Ready — click form fields to capture";
  });
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, organizationId, carrierId, sessionId } = body;

    // ── Start mapper ──────────────────────────────────────────────
    if (action === "start") {
      if (!organizationId || !carrierId) {
        return NextResponse.json({ error: "organizationId and carrierId required" }, { status: 400 });
      }

      // Get credentials
      const carriers = await convex.query(api.tenantCommissions.getCarriersWithCredentials, {
        organizationId: organizationId as Id<"organizations">,
      });
      const carrier = carriers.find((c: any) => c.carrierId === carrierId);
      if (!carrier) {
        return NextResponse.json({ error: "No credentials found for this carrier" }, { status: 400 });
      }

      const creds: PortalCredentials = {
        username: decrypt(carrier.portalUsername, organizationId),
        password: decrypt(carrier.portalPassword, organizationId),
        portalUrl: carrier.portalUrl || undefined,
      };

      // Login
      const loginResult = await loginForQuoting(creds, undefined, convex, { visible: true });

      if (loginResult.status === "needs_2fa") {
        return NextResponse.json({
          status: "needs_2fa",
          sessionId: loginResult.sessionId,
          message: loginResult.message,
        });
      }

      if (loginResult.status === "error") {
        return NextResponse.json({ error: loginResult.message }, { status: 400 });
      }

      const { browser, page } = loginResult;
      const sid = crypto.randomUUID();
      const session: MapperSession = {
        browser,
        page,
        captures: [],
        sources: {},
        currentUrl: page.url(),
        createdAt: Date.now(),
      };
      MAPPER_SESSIONS.set(sid, session);

      // Set up capture push + script injection
      await setupFieldMapper(page, session);

      return NextResponse.json({
        status: "started",
        sessionId: sid,
        message: "Browser is open with Field Mapper injected. Click fields to capture selectors.",
      });
    }

    // ── Get captures (reads from server-side array) ────────────────
    if (action === "get_captures" && sessionId) {
      const session = MAPPER_SESSIONS.get(sessionId);
      if (!session) {
        return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
      }

      // Read current URL from page
      let currentUrl = session.currentUrl;
      try {
        currentUrl = session.page.url();
        session.currentUrl = currentUrl;
      } catch {}

      // Convert sources to simple format for the dialog (just screen name → exists)
      const sourceScreens = Object.fromEntries(
        Object.entries(session.sources).map(([name, s]) => [name, (s as SourceCapture).html ? true : !!s])
      );

      return NextResponse.json({
        captures: session.captures,
        sources: session.sources,
        sourceScreens, // simplified: { "Client Information": true, "Quote Prefill": true }
        currentUrl,
        count: session.captures.length,
        sourceCount: Object.keys(session.sources).length,
      });
    }

    // ── Stop mapper ───────────────────────────────────────────────
    if (action === "stop" && sessionId) {
      const session = MAPPER_SESSIONS.get(sessionId);
      if (session) {
        const finalCaptures = [...session.captures];
        await session.browser.close().catch(() => {});
        MAPPER_SESSIONS.delete(sessionId);

        return NextResponse.json({
          status: "stopped",
          captures: finalCaptures,
          count: finalCaptures.length,
        });
      }
      return NextResponse.json({ status: "not_found" });
    }

    // ── Resume after 2FA ──────────────────────────────────────────
    if (action === "resume_2fa" && sessionId && body.code) {
      const { completeQuoting2FA } = await import("@/lib/portals/natgen-portal");
      const result = await completeQuoting2FA(sessionId, body.code, convex);

      if (result.status !== "logged_in") {
        return NextResponse.json(result);
      }

      const { browser, page } = result;
      const sid = crypto.randomUUID();
      const session: MapperSession = {
        browser,
        page,
        captures: [],
        sources: {},
        currentUrl: page.url(),
        createdAt: Date.now(),
      };
      MAPPER_SESSIONS.set(sid, session);

      await setupFieldMapper(page, session);

      return NextResponse.json({
        status: "started",
        sessionId: sid,
        message: "2FA complete. Field Mapper injected.",
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[field-mapper]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
