# Insurance Quoting Agent — Setup Guide

An AI agent that automatically logs into carrier portals (National General / natgenagency.com),
runs auto and home insurance quotes for leads, saves results, and emails summaries.

---

## Prerequisites

The target app must have:
- **Next.js 15** with App Router
- **Convex** backend
- **Clerk** for auth (with `useOrganization`)
- **Tailwind CSS + shadcn/ui** (uses `Button`, `Input`, `Badge` components)
- **Vercel AI SDK** (`ai` package) with tool support

Install these packages if not already present:
```bash
npm install playwright-core nodemailer
npm install -D @types/nodemailer
```

---

## Environment Variables

Add to `.env.local` (and Vercel dashboard):
```
CREDENTIAL_ENCRYPTION_KEY=<32-byte hex string>
```

Generate one with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 1: Copy Drop-In Files

Copy these files from this package into your app at the **exact same paths**:

| File | Destination |
|------|-------------|
| `convex/insuranceLeads.ts` | `convex/insuranceLeads.ts` |
| `convex/quotes.ts` | `convex/quotes.ts` |
| `src/lib/portals/natgen-portal.ts` | `src/lib/portals/natgen-portal.ts` |
| `src/lib/tools/insurance-quote-tools.ts` | `src/lib/tools/insurance-quote-tools.ts` |
| `src/lib/credentials/crypto.ts` | `src/lib/credentials/crypto.ts` |
| `src/lib/credentials/provider-keys.ts` | `src/lib/credentials/provider-keys.ts` |
| `src/app/api/portal-test/route.ts` | `src/app/api/portal-test/route.ts` |
| `src/app/api/provider-keys/route.ts` | `src/app/api/provider-keys/route.ts` |
| `src/app/(dashboard)/quotes/page.tsx` | `src/app/(dashboard)/quotes/page.tsx` |
| `src/app/(dashboard)/quotes/components/add-lead-form.tsx` | `src/app/(dashboard)/quotes/components/add-lead-form.tsx` |
| `src/components/settings/natgen-login-test.tsx` | `src/components/settings/natgen-login-test.tsx` |
| `src/components/settings/provider-card.tsx` | `src/components/settings/provider-card.tsx` |

> **Note:** `crypto.ts` and `provider-keys.ts` may already exist in your app if you have
> other provider integrations. If so, **merge** the insurance-specific additions from those
> files rather than replacing them entirely. The key things to add are:
> - `natgen_portal` to the `DecryptedProviderKeys` interface in `provider-keys.ts`
> - `natgen_portal` to the `typedProviders` array in `decryptProviderKeys()`
> - The `portalUrl` return in `getProviderStatuses()`

---

## Step 2: Apply Merge Snippets

Open `MERGE_SNIPPETS/` and apply each file's instructions. Each file tells you exactly
where to add the code.

### 2a. `convex_schema_additions.ts`
Add the `insuranceLeads` and `quotes` table definitions to `convex/schema.ts`.
Paste both table definitions inside `defineSchema({ ... })` before the closing `});`.

### 2b. `catalog_additions.ts`
Add 2 tool entries to your `src/lib/tools/catalog.ts` tools array.
Both are in the `"automation"` section with profiles `["automation", "full"]`.

### 2c. `settings_page_additions.tsx`
Four changes to `src/app/(dashboard)/settings/page.tsx`:
1. Import `NatGenLoginTest`
2. Add the `"🏥 Insurance Portals"` group to `PROVIDER_GROUPS`
3. Add `insurance_quoting` entry to `TASK_REQUIRED_APIS`
4. Add `twoFieldMode`, `urlFieldMode`, `initialUrl`, and `testComponent` props
   to the `ProviderCard` render (conditional on `natgen_portal`)

### 2d. `sidebar_addition.tsx`
Add `{ label: "Quotes", href: "/quotes", icon: FileText }` to your sidebar nav array.
Place it after the "Leads" item.

### 2e. `chat_route_addition.ts`
Three changes to `src/app/api/chat/route.ts`:
1. Add the import for `createGetUnquotedLeadsTool` and `createInsuranceQuoteTool`
2. Add the insurance tools block (checks for `credentials.natgen_portal`)
3. Add `&& agentType !== "insurance_quoting"` to the `isOrchestrator` condition

### 2f. `agent_registry_addition.ts`
Two changes to `src/lib/agents/registry.ts`:
1. Add `| "insurance_quoting"` to the `AgentType` union
2. Add the `insurance_quoting` config object to `AGENT_REGISTRY`

---

## Step 3: Push Convex Schema

```bash
npx convex dev
# or for production:
npx convex deploy
```

This creates the `insuranceLeads` and `quotes` tables in your Convex database.

---

## Step 4: Verify Setup

1. **Settings → Insurance Portals** — Should show a "National General" card with:
   - Agent username field
   - Password field
   - Login URL field
   - "Test Login" button

2. **Add your NatGen credentials:**
   - Username: your agent username for natgenagency.com
   - Password: your portal password
   - URL: `https://natgenagency.com/Account/Login.aspx` (or your specific login URL)

3. **Click "Test Login"** — Should launch a browser, log in, handle 2FA, and return "Login successful"

4. **Navigate to `/quotes`** — Should load with empty state and "Add Lead" button

5. **Add a test lead → click "Run Agent"** — Agent calls `get_unquoted_leads`, then `quote_insurance_lead_natgen`

6. **Check Convex dashboard** — `insuranceLeads.status` should update to "quoted" and the `quotes` table should have a new record

---

## Architecture

```
/quotes page
    └── AddLeadForm → convex: insuranceLeads.create()
    └── "Run Agent" → creates project with agentType: "insurance_quoting"
                          └── AI agent calls get_unquoted_leads tool
                              └── AI agent calls quote_insurance_lead tool
                                  └── natgen-portal.ts (Playwright automation)
                                      └── Login → Fill form → Scrape premium
                                  └── convex: quotes.create() (saves result)
                                  └── nodemailer: sends email summary (optional)

Settings → Insurance Portals
    └── ProviderCard → POST /api/provider-keys (saves encrypted username|password|url)
    └── NatGenLoginTest → POST /api/portal-test (interactive 2FA login test)
```

---

## Adding More Portals

To add Progressive, Travelers, or any other carrier:

1. Create `src/lib/portals/progressive-portal.ts` following the same pattern as `natgen-portal.ts`
2. Register it in `src/lib/tools/insurance-quote-tools.ts`:
   ```typescript
   progressive: {
     label: "Progressive",
     auto: runProgressiveAutoQuote,
     home: runProgressiveHomeQuote,
   },
   ```
3. Add a `progressive_portal` entry to settings/provider-keys the same way as NatGen
4. The chat route will automatically pick up any configured portal credentials

---

## NatGen Login Notes

- NatGen uses a **3-step login**: User ID → Password → MFA (text message)
- The first time you log in, you must complete MFA via the "Test Login" button in Settings
- The quoting agent **cannot handle interactive MFA** — it will throw an error telling you to use Test Login first if MFA is required
- Use `playwright-core` (already in this package) — not Puppeteer
- The portal URL can be customized (useful if your agency has a custom SSO URL)
