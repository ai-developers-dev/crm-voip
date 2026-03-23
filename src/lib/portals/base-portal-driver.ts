/**
 * Base Portal Driver — Generic flow engine for insurance carrier portal automation.
 *
 * Instead of writing 1700+ lines per carrier, define a PortalFlow configuration
 * and let this engine handle login, form filling, navigation, and premium scraping.
 *
 * Usage:
 *   import { runPortalFlow, PortalFlow } from './base-portal-driver';
 *   const result = await runPortalFlow(NATGEN_AUTO_FLOW, creds, lead, onProgress);
 */

import type { PortalCredentials, InsuranceLeadData, QuoteResult, ProgressCallback } from "./natgen-portal";

// ── Types ──────────────────────────────────────────────────────────────

export interface PortalField {
  /** CSS selector string (comma-separated fallbacks) */
  selector: string;
  /** Key in InsuranceLeadData to pull value from (e.g., "firstName", "state") */
  leadField: string;
  /** Field type determines how it's filled */
  type: "input" | "select" | "checkbox" | "radio";
  /** Default value if lead data is missing */
  defaultValue?: string;
  /** Whether this field must be filled for the form to submit */
  required?: boolean;
  /** Transform function name: "formatDob" converts YYYY-MM-DD to MM/DD/YYYY */
  transform?: "formatDob" | "uppercase" | "phoneDigitsOnly";
}

export interface PortalScreen {
  /** Human-readable screen name (for logging and progress) */
  name: string;
  /** Progress stage key to report (maps to QUOTE_STEPS in the UI) */
  progressStage?: string;
  /** CSS selector for sidebar link to navigate to this screen (optional — uses Next if not set) */
  sidebarLink?: string;
  /** Fields to fill on this screen */
  fields: PortalField[];
  /** CSS selector for the Next/Continue/Submit button */
  nextButton: string;
  /** Custom logic to run before filling fields (e.g., click "Add New Customer") */
  beforeFill?: string; // Selector to click before filling
  /** Custom logic to run after filling but before clicking Next */
  afterFill?: string; // Selector to click after filling
  /** How long to wait after clicking Next (ms) */
  waitAfterNext?: number;
}

export interface PremiumScrapeConfig {
  /** Regex pattern to extract quote number */
  quoteIdPattern?: string;
  /** Regex pattern to extract monthly premium */
  monthlyPattern?: string;
  /** Regex pattern to extract annual premium */
  annualPattern?: string;
  /** CSS selector for the premium summary container */
  containerSelector?: string;
}

export interface PortalFlow {
  /** Carrier name */
  carrier: string;
  /** Login URL */
  loginUrl: string;
  /** Ordered screens to navigate through */
  screens: PortalScreen[];
  /** How to extract the premium from the final screen */
  premiumScrape: PremiumScrapeConfig;
}

// ── Transform Functions ──────────────────────────────────────────────

function applyTransform(value: string, transform?: string): string {
  if (!transform) return value;
  switch (transform) {
    case "formatDob": {
      // YYYY-MM-DD → MM/DD/YYYY
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

// ── Field Value Resolver ─────────────────────────────────────────────

function getLeadValue(lead: InsuranceLeadData, fieldKey: string): string | undefined {
  // Support nested fields like "property.yearBuilt"
  const parts = fieldKey.split(".");
  let obj: any = lead;
  for (const part of parts) {
    if (obj == null) return undefined;
    obj = obj[part];
  }
  return obj != null ? String(obj) : undefined;
}

// ── Helpers (minimal — real implementations in natgen-portal.ts) ─────

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Types Export ─────────────────────────────────────────────────────

export type { PortalCredentials, InsuranceLeadData, QuoteResult, ProgressCallback };
