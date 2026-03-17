/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as a2pBrands from "../a2pBrands.js";
import type * as a2pCampaigns from "../a2pCampaigns.js";
import type * as agencyCarriers from "../agencyCarriers.js";
import type * as agencyProducts from "../agencyProducts.js";
import type * as agencyTypes from "../agencyTypes.js";
import type * as agentRuns from "../agentRuns.js";
import type * as aiCallHistory from "../aiCallHistory.js";
import type * as appointments from "../appointments.js";
import type * as billing from "../billing.js";
import type * as calendarEvents from "../calendarEvents.js";
import type * as callStats from "../callStats.js";
import type * as calls from "../calls.js";
import type * as carrierCommissions from "../carrierCommissions.js";
import type * as contactTags from "../contactTags.js";
import type * as contacts from "../contacts.js";
import type * as documents from "../documents.js";
import type * as emailAccounts from "../emailAccounts.js";
import type * as emails from "../emails.js";
import type * as holdMusic from "../holdMusic.js";
import type * as http from "../http.js";
import type * as insuranceLeads from "../insuranceLeads.js";
import type * as insuranceQuotes from "../insuranceQuotes.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_planLimits from "../lib/planLimits.js";
import type * as lib_templateVars from "../lib/templateVars.js";
import type * as logoUpload from "../logoUpload.js";
import type * as notes from "../notes.js";
import type * as organizations from "../organizations.js";
import type * as parkingLot from "../parkingLot.js";
import type * as pendingTransfers from "../pendingTransfers.js";
import type * as phoneNumbers from "../phoneNumbers.js";
import type * as platformUsers from "../platformUsers.js";
import type * as policies from "../policies.js";
import type * as presence from "../presence.js";
import type * as retellAgents from "../retellAgents.js";
import type * as saleTypes from "../saleTypes.js";
import type * as sales from "../sales.js";
import type * as salesGoals from "../salesGoals.js";
import type * as salesReports from "../salesReports.js";
import type * as sms from "../sms.js";
import type * as smsConsent from "../smsConsent.js";
import type * as targetedRinging from "../targetedRinging.js";
import type * as tasks from "../tasks.js";
import type * as tenantCommissions from "../tenantCommissions.js";
import type * as userMetrics from "../userMetrics.js";
import type * as users from "../users.js";
import type * as workflowEngine from "../workflowEngine.js";
import type * as workflowExecutions from "../workflowExecutions.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  a2pBrands: typeof a2pBrands;
  a2pCampaigns: typeof a2pCampaigns;
  agencyCarriers: typeof agencyCarriers;
  agencyProducts: typeof agencyProducts;
  agencyTypes: typeof agencyTypes;
  agentRuns: typeof agentRuns;
  aiCallHistory: typeof aiCallHistory;
  appointments: typeof appointments;
  billing: typeof billing;
  calendarEvents: typeof calendarEvents;
  callStats: typeof callStats;
  calls: typeof calls;
  carrierCommissions: typeof carrierCommissions;
  contactTags: typeof contactTags;
  contacts: typeof contacts;
  documents: typeof documents;
  emailAccounts: typeof emailAccounts;
  emails: typeof emails;
  holdMusic: typeof holdMusic;
  http: typeof http;
  insuranceLeads: typeof insuranceLeads;
  insuranceQuotes: typeof insuranceQuotes;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/phone": typeof lib_phone;
  "lib/planLimits": typeof lib_planLimits;
  "lib/templateVars": typeof lib_templateVars;
  logoUpload: typeof logoUpload;
  notes: typeof notes;
  organizations: typeof organizations;
  parkingLot: typeof parkingLot;
  pendingTransfers: typeof pendingTransfers;
  phoneNumbers: typeof phoneNumbers;
  platformUsers: typeof platformUsers;
  policies: typeof policies;
  presence: typeof presence;
  retellAgents: typeof retellAgents;
  saleTypes: typeof saleTypes;
  sales: typeof sales;
  salesGoals: typeof salesGoals;
  salesReports: typeof salesReports;
  sms: typeof sms;
  smsConsent: typeof smsConsent;
  targetedRinging: typeof targetedRinging;
  tasks: typeof tasks;
  tenantCommissions: typeof tenantCommissions;
  userMetrics: typeof userMetrics;
  users: typeof users;
  workflowEngine: typeof workflowEngine;
  workflowExecutions: typeof workflowExecutions;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
