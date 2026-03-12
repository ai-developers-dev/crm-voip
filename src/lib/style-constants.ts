/**
 * Centralized style constants for UI consistency across the app.
 *
 * Usage: import { typography, layout, colors } from "@/lib/style-constants";
 * Then use with cn(): className={cn(typography.pageTitle)}
 */

// ---------------------------------------------------------------------------
// Typography Scale
// ---------------------------------------------------------------------------
export const typography = {
  /** Page h1 titles — 18px semibold */
  pageTitle: "text-lg font-semibold tracking-tight",
  /** Subtitle under page title */
  pageDescription: "text-sm text-muted-foreground",
  /** Section headings within a page — 16px semibold */
  sectionTitle: "text-base font-semibold",
  /** Section subtitles */
  sectionDescription: "text-sm text-muted-foreground",
  /** Card titles — 14px semibold (shadcn default) */
  cardTitle: "text-sm font-semibold",
  /** Card descriptions */
  cardDescription: "text-sm text-muted-foreground",
  /** Dialog/modal titles — 16px semibold */
  dialogTitle: "text-base font-semibold",
  /** Form labels — 14px medium */
  label: "text-sm font-medium",
  /** Default body text — 14px */
  body: "text-sm",
  /** Timestamps, secondary info — 12px muted */
  caption: "text-xs text-muted-foreground",
  /** Dashboard metric numbers — 30px bold (large, prominent) */
  stat: "text-3xl font-bold tracking-tight",
  /** Smaller stat value — 18px bold */
  statSm: "text-lg font-bold",
  /** Change indicator below stat value (e.g. "+20.1% from last month") */
  statChange: "text-sm font-medium",
} as const;

// ---------------------------------------------------------------------------
// Page Layout Patterns
// ---------------------------------------------------------------------------
export const layout = {
  /** Full-height interactive pages (dashboard, contacts, calendar) */
  fullPage: "flex flex-col h-[calc(100vh-var(--header-height))]",
  /** Scrollable content pages (stats, admin dashboard, reports) */
  scrollPage: "p-6 space-y-6",
  /** Settings/form pages with max-width constraint */
  settingsPage: "p-6 max-w-4xl mx-auto space-y-6",
  /** Centered loading/error states */
  centerState: "flex min-h-[calc(100vh-var(--header-height))] items-center justify-center",
  /** Same but with padding */
  centerStatePadded: "flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4",
} as const;

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------
export const spacing = {
  /** Header section in full-height pages */
  pageHeaderBordered: "border-b px-6 py-4",
  /** Between major sections */
  sectionGap: "space-y-6",
  /** Within sections */
  innerGap: "space-y-4",
  /** Form field spacing */
  fieldGap: "space-y-2",
  /** Grid gap — standard breathing room between cards */
  gridGap: "gap-6",
  /** Tight gap for small elements */
  tightGap: "gap-2",
  /** Standard page padding */
  pagePadding: "p-6",
} as const;

// ---------------------------------------------------------------------------
// Icon Sizes
// ---------------------------------------------------------------------------
export const iconSize = {
  /** Badges, inline status dots */
  xs: "h-3 w-3",
  /** Default: buttons, lists, card headers */
  sm: "h-4 w-4",
  /** Feature icons in settings cards */
  md: "h-5 w-5",
  /** Empty states, loading spinners */
  lg: "h-8 w-8",
} as const;

// ---------------------------------------------------------------------------
// Grid Layout Patterns
// ---------------------------------------------------------------------------
export const grid = {
  /** 4 stat cards across (2 on md) */
  stats: "grid gap-6 md:grid-cols-2 lg:grid-cols-4",
  /** 3 summary cards across */
  summary: "grid gap-6 md:grid-cols-3",
  /** 2-column content layout */
  content: "grid gap-6 md:grid-cols-2",
  /** 2-column settings cards */
  settings: "grid gap-6 md:grid-cols-2",
} as const;

// ---------------------------------------------------------------------------
// Card Patterns (class compositions for common card layouts)
// ---------------------------------------------------------------------------
export const cardPatterns = {
  /** Stat card CardHeader: horizontal row with icon top-right */
  statHeader: "flex flex-row items-center justify-between space-y-0 pb-2",
  /** Stat card CardTitle: small muted label above big number */
  statLabel: "text-sm font-medium",
  /** Stat card icon: top-right corner, muted */
  statIcon: "h-4 w-4 text-muted-foreground",
  /** Settings card icon container (add color bg via cn()) */
  settingsIconWrap: "flex h-10 w-10 items-center justify-center rounded-lg",
  /** Interactive card hover (opt-in since base Card has no hover) */
  hoverCard: "hover:shadow-md transition-shadow",
} as const;

// ---------------------------------------------------------------------------
// Badge Color Presets
// ---------------------------------------------------------------------------
export const badgeColors = {
  success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  neutral: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
} as const;

// ---------------------------------------------------------------------------
// Semantic Color Maps
// ---------------------------------------------------------------------------

/** User presence/availability status colors */
export const statusColors = {
  available: {
    label: "Available",
    color: "text-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    dotColor: "bg-purple-500",
  },
  busy: {
    label: "Busy",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    dotColor: "bg-yellow-500",
  },
  on_call: {
    label: "On Call",
    color: "text-primary",
    bgColor: "bg-primary/10",
    dotColor: "bg-primary",
  },
  on_break: {
    label: "On Break",
    color: "text-orange-600",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    dotColor: "bg-orange-500",
  },
  offline: {
    label: "Offline",
    color: "text-gray-500",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
    dotColor: "bg-gray-400",
  },
} as const;

/** Call direction icon colors */
export const callDirectionColors = {
  inbound: { icon: "text-green-500", bg: "bg-green-100", text: "text-green-600" },
  outbound: { icon: "text-blue-500", bg: "bg-blue-100", text: "text-blue-600" },
  missed: { icon: "text-red-500", bg: "bg-red-100", text: "text-red-500" },
  missedText: "text-red-600 dark:text-red-400",
} as const;

/** Communication type icon colors (communications pane) */
export const commTypeColors = {
  "call-missed": { bg: "bg-red-100", icon: "text-red-500" },
  "call-inbound": { bg: "bg-green-100", icon: "text-green-600" },
  "call-outbound": { bg: "bg-blue-100", icon: "text-blue-600" },
  "email-inbound": { bg: "bg-amber-100", icon: "text-amber-600" },
  "email-outbound": { bg: "bg-teal-100", icon: "text-teal-600" },
  "sms-inbound": { bg: "bg-purple-100", icon: "text-purple-600" },
  "sms-outbound": { bg: "bg-indigo-100", icon: "text-indigo-600" },
} as const;

/** Call action button colors (accept/decline/hold) */
export const actionColors = {
  accept: "bg-green-600 hover:bg-green-700 text-white",
  decline: "bg-red-600 hover:bg-red-700 text-white",
  hold: "bg-yellow-500 hover:bg-yellow-600 text-white",
} as const;

/** Hold state styling for call cards */
export const holdColors = {
  bg: "bg-yellow-50 dark:bg-yellow-950/30",
  border: "border-yellow-200 dark:border-yellow-800",
  icon: "text-yellow-600",
} as const;

/** Appointment status badge colors */
export const appointmentStatusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-yellow-100 text-yellow-700",
};

/** Document status badge colors */
export const documentStatusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  final: "bg-green-100 text-green-700",
  archived: "bg-yellow-100 text-yellow-700",
};

/** Calendar event type colors */
export const calendarEventColors = {
  synced: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  appointment: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
} as const;

// ---------------------------------------------------------------------------
// UI Recipes — Copy these patterns for new pages
// ---------------------------------------------------------------------------
//
// STAT CARD:
//   <Card>
//     <CardHeader className={cardPatterns.statHeader}>
//       <CardTitle className={cardPatterns.statLabel}>Label</CardTitle>
//       <Icon className={cardPatterns.statIcon} />
//     </CardHeader>
//     <CardContent>
//       <div className={typography.stat}>{value}</div>
//       <p className={typography.caption}>description text</p>
//     </CardContent>
//   </Card>
//
// SETTINGS CARD (with hover):
//   <Card className={cardPatterns.hoverCard}>
//     <CardHeader>
//       <div className="flex items-center justify-between">
//         <div className="flex items-center gap-3">
//           <div className={cn(cardPatterns.settingsIconWrap, "bg-blue-100 dark:bg-blue-900/30")}>
//             <Icon className="h-5 w-5 text-blue-600" />
//           </div>
//           <div>
//             <CardTitle className={typography.label}>Title</CardTitle>
//             <CardDescription>Subtitle</CardDescription>
//           </div>
//         </div>
//         <Badge>Status</Badge>
//       </div>
//     </CardHeader>
//   </Card>
//
// TABLE CARD:
//   <Card>
//     <CardHeader>
//       <CardTitle>Table Title</CardTitle>
//       <CardDescription>Description</CardDescription>
//     </CardHeader>
//     <CardContent>
//       <Table>...</Table>
//     </CardContent>
//   </Card>
//
// PAGE LAYOUTS:
//   Scrollable page:  className={layout.scrollPage}     → "p-6 space-y-6"
//   Full-height page: className={layout.fullPage}        → flex col, calc(100vh - header)
//   Settings page:    className={layout.settingsPage}    → "p-6 max-w-4xl mx-auto space-y-6"
//
// GRID LAYOUTS:
//   Stat cards:    className={grid.stats}     → 4 cols on lg, 2 on md
//   Summary cards: className={grid.summary}   → 3 cols on md
//   Content:       className={grid.content}   → 2 cols on md
//   Settings:      className={grid.settings}  → 2 cols on md
