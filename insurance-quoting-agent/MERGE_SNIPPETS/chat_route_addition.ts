/**
 * ─────────────────────────────────────────────────────────────
 * MERGE INTO: src/app/api/chat/route.ts
 * TWO changes needed — see comments below
 * ─────────────────────────────────────────────────────────────
 */

// ── CHANGE 1: Add import at the top of chat/route.ts ────────────────
import { createGetUnquotedLeadsTool, createInsuranceQuoteTool } from "@/lib/tools/insurance-quote-tools";


// ── CHANGE 2: Add this block in the dynamic tools section ────────────
// WHERE: After the warmed_email / direct-email tools block,
//        before the closing of the credentials if-block.

// ── Insurance quoting tools ─────────────────────────────────────────
if (credentials.natgen_portal && organizationId) {
  const [natgenUser, natgenPass, natgenUrl] = (credentials.natgen_portal.token || "").split("|");
  if (natgenUser && natgenPass) {
    const [wmEmail, wmPassword] = (credentials.warmed_email?.token || "").split("|");
    dynamicTools.get_unquoted_leads = createGetUnquotedLeadsTool({ organizationId, convex });
    dynamicTools.quote_insurance_lead = createInsuranceQuoteTool({
      credentials: { username: natgenUser, password: natgenPass, portalUrl: natgenUrl || undefined },
      portal: "natgen",
      organizationId,
      convex,
      notificationEmail: wmEmail,
      notificationPassword: wmPassword,
    });
  }
} else if (agentType === "insurance_quoting") {
  // Append credential setup instructions to system prompt so the agent gives useful guidance
  systemPrompt += `\n\nIMPORTANT: The National General portal credentials have not been configured yet. Tell the user to go to Settings → Insurance Portals and save their National General agent username and password before quoting can begin.`;
}


// ── CHANGE 3: Prevent insurance_quoting from orchestrating via team ──
// WHERE: In the isOrchestrator assignment, add the insurance_quoting exception:
//
// BEFORE:
//   const isOrchestrator = !!(teamConfig && teamSubAgents.length > 0 && _delegationDepth === 0);
//
// AFTER:
//   const isOrchestrator = !!(teamConfig && teamSubAgents.length > 0 && _delegationDepth === 0)
//     && agentType !== "insurance_quoting";
