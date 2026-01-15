/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as callStats from "../callStats.js";
import type * as calls from "../calls.js";
import type * as http from "../http.js";
import type * as organizations from "../organizations.js";
import type * as parkingLot from "../parkingLot.js";
import type * as pendingTransfers from "../pendingTransfers.js";
import type * as phoneNumbers from "../phoneNumbers.js";
import type * as platformUsers from "../platformUsers.js";
import type * as presence from "../presence.js";
import type * as targetedRinging from "../targetedRinging.js";
import type * as userMetrics from "../userMetrics.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  callStats: typeof callStats;
  calls: typeof calls;
  http: typeof http;
  organizations: typeof organizations;
  parkingLot: typeof parkingLot;
  pendingTransfers: typeof pendingTransfers;
  phoneNumbers: typeof phoneNumbers;
  platformUsers: typeof platformUsers;
  presence: typeof presence;
  targetedRinging: typeof targetedRinging;
  userMetrics: typeof userMetrics;
  users: typeof users;
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
