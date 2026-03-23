# Insurance Portal Quoting — Architecture & Knowledge Base

## Overview

Automated insurance quoting that logs into carrier portals (starting with National General), fills out multi-page quote forms, and extracts premiums. Built with Playwright for browser automation, Convex for data persistence, and Next.js API routes for orchestration.

---

## Architecture

### Quote Flow

```
User clicks "Submit for Quote"
  → QuotePanel (quote-panel.tsx)
    → Creates InsuranceLead in Convex
    → POST /api/quotes/run-agent
      → loginForQuoting() — authenticate to portal
      → runNatGenAutoQuote() — navigate pages, fill forms
      → Save QuoteResult to insuranceQuotes table
      → Save drivers/vehicles/priorInsurance to contact
```

### File Map

| File | Purpose |
|------|---------|
| `src/components/contacts/panels/quote-panel.tsx` | UI: carrier selection, submit, status display |
| `src/app/api/quotes/run-agent/route.ts` | API: orchestrates login + quoting + data save |
| `src/lib/portals/natgen-portal.ts` | Core: NatGen login, page automation, premium scraping |
| `src/lib/portals/natgen-selectors.ts` | CSS selectors for NatGen ASP.NET elements |
| `src/lib/portals/mapping-driven-runner.ts` | Generic runner using saved field mappings |
| `src/components/settings/field-mapper-dialog.tsx` | Interactive field mapper UI |
| `src/app/api/portal-test/field-mapper/route.ts` | Field mapper API (browser + capture script) |
| `src/components/admin/platform-field-mapper.tsx` | Platform admin: mapper + saved mappings view |
| `convex/portalFieldMappings.ts` | Saved field mappings CRUD |
| `convex/portalPageSources.ts` | Saved page source HTML per screen |
| `convex/contacts.ts` | Contact mutations (updatePriorInsurance, updateDriversAndVehicles) |

### Key Interfaces

```typescript
// What the quote automation returns
interface QuoteResult {
  success: boolean;
  quoteId?: string;
  monthlyPremium?: number;
  annualPremium?: number;
  coverageDetails?: Record<string, any>;
  capturedDrivers?: Array<{ firstName, lastName, dateOfBirth?, relationship? }>;
  capturedVehicles?: Array<{ year, make, model, vin? }>;
  capturedPriorInsurance?: { priorCarrier?, priorBi?, priorExpDate?, monthsRecent? };
}

// What the quote automation receives
interface InsuranceLeadData {
  firstName, lastName, dob, gender?, maritalStatus?;
  street, city, state, zip;
  email?, phone?;
  priorInsurance?: { carrier?, biCoverage?, expirationDate?, yearsContinuous? };
}
```

---

## Login & Session Management

### Cookie Persistence (survives restarts)

1. **Filesystem**: `/tmp/portal-sessions/{carrier}-{hash}.json` (25-day expiry)
2. **Convex DB**: `portalSessions` table (backup if filesystem unavailable)
3. **Hash**: SHA256 of username, first 12 chars

### Session Hierarchy

```
1. In-memory PERSISTENT_SESSION (30-min TTL, fastest)
   ↓ expired?
2. Filesystem cookies → launch browser with storageState
   ↓ not found?
3. Convex DB cookies → launch browser with storageState
   ↓ not found?
4. Fresh login (username + password)
```

### Two-Factor Authentication

- NatGen uses SMS-based 2FA
- Auto-selects "Get a text message" option
- Returns `{ status: "needs_2fa" }` to UI → user enters code
- Auto-checks "Remember device" / "Don't ask again" checkbox
- After successful 2FA, saves cookies so future logins skip 2FA

### Headless vs Visible

| Operation | Headless | Visible |
|-----------|----------|---------|
| Running quotes | Yes | No |
| Field mapper | No | Yes |
| Test login | No | Yes |
| View quote in portal | No | Yes |

Set via `loginForQuoting(creds, onProgress, convex, { visible: true })`.

---

## NatGen Page-by-Page Reference

### Step 2: Dashboard (MainMenu.aspx)

**IDs**: `ddlState`, `ddlProduct`, `btnContinue` (all prefixed with `ctl00_MainContent_wgtMainMenuNewQuote_`)

**Gotchas**:
- Product dropdown has 0 options until state is selected via postback
- State selection triggers `__doPostBack` → page reloads → product options populate
- "Begin" button is an `<a>` tag with `href="javascript: void(0);"` — NOT a submit button
- Must wait for `networkidle` after state selection before selecting product

### Step 3-4: Client Search

**IDs**: `MainContent_txtFirstName`, `MainContent_txtLastName`, `MainContent_txtZipCode`, `MainContent_btnSearch`, `MainContent_btnAddNewClient`

**Flow**: Fill name + zip → Click Search → Click "Add New Customer"

### Step 5: Client Information

**Technique**: Single `page.evaluate()` batch fill using native property setters

**Critical Pattern — Native Property Setter**:
```javascript
// MUST use native setter to trigger SPA framework bindings
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
if (setter) setter.call(element, value);
element.dispatchEvent(new Event("input", { bubbles: true }));
element.dispatchEvent(new Event("change", { bubbles: true }));
```

**Phone Number**: Split into 4 fields (PhoneType dropdown + AreaCode + Prefix + LineNumber). Fill phone type LAST because it may trigger a postback that clears other fields.

**Consent dropdown**: `#MainContent_ucContactInfo_ddlAutomatedContact` — must be set to "Yes"

### Step 6: Quote Prefill

**Drivers**: Click "Reject All Additional Drivers" button (`#MainContent_ucPrefillDriver_btnRejectAllDrivers`) — much faster than individual dropdowns. Then set rejection reasons to "Driver is unknown to the insured".

**Vehicles**: Use Playwright's native `page.click()` on radio buttons (NOT `element.click()`). Accept first vehicle, reject others.

**Data Capture**: Parse `#gvPrefillDriver` and `#gvPrefillAuto` tables for driver names/license numbers and vehicle year/make/model/VIN.

### Step 7: Drivers Page (InsuredDrivers) — V5 SPA Framework

**This was the hardest page to automate. Key discoveries:**

1. **SPA-style IDs**: `driver.0.DriverHouseholdMember`, `driver.0.LicenseStatus`, etc.
2. **NO `name` attribute** on any dropdown — can't use `select[name="..."]`
3. **NO `onchange` attribute** — not ASP.NET WebForms, managed by JS framework
4. **`sel.value = "Active"` does NOT work** — framework doesn't detect the change
5. **`page.selectOption()` sets visually but server rejects** — EventValidation mismatch

**Solution (V5)**: Use `document.getElementById()` + native property setter + fire ALL events:

```javascript
const sel = document.getElementById("driver.0.DriverHouseholdMember");
const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
setter.call(sel, "True");
sel.dispatchEvent(new Event("input", { bubbles: true }));
sel.dispatchEvent(new Event("change", { bubbles: true }));
sel.dispatchEvent(new Event("blur", { bubbles: true }));
sel.classList.remove("ctlError");
```

**Required fields with default values**:
- `DriverHouseholdMember` → "True"
- `LicenseStatus` → "Active"
- `LicenseState` → quote state (e.g., "IL")
- `DynamicDrive` → "True"

**DOB Capture**: After filling, read `driver.0.DateOfBirth` for each driver index.

### Step 8: Driver Violations

No fields to fill — just click Next. May show "Processing..." overlay.

### Step 9: Vehicles (InsuredVehicles)

**Garaging Address Popup — CRITICAL**:
- The `ddlGaragingAddress` dropdown has an "add" option that opens a modal popup
- **NEVER select "add"** — skip the GaragingAddress dropdown entirely if only "add" is available
- If popup appears: try close button (X), else fill popup fields and click Save

**Required fields**: `ddlRentedToOthers`, `ddlWeightBetween14kAnd16k`, `ddlCamperUnitIncluded`, `ddlAntiTheft`, `ddlOwnershipStatus`, `ddlPreviouslyTitled`, `txtPurchasedDate`, `txtAnnualMileage`

**Date Purchased**: Dynamic — set to 1 month before current date.

### Step 10: Vehicle Coverages

Standard coverage selection. Click Next.

### Step 11: Auto Underwriting

**Two columns**:
- Left: "Insured Provided Data" (what we fill) — IDs: `ddlPriorInsCo`, `ddlPriorBICoverage`, `txtPriorExpDate`
- Right: "Vendor Provided Data" (NatGen auto-populates) — IDs: `ddlCurrentPriorInsCo`, `ddlCurrentPriorBICoverage`, `txtCurrentExpDate`, `ddlCurrentMonthsWMostRecentIns`

**Capture vendor data** (right column) to save to contact's prior insurance fields.

### Step 12: Premium Summary

**Scrape patterns**:
- Quote ID: `/quote\s*(#|number|no\.?)?\s*:?\s*(\d{6,})/i`
- Annual: `/(?:total|annual|full)\s*(?:premium)?\s*:?\s*\$\s*([\d,]+(?:\.\d{2})?)/i`
- Fallback: largest reasonable dollar amount on page (>$50, <$50k)

---

## Critical Patterns for New Carriers

### ASP.NET WebForms Portals

```javascript
// Trigger postback (like selecting a dropdown that loads dependent fields)
__doPostBack('ctl00$MainContent$ddlState', '');
await page.waitForLoadState("networkidle");

// Select dropdown value
await page.selectOption('#MainContent_ddlState', 'IL');
// Wait for dependent dropdown to populate
await page.waitForLoadState("networkidle");
```

### SPA Framework Portals (Vue, React, Angular, Knockout)

```javascript
// MUST use native property setter + events
const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
setter.call(selectElement, targetValue);
selectElement.dispatchEvent(new Event("input", { bubbles: true }));
selectElement.dispatchEvent(new Event("change", { bubbles: true }));
selectElement.dispatchEvent(new Event("blur", { bubbles: true }));
```

### Finding the Next Button

```javascript
// Try multiple strategies in order:
1. page.$("#MainContent_btnContinue")           // ASP.NET ID
2. page.$("input[value='Next']")                // Submit button
3. page.$("button:has-text('Next')")            // SPA button
4. page.getByRole("button", { name: "Next" })   // Accessible role
```

### Handling Processing Overlays

```javascript
await page.waitForFunction(() => {
  const text = document.body?.innerText || "";
  return !text.includes("Processing...");
}, { timeout: 30000 });
```

### Sidebar Navigation

NatGen sidebar links have `class="aspNetDisabled"` until visited. **Cannot jump to screens via sidebar** — must click Next sequentially through each page.

---

## Field Mapper System

### How to Use

1. Go to Platform Settings → AI Agents → Insurance Portal Field Mapper
2. Select carrier → Click "Map Fields"
3. Browser opens, logs into portal
4. **Capture Mode**: Click form fields to record their selectors
5. **Navigate Mode**: Fill forms normally, click Next to advance
6. Repeat for each screen
7. Click "Done — Save Mappings"
8. Mappings saved to `portalFieldMappings` table, page source to `portalPageSources`

### How It Works

- Injected JavaScript panel floats in bottom-left of portal page
- Captures: element ID, name, type, label, CSS selector, options (for selects)
- Auto-maps common fields (First Name → `firstName`, DOB → `dateOfBirth`)
- Page source HTML auto-captured on every navigation

### Mapping-Driven Runner

When saved mappings exist for a carrier, `getPortalKey()` returns `"mappings:{id}"` instead of the hardcoded driver name. The `mapping-driven-runner.ts` then:

1. Loads mappings from Convex
2. Iterates screens in order
3. For each field: resolves value from lead data → fills element
4. Handles postback-triggering selects separately
5. Clicks Next button (from saved mapping or generic detection)

---

## Data Captured During Quoting

| Data | Source Page | Saved To |
|------|-----------|----------|
| Driver names | Quote Prefill (table) | `contacts.drivers[]` |
| Driver DOBs | Drivers page (SPA fields) | `contacts.drivers[].dateOfBirth` |
| Driver relationships | Drivers page | `contacts.drivers[].relationship` |
| Vehicle year/make/model | Quote Prefill (table) | `contacts.vehicles[]` |
| Vehicle VIN | Quote Prefill (table) | `contacts.vehicles[].vin` |
| Prior carrier | Auto Underwriting (vendor column) | `contacts.priorInsuranceCarrier` |
| Prior BI coverage | Auto Underwriting (vendor column) | `contacts.priorBiCoverage` |
| Prior exp date | Auto Underwriting (vendor column) | `contacts.priorInsuranceExpDate` |
| Months with carrier | Auto Underwriting (vendor column) | `contacts.monthsWithRecentCarrier` |
| Quote ID | Premium Summary | `insuranceQuotes.quoteId` |
| Annual premium | Premium Summary | `insuranceQuotes.annualPremium` |

---

## Adding a New Carrier Portal — Checklist

### Option A: Field Mapper (Recommended)

1. Add carrier in `agencyCarriers` table with portal URL
2. Configure portal credentials for a tenant (Settings → Carriers)
3. Go to Platform Settings → AI Agents → Field Mapper
4. Select the carrier → Map Fields
5. Navigate through all quote screens, capturing every field
6. Set data sources for each field (Contact → First Name, etc.)
7. Save mappings → `mapping-driven-runner.ts` handles automation
8. Test with a real contact
9. If any screen needs special handling, extend the runner

### Option B: Custom Driver (Complex portals)

1. Create `src/lib/portals/{carrier}-portal.ts`
2. Implement `login()`, `runAutoQuote()`, `runHomeQuote()`
3. Follow the NatGen patterns (native setters, Next button detection, etc.)
4. Add to `PORTAL_DRIVERS` registry in `run-agent/route.ts`
5. Add selectors file if needed: `src/lib/portals/{carrier}-selectors.ts`

### Key Questions for Each New Carrier

- ASP.NET WebForms or SPA framework?
- Does login require 2FA? What method?
- Are dropdowns ASP.NET postback or SPA-managed?
- Does the portal use modals/popups that block automation?
- What's the URL pattern for each screen?
- Are sidebar links enabled or disabled until visited?

---

## Troubleshooting

### "Page did not advance"
1. Check for empty required fields (dump all selects/inputs)
2. Check for validation errors in `#lstErrors` or `#lstJSErrors`
3. Verify Next button is being found (`Submit method:` log line)
4. Look for processing overlay blocking the click

### "Password field not found"
- Cookies auto-authenticated — already on dashboard
- The `login()` function has a URL check after SIGN IN click

### Chrome windows piling up in dock
- Quote automation runs headless (no window)
- Persistent session TTL is 30 minutes
- Kill all: `pkill -f "chromium"`

### 2FA required every time
- Check "Remember device" checkbox during 2FA
- Cookies persist for 25 days
- The `check2faRememberBox()` function auto-checks it
