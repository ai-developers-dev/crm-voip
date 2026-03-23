/**
 * ─────────────────────────────────────────────────────────────
 * MERGE INTO: src/lib/tools/catalog.ts
 * WHERE: Add these two objects inside the main tools array,
 *        anywhere in the "automation" section.
 * ─────────────────────────────────────────────────────────────
 */

{
  id: "get_unquoted_leads",
  label: "Get Unquoted Leads",
  description: "Fetch insurance leads not yet quoted for a given portal and type",
  section: "automation",
  profiles: ["automation", "full"],
},
{
  id: "quote_insurance_lead",
  label: "Quote Insurance Lead",
  description: "Run a portal quote on an insurance lead via browser automation",
  section: "automation",
  profiles: ["automation", "full"],
},
