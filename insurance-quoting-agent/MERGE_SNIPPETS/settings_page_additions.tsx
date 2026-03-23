/**
 * ─────────────────────────────────────────────────────────────
 * MERGE INTO: src/app/(dashboard)/settings/page.tsx
 * THREE changes needed — see comments below
 * ─────────────────────────────────────────────────────────────
 */

// ── CHANGE 1: Add import at the top of settings/page.tsx ────────────
import { NatGenLoginTest } from "@/components/settings/natgen-login-test";
// Also import Key from lucide-react if not already imported:
// import { ..., Key } from "lucide-react";


// ── CHANGE 2: Add this group to the PROVIDER_GROUPS array ────────────
// WHERE: Inside the PROVIDER_GROUPS array, add AFTER the last group
{
  label: "🏥 Insurance Portals",
  description: "Agent portal logins for running automated insurance quotes",
  providers: [
    {
      provider: "natgen_portal",
      name: "National General (natgenagency.com)",
      supportsOAuth: false,
      keyPlaceholder: "agent-username|password",
      docsUrl: "https://natgenagency.com",
      icon: <Key className="h-4 w-4" />,
    },
  ],
},


// ── CHANGE 3: Add to TASK_REQUIRED_APIS object ───────────────────────
// WHERE: Inside the TASK_REQUIRED_APIS object, add this entry
insurance_quoting: [
  { name: "National General Portal", key: "natgen_portal", required: true, websiteUrl: "https://natgenagency.com" },
  { name: "Warmed Email (Quote Notifications)", key: "warmed_email", required: false, websiteUrl: "https://myaccount.google.com/apppasswords" },
],


// ── CHANGE 4: Update ProviderCard render in the JSX ──────────────────
// WHERE: In the ProviderCard component rendering loop, add these extra
// props to the ProviderCard JSX element (after the existing props):
twoFieldMode={p.provider === "warmed_email" || p.provider === "natgen_portal"}
emailPlaceholder={p.provider === "natgen_portal" ? "Agent username" : "you@gmail.com"}
passwordPlaceholder={p.provider === "natgen_portal" ? "Portal password" : "App password (16 chars)"}
urlFieldMode={p.provider === "natgen_portal"}
urlPlaceholder="Login URL (e.g. https://natgenagency.com/Account/Login.aspx)"
initialUrl={p.provider === "natgen_portal" ? getStatusForProvider(p.provider).portalUrl : undefined}
testComponent={
  p.provider === "natgen_portal" && org?._id
    ? <NatGenLoginTest organizationId={org._id} />
    : undefined
}
// NOTE: getStatusForProvider() and providerStatuses must include portalUrl.
// See provider-keys.ts — getProviderStatuses() already returns portalUrl when present.
// Your settings page will need to use a type like:
//   Array<{ provider: string; connected: boolean; type: ... | null; portalUrl?: string }>
