/**
 * Mapping-Driven Quote Runner v2
 *
 * Runs insurance quotes using saved field mappings from portalFieldMappings.
 * Handles ASP.NET postbacks, dependent dropdowns, radio buttons, batch fills,
 * and all the quirks of carrier portals like National General.
 *
 * Flow: Load mappings → Login → Iterate screens → Fill/Act → Next → Scrape premium
 */

import type { ConvexHttpClient } from "convex/browser";
import type { InsuranceLeadData, PortalCredentials, ProgressCallback } from "./natgen-portal";
import { loginForQuoting } from "./natgen-portal";

export type QuoteResult = {
  carrier: string;
  quoteId?: string;
  monthlyPremium?: number;
  annualPremium?: number;
  coverageDetails?: string;
  error?: string;
  success?: boolean;
};

// ── Helpers ─────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function applyTransform(value: string, transform?: string): string {
  if (!transform) return value;
  switch (transform) {
    case "formatDob": {
      const [y, m, d] = value.split("-");
      return y && m && d ? `${m}/${d}/${y}` : value;
    }
    case "uppercase":
      return value.toUpperCase();
    case "phoneDigitsOnly":
      return value.replace(/\D/g, "");
    default:
      return value;
  }
}

/** Resolve a field's value from lead data, defaults, or selected value */
function resolveFieldValue(field: any, lead: InsuranceLeadData): string | undefined {
  if (field.contactField) {
    const key = field.contactField;

    // Auto-generated values
    if (key.startsWith("auto.")) {
      const autoKey = key.replace("auto.", "");
      if (autoKey === "effectiveDate") {
        const now = new Date();
        return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
      }
      return undefined;
    }

    // Lead-prefixed fields
    if (key.startsWith("lead.")) {
      return (lead as any)[key.replace("lead.", "")] ?? undefined;
    }

    // Phone parts — split from lead.phone
    if (key === "phoneAreaCode" && lead.phone) return lead.phone.replace(/\D/g, "").slice(0, 3);
    if (key === "phonePrefix" && lead.phone) return lead.phone.replace(/\D/g, "").slice(3, 6);
    if (key === "phoneLineNumber" && lead.phone) return lead.phone.replace(/\D/g, "").slice(6, 10);
    if (key === "phoneType") return "Mobile"; // default phone type

    // Direct lead field
    return (lead as any)[key] ?? undefined;
  }

  if (field.defaultValue) return field.defaultValue;
  if (field.selectedValue) return field.selectedValue;
  return undefined;
}

// ── Field Interaction ───────────────────────────────────────────────────

/** Fill a text input using Playwright, with evaluate fallback */
async function fillField(page: any, selector: string, value: string): Promise<boolean> {
  if (!value || !selector) return false;
  // Try comma-separated selectors
  const selectors = selector.split(",").map((s) => s.trim());
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;
      await el.fill(value);
      await delay(50);
      return true;
    } catch {}
  }
  // Fallback: evaluate
  try {
    return await page.evaluate(
      ({ sels, val }: { sels: string[]; val: string }) => {
        for (const sel of sels) {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          if (!el) continue;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          if (setter) setter.call(el, val); else el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
        return false;
      },
      { sels: selectors, val: value },
    );
  } catch { return false; }
}

/** Select a dropdown option — supports comma-separated selectors */
async function selectDropdown(page: any, selector: string, value: string): Promise<boolean> {
  if (!value || !selector) return false;
  const selectors = selector.split(",").map((s) => s.trim());
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      // Try by value, then label, then partial match
      try { await page.selectOption(sel, value); return true; } catch {}
      try { await page.selectOption(sel, { label: value }); return true; } catch {}
      // Evaluate fallback with partial match
      const matched = await page.evaluate(
        ({ s, v }: { s: string; v: string }) => {
          const select = document.querySelector(s) as HTMLSelectElement | null;
          if (!select) return false;
          const opt = Array.from(select.options).find(
            (o) => o.value === v || o.text === v ||
              o.text.toLowerCase().includes(v.toLowerCase()) ||
              o.value.toLowerCase().includes(v.toLowerCase())
          );
          if (opt) {
            select.value = opt.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
          return false;
        },
        { s: sel, v: value },
      );
      if (matched) return true;
    } catch {}
  }
  return false;
}

/** Select dropdown and trigger ASP.NET __doPostBack */
async function selectWithPostback(page: any, selector: string, value: string): Promise<boolean> {
  const selectors = selector.split(",").map((s) => s.trim());
  for (const sel of selectors) {
    try {
      const result = await page.evaluate(
        ({ s, v }: { s: string; v: string }) => {
          const select = document.querySelector(s) as HTMLSelectElement | null;
          if (!select) return null;
          const opt = Array.from(select.options).find(
            (o) => o.value === v || o.text === v ||
              o.text.toLowerCase().includes(v.toLowerCase())
          );
          if (opt) {
            select.value = opt.value;
            // Get the ASP.NET name for __doPostBack
            const name = select.getAttribute("name");
            if (name && typeof (window as any).__doPostBack === "function") {
              (window as any).__doPostBack(name, "");
              return "postback";
            }
            select.dispatchEvent(new Event("change", { bubbles: true }));
            return "change";
          }
          return null;
        },
        { s: sel, v: value },
      );
      if (result) {
        // Wait for postback to complete
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await delay(2000);
        return true;
      }
    } catch {}
  }
  return false;
}

/** Click a button/link — supports comma-separated selectors */
async function clickButton(page: any, selector: string): Promise<boolean> {
  if (!selector) return false;
  const selectors = selector.split(",").map((s) => s.trim());
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) { await el.click(); return true; }
    } catch {}
  }
  return false;
}

/** Click Next/Continue — generic fallback */
async function clickNextOrContinue(page: any): Promise<boolean> {
  const selectors = [
    "#MainContent_btnContinue",
    'input[value="Next"]', 'input[value="Continue"]',
    'button:has-text("Next")', 'button:has-text("Continue")',
    'a:has-text("Next")', 'a:has-text("Continue")',
  ];
  for (const sel of selectors) {
    if (await clickButton(page, sel)) return true;
  }
  return false;
}

/** Click a radio button by selector */
async function clickRadio(page: any, selector: string): Promise<boolean> {
  if (!selector) return false;
  try {
    const el = await page.$(selector);
    if (el) { await el.click(); return true; }
  } catch {}
  // Fallback: evaluate
  try {
    return await page.evaluate((sel: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (el) { el.checked = true; el.click(); return true; }
      return false;
    }, selector);
  } catch { return false; }
}

// ── Screen Action Handlers ──────────────────────────────────────────────

async function actionRejectAllDrivers(page: any): Promise<void> {
  console.log("[runner] Action: Reject all additional drivers");
  try {
    await page.click("#MainContent_ucPrefillDriver_btnRejectAllDrivers");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await delay(2000);
  } catch {
    // Fallback: manually set each dropdown
    const driverSelects = await page.evaluate(() =>
      Array.from(document.querySelectorAll("select.driverStatus"))
        .filter((sel) => !(sel as HTMLSelectElement).disabled)
        .map((sel) => (sel as HTMLSelectElement).getAttribute("name") || "")
    );
    for (const name of driverSelects) {
      await page.evaluate((n: string) => {
        const sel = document.querySelector(`select[name="${n}"]`) as HTMLSelectElement | null;
        if (!sel) return;
        const opt = Array.from(sel.options).find((o) => o.value === "R");
        if (opt) {
          sel.value = opt.value;
          setTimeout(() => (window as any).__doPostBack(n, ""), 0);
        }
      }, name);
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await delay(1000);
    }
  }

  // Set ALL rejection reason dropdowns (they appear after postback)
  await delay(1000);
  await page.evaluate(() => {
    const allSelects = Array.from(document.querySelectorAll("select"));
    const reasonDropdowns = allSelects.filter((sel) =>
      sel.getAttribute("name")?.toLowerCase().includes("rejectionreason") ||
      Array.from(sel.options).some((o) => o.text.toLowerCase().includes("unknown to"))
    );
    for (const sel of reasonDropdowns) {
      const opt = Array.from(sel.options).find((o) =>
        o.text.toLowerCase().includes("unknown to the insured") ||
        o.text.toLowerCase().includes("unknown to insured")
      );
      if (opt) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  });
  await delay(500);
}

async function actionAcceptFirstVehicle(page: any): Promise<void> {
  console.log("[runner] Action: Accept first vehicle, reject others");
  await page.evaluate(() => {
    const vehicleTable = document.getElementById("gvPrefillAuto");
    if (!vehicleTable) return;
    const rows = Array.from(vehicleTable.querySelectorAll("tr")).slice(1);
    rows.forEach((row, idx) => {
      const acceptRadio = row.querySelector('span.autoAccept input[type="radio"]') as HTMLInputElement | null;
      const rejectRadio = row.querySelector('span.autoReject input[type="radio"]') as HTMLInputElement | null;
      if (idx === 0 && acceptRadio) { acceptRadio.checked = true; acceptRadio.click(); }
      else if (rejectRadio) { rejectRadio.checked = true; rejectRadio.click(); }
    });
  });
  await delay(500);
}

async function actionSelectCoverages(page: any): Promise<void> {
  console.log("[runner] Action: Select standard coverages");
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll("select"));
    function pickOption(sel: HTMLSelectElement, keyword: string) {
      const opt = Array.from(sel.options).find((o) => o.text.toLowerCase().includes(keyword.toLowerCase()));
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    for (const sel of selects) {
      const label = sel.closest("li, tr, div")?.querySelector("label")?.textContent?.toLowerCase() || "";
      const id = sel.id.toLowerCase();
      if (label.includes("bodily injury") || id.includes("bodilyinjury")) pickOption(sel, "100/300");
      else if (label.includes("property damage") || id.includes("propertydamage")) pickOption(sel, "50,000");
      else if (label.includes("uninsured") || id.includes("uninsured")) pickOption(sel, "100/300");
      else if ((label.includes("comprehensive") && label.includes("deductible")) || id.includes("compdeductible")) pickOption(sel, "500");
      else if ((label.includes("collision") && label.includes("deductible")) || id.includes("colldeductible")) pickOption(sel, "1000");
    }
  });
  await delay(500);
}

async function actionScrapePremium(page: any): Promise<QuoteResult> {
  console.log("[runner] Action: Scrape premium");
  try {
    await page.waitForFunction(
      () => {
        const text = (document.body as any).innerText.toLowerCase();
        return text.includes("premium") || text.includes("per month") ||
          text.includes("quote number") || text.includes("your quote") ||
          text.includes("estimated rate") || text.includes("/mo") || text.includes("/yr");
      },
      undefined,
      { timeout: 45000 },
    );
  } catch {
    await clickNextOrContinue(page);
    await delay(3000);
  }
  await delay(1000);

  const result = await page.evaluate(() => {
    const body = (document.body as any).innerText;
    const quoteMatch = body.match(/quote\s*(#|number|no\.?)\s*:?\s*([A-Z0-9\-]+)/i);
    const monthlyMatch = body.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:\/\s*mo|per\s*month|monthly)/i);
    const annualMatch = body.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:\/\s*yr|per\s*year|annual|annually)/i);
    const coverageLines: string[] = [];
    for (const line of body.split("\n")) {
      const l = line.toLowerCase();
      if ((l.includes("bodily") || l.includes("property damage") || l.includes("uninsured") ||
        l.includes("comprehensive") || l.includes("collision") || l.includes("deductible")) &&
        line.trim().length > 5 && line.trim().length < 150) {
        coverageLines.push(line.trim());
      }
    }
    return { quoteId: quoteMatch?.[2] ?? null, monthly: monthlyMatch ? parseFloat(monthlyMatch[1].replace(/,/g, "")) : null, annual: annualMatch ? parseFloat(annualMatch[1].replace(/,/g, "")) : null, coverageLines, fullText: body.slice(0, 2000) };
  });

  return {
    carrier: "auto", success: !!(result.quoteId || result.monthly),
    quoteId: result.quoteId || undefined,
    monthlyPremium: result.monthly ?? undefined,
    annualPremium: result.annual ?? undefined,
    coverageDetails: result.coverageLines.join("\n") || result.fullText.slice(0, 500),
  };
}

/** Batch fill using page.evaluate — reads field mappings and fills ALL at once */
async function actionBatchFill(page: any, lead: InsuranceLeadData, fields: any[]): Promise<void> {
  console.log(`[runner] Action: Batch fill ${fields.length} fields`);

  // Build a data map from field mappings
  const fieldData: Array<{ selector: string; value: string; tag: string }> = [];
  for (const field of fields) {
    if (field.type === "button" || field.type === "submit") continue;
    const rawValue = resolveFieldValue(field, lead);
    if (!rawValue) continue;
    const value = applyTransform(rawValue, field.transform);
    fieldData.push({ selector: field.selector, value, tag: field.tag });
  }

  await page.evaluate((data: Array<{ selector: string; value: string; tag: string }>) => {
    function setVal(sel: string, val: string) {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el || !val) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(el, val); else el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function setSel(sel: string, val: string) {
      const el = document.querySelector(sel) as HTMLSelectElement | null;
      if (!el || !val) return;
      const opt = Array.from(el.options).find(
        (o) => o.value === val || o.text === val || o.text.toLowerCase().includes(val.toLowerCase())
      );
      if (opt) el.value = opt.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    for (const { selector, value, tag } of data) {
      if (tag === "select") setSel(selector, value);
      else setVal(selector, value);
    }
  }, fieldData);
  await delay(300);
}

/** Click "Add New Customer" after search */
async function actionClickAddNewCustomer(page: any): Promise<void> {
  console.log("[runner] Action: Click Add New Customer");
  try {
    await page.click("#MainContent_btnAddNewClient");
  } catch {
    await page.click('input[value="Add New Customer"]').catch(() => {});
  }
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await delay(2000);
}

// Action registry
const ACTION_HANDLERS: Record<string, (page: any, lead: InsuranceLeadData, fields?: any[]) => Promise<any>> = {
  reject_all_drivers: (page, lead) => actionRejectAllDrivers(page),
  accept_first_vehicle: (page, lead) => actionAcceptFirstVehicle(page),
  select_standard_coverages: (page, lead) => actionSelectCoverages(page),
  scrape_premium: (page, lead) => actionScrapePremium(page),
  fill_batch: (page, lead, fields) => actionBatchFill(page, lead, fields || []),
  click_add_new_customer: (page, lead) => actionClickAddNewCustomer(page),
};

// ── Main Runner ─────────────────────────────────────────────────────────

export async function runQuoteFromMappings(
  creds: PortalCredentials,
  lead: InsuranceLeadData,
  mappingId: string,
  convex: ConvexHttpClient,
  onProgress?: ProgressCallback,
  existingSession?: { browser: any; page: any },
): Promise<QuoteResult> {
  const { api } = await import("../../../convex/_generated/api");
  const mapping = await convex.query(api.portalFieldMappings.getById, { mappingId: mappingId as any });
  if (!mapping || !mapping.screens?.length) {
    return { carrier: "unknown", error: "No field mappings found" };
  }

  const screens = [...mapping.screens].sort((a, b) => a.order - b.order);
  console.log(`[runner] Loaded ${screens.length} screens for ${mapping.quoteType} quote`);

  // Login
  let browser: any, page: any;
  if (existingSession) {
    browser = existingSession.browser;
    page = existingSession.page;
  } else {
    const loginResult = await loginForQuoting(creds, onProgress, convex);
    if (loginResult.status !== "logged_in") {
      return { carrier: "unknown", error: `Login failed: ${(loginResult as any).message}` };
    }
    browser = loginResult.browser;
    page = loginResult.page;
  }

  let premiumResult: QuoteResult | null = null;

  try {
    for (let si = 0; si < screens.length; si++) {
      const screen = screens[si];
      console.log(`[runner] ── Screen ${si + 1}/${screens.length}: ${screen.name} (action: ${screen.action || "fill"}) ──`);
      await onProgress?.(screen.progressStage || screen.name);

      // Navigate via sidebar if available
      if (screen.sidebarLink) {
        const navigated = await clickButton(page, screen.sidebarLink);
        if (navigated) {
          await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
          await delay(1500);
        }
      }

      // ── Execute screen action if defined ──────────────────────────
      if (screen.action) {
        if (screen.action === "scrape_premium") {
          premiumResult = await actionScrapePremium(page);
          continue; // Don't click Next on premium page
        }

        if (screen.action === "fill_batch") {
          // Batch fill using this screen's mapped fields
          await actionBatchFill(page, lead, screen.fields);
        } else if (ACTION_HANDLERS[screen.action]) {
          await ACTION_HANDLERS[screen.action](page, lead, screen.fields);
        }

        // For action screens that also have fields (like prefill with drivers + vehicles)
        // the action handles everything, so skip individual field filling
      } else {
        // ── Generic field-by-field filling ───────────────────────────
        // Separate fields into: postback-triggering selects, regular selects, inputs, buttons
        const postbackSelects = screen.fields.filter((f: any) => f.tag === "select" && f.type !== "button");
        const inputFields = screen.fields.filter((f: any) => f.tag !== "select" && f.type !== "button" && f.type !== "submit");
        const buttons = screen.fields.filter((f: any) => f.type === "button" || f.type === "submit");

        // Fill selects FIRST (they may trigger postbacks that populate other fields)
        for (const field of postbackSelects) {
          const rawValue = resolveFieldValue(field, lead);
          if (!rawValue) continue;
          const value = applyTransform(rawValue, field.transform);

          // Check if this field has an onchange postback (ASP.NET pattern)
          const hasPostback = await page.evaluate((sel: string) => {
            const el = document.querySelector(sel) as HTMLSelectElement | null;
            return el?.getAttribute("onchange")?.includes("__doPostBack") || false;
          }, field.selector).catch(() => false);

          if (hasPostback) {
            console.log(`[runner] Select with postback: ${field.selector} → ${value}`);
            await selectWithPostback(page, field.selector, value);
          } else {
            await selectDropdown(page, field.selector, value);
          }
        }

        // Then fill inputs (after postbacks have completed)
        for (const field of inputFields) {
          if (field.tag === "input" && field.type === "radio") {
            // Radio buttons need .click()
            await clickRadio(page, field.selector);
          } else {
            const rawValue = resolveFieldValue(field, lead);
            if (!rawValue) continue;
            const value = applyTransform(rawValue, field.transform);
            await fillField(page, field.selector, value);
          }
        }
      }

      // ── Click Next button ─────────────────────────────────────────
      if (screen.action === "scrape_premium") continue; // already handled

      if (screen.nextButton) {
        await clickButton(page, screen.nextButton);
      } else {
        await clickNextOrContinue(page);
      }
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await delay(screen.waitAfterNext || 2000);
    }

    // If no explicit scrape_premium, try scraping from current page
    if (!premiumResult) {
      premiumResult = await actionScrapePremium(page);
    }

    return premiumResult;
  } catch (err: any) {
    console.error("[runner] Error:", err);
    return { carrier: "unknown", error: err.message };
  }
}
