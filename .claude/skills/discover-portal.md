---
name: discover-portal
description: Crawl a carrier portal, login, navigate ALL sidebar screens, and dump every form field's CSS selector, options, and labels. Use this to build or update portal automation drivers.
---

# Portal Field Discovery

Crawls an insurance carrier portal and captures every form field on EVERY screen (navigates via sidebar links). Outputs a complete "portal profile" with exact CSS selectors, select options, buttons, and labels.

## How to use

1. Make sure the dev server is running (`npm run dev`)
2. Run the discovery with org + carrier IDs (finds saved credentials automatically):
   ```bash
   curl -s http://localhost:3000/api/portal-test/discover-selectors -X POST \
     -H "Content-Type: application/json" \
     -d '{"organizationId": "ORG_ID", "carrierId": "CARRIER_ID", "action": "full_discovery"}' \
     | jq . > src/lib/portals/natgen-profile.json
   ```

3. Or pass credentials directly for a new carrier:
   ```bash
   curl -s http://localhost:3000/api/portal-test/discover-selectors -X POST \
     -H "Content-Type: application/json" \
     -d '{"username": "USER", "password": "PASS", "portalUrl": "https://portal.example.com", "action": "full_discovery"}' \
     | jq . > src/lib/portals/newcarrier-profile.json
   ```

4. To find org/carrier IDs, use the Convex MCP tools:
   - `mcp__convex__run` with `api.organizations.list` to find org IDs
   - `mcp__convex__run` with `api.tenantCommissions.getSelectedCarriers` to find carrier IDs

## Actions

- `login_only` — Login and dump fields on login + password screens only
- `client_search` — Login, navigate to client search, dump fields
- `full_discovery` — Login → Client Search → Client Info → ALL sidebar screens (Drivers, Vehicles, Coverages, Underwriting, Premium Summary, etc.)

## Output Structure

The `full_discovery` action returns a JSON object with:

```json
{
  "loginPage": [...],           // Login screen inputs
  "afterUserIdPage": [...],     // Password page inputs
  "clientSearchFields": [...],  // Client Search inputs
  "clientInfoFields": [...],    // Client Information inputs
  "clientInfoSelects": [...],   // All select dropdowns with ALL options
  "sidebarLinks": [...],        // Sidebar navigation links
  "screens": {
    "drivers": {
      "url": "https://...",
      "inputs": [{ "name": "FirstName", "id": "...", "type": "text", ... }],
      "selects": [{ "name": "Gender", "options": [{ "value": "M", "text": "Male" }, ...] }],
      "buttons": [{ "text": "Next", "id": "...", "type": "submit" }],
      "labels": ["First Name", "Last Name", ...]
    },
    "driverViolations": { ... },
    "vehicles": { ... },
    "vehicleCoverages": { ... },
    "autoUnderwriting": { ... },
    "premiumSummary": { ... }
  }
}
```

Each field includes: `tag`, `type`, `name`, `id`, `placeholder`, `value`, `className`, `visible`, `label`
Each select includes ALL options (not just first 10): `value`, `text`

## After Discovery

1. **Save the profile**: `src/lib/portals/<carrier>-profile.json`
2. **Update/create selectors file**: Use the discovered `name` and `id` attributes to build exact CSS selectors in `src/lib/portals/<carrier>-selectors.ts`
3. **Compare with existing**: Diff against the existing selectors file to find mismatches
4. **Update the portal driver**: Switch from keyword matching to selector-first using the verified selectors
5. **Re-run after portal updates**: If a carrier changes their portal, re-run discovery to catch DOM changes

## Key Files

- **Discovery route**: `src/app/api/portal-test/discover-selectors/route.ts`
- **NatGen selectors**: `src/lib/portals/natgen-selectors.ts`
- **NatGen portal driver**: `src/lib/portals/natgen-portal.ts`
- **Base driver template**: `src/lib/portals/base-portal-driver.ts`
- **Screenshots**: `National General Auto & Home Quoting Screenshots/`

## Tips

- The browser runs **headed** (visible) locally so you can watch the discovery crawl
- If 2FA is required, complete it via Test Login in Settings first, then re-run discovery
- The tool navigates via sidebar links, so it works even if Next buttons change
- Use `jq '.screens.vehicleCoverages.selects'` to inspect a specific screen's dropdowns
- Select options show the EXACT `value` attribute needed for `page.selectOption()`
