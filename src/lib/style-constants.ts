/**
 * Centralized style constants — Stitch "Tactile Curated Interface"
 *
 * Design Philosophy: Neumorphic surfaces, editorial typography, no borders.
 * All boundaries defined via surface color shifts + dual-shadow extrusion.
 *
 * PREFERRED: Use CSS utility classes defined in globals.css directly in markup:
 *   <h1 className="page-title">Title</h1>
 *   <div className="page-scroll">...</div>
 *   <div className="stats-grid">...</div>
 *   <div className="neu-outset rounded-3xl">...</div>
 *
 * Neumorphic CSS Classes (globals.css):
 *   Shadows:     neu-outset, neu-outset-sm, neu-inset, neu-inset-sm, neu-ambient
 *   Interactive:  neu-outset-hover, neu-press
 *   Effects:      glass, ghost-border, ghost-border-focus, gradient-primary
 *   Progress:     neu-track
 *
 * Typography:  page-title, page-description, section-title, card-title,
 *              label-text, body-text, caption-text, stat-value, stat-value-sm,
 *              section-heading
 * Containers:  page-scroll, page-full, page-settings, page-header,
 *              page-header-bordered, content-narrow, content-wide
 * Spacing:     section-gap, inner-gap, field-gap
 * Grids:       stats-grid (2→4 cols), summary-grid (1→3), content-grid (1→2)
 *
 * ALTERNATIVE: Import these JS constants for programmatic use with cn():
 *   import { typography, layout, colors } from "@/lib/style-constants";
 *   className={cn(typography.pageTitle)}
 */

// ---------------------------------------------------------------------------
// Typography Scale — Stitch Editorial (heavy weights, tight tracking)
// ---------------------------------------------------------------------------
export const typography = {
  /** Page h1 titles — 18px extrabold, tight tracking */
  pageTitle: "text-lg font-extrabold tracking-tight",
  /** Subtitle under page title */
  pageDescription: "text-sm text-on-surface-variant",
  /** Section headings — 16px extrabold */
  sectionTitle: "text-base font-extrabold tracking-tight",
  /** Section subtitles */
  sectionDescription: "text-sm text-on-surface-variant",
  /** Card titles — 14px bold */
  cardTitle: "text-sm font-bold",
  /** Card descriptions */
  cardDescription: "text-sm text-on-surface-variant",
  /** Dialog/modal titles — 16px extrabold */
  dialogTitle: "text-base font-extrabold tracking-tight",
  /** Form labels — 12px bold uppercase (Stitch label style) */
  label: "text-xs font-bold uppercase tracking-widest text-on-surface-variant",
  /** Default body text — 16px with breathing room */
  body: "text-sm leading-relaxed",
  /** Timestamps, secondary info — 10px bold uppercase */
  caption: "text-[10px] font-bold uppercase tracking-widest text-on-surface-variant",
  /** Dashboard metric numbers — 30px black (heaviest weight) */
  stat: "text-3xl font-black tracking-tight",
  /** Smaller stat value — 18px black */
  statSm: "text-lg font-black",
  /** Change indicator below stat value */
  statChange: "text-sm font-bold text-primary",
  /** Display heading — hero moments (Stitch display-lg) */
  displayLg: "text-[3.5rem] font-black tracking-[-0.04em] leading-none",
  /** Display heading — medium */
  displayMd: "text-[2.5rem] font-black tracking-[-0.03em] leading-none",
  /** Headline — section anchors (Stitch headline-lg) */
  headlineLg: "text-[2rem] font-extrabold tracking-tight",
} as const;

// ---------------------------------------------------------------------------
// Page Layout Patterns
// ---------------------------------------------------------------------------
export const layout = {
  /** Full-height interactive pages (dashboard, contacts, calendar) */
  fullPage: "flex flex-col h-[calc(100vh-var(--header-height))]",
  /** Scrollable content pages — extra spacing for neumorphic breathing room */
  scrollPage: "p-6 space-y-8",
  /** Settings/form pages with max-width constraint */
  settingsPage: "p-6 max-w-4xl mx-auto space-y-8",
  /** Centered loading/error states */
  centerState: "flex min-h-[calc(100vh-var(--header-height))] items-center justify-center",
  /** Same but with padding */
  centerStatePadded: "flex min-h-[calc(100vh-var(--header-height))] items-center justify-center p-4",
} as const;

// ---------------------------------------------------------------------------
// Spacing — increased for neumorphic breathing room
// ---------------------------------------------------------------------------
export const spacing = {
  /** Header section in full-height pages (no border — neumorphic) */
  pageHeaderBordered: "px-6 py-4",
  /** Between major sections */
  sectionGap: "space-y-8",
  /** Within sections */
  innerGap: "space-y-6",
  /** Form field spacing */
  fieldGap: "space-y-3",
  /** Grid gap */
  gridGap: "gap-6",
  /** Tight gap for small elements */
  tightGap: "gap-2",
  /** Standard page padding */
  pagePadding: "p-6",
} as const;

// ---------------------------------------------------------------------------
// Neumorphic Shadow Classes
// ---------------------------------------------------------------------------
export const neuShadow = {
  /** Elevated card/container — outset dual shadow */
  outset: "neu-outset",
  /** Small outset for compact elements */
  outsetSm: "neu-outset-sm",
  /** Recessed/sunken — inset dual shadow (inputs, pressed states) */
  inset: "neu-inset",
  /** Small inset */
  insetSm: "neu-inset-sm",
  /** Floating elements — ambient centered shadow */
  ambient: "neu-ambient",
  /** Interactive hover — intensifies on hover */
  outsetHover: "neu-outset-hover",
  /** Active press — flips outset to inset */
  press: "neu-press",
  /** Glass effect for modals/floating nav */
  glass: "glass",
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
// Card Patterns — Neumorphic
// ---------------------------------------------------------------------------
export const cardPatterns = {
  /** Stat card CardHeader: horizontal row with icon top-right */
  statHeader: "flex flex-row items-center justify-between space-y-0 pb-2",
  /** Stat card CardTitle: small uppercase label (Stitch caption style) */
  statLabel: "text-[10px] font-bold uppercase tracking-widest text-on-surface-variant",
  /** Stat card icon: top-right corner, primary color */
  statIcon: "h-4 w-4 text-primary",
  /** Shared dashboard card shell used by workflows, calls, reports, pipelines, and AI agents */
  pageCard:
    "rounded-2xl border border-outline-variant/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,247,255,0.92)_100%)] shadow-sm dark:bg-[linear-gradient(180deg,rgba(20,20,42,0.98)_0%,rgba(24,28,52,0.94)_100%)]",
  /** Interactive version of the shared dashboard card shell */
  pageCardInteractive:
    "rounded-2xl border border-outline-variant/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,247,255,0.92)_100%)] shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-primary/40 hover:shadow-md dark:bg-[linear-gradient(180deg,rgba(20,20,42,0.98)_0%,rgba(24,28,52,0.94)_100%)]",
  /** Settings card icon container — neumorphic outset */
  settingsIconWrap: "flex h-12 w-12 items-center justify-center rounded-2xl bg-surface",
  /** Interactive card hover — shadow intensifies */
  hoverCard: "hover:border-primary/30 transition-colors",
} as const;

// ---------------------------------------------------------------------------
// Badge Color Presets
// ---------------------------------------------------------------------------
export const badgeColors = {
  success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  neutral: "bg-surface-container-high text-on-surface-variant dark:bg-surface-container-high dark:text-on-surface-variant",
} as const;

// ---------------------------------------------------------------------------
// Semantic Color Maps
// ---------------------------------------------------------------------------

/** User presence/availability status colors */
export const statusColors = {
  available: {
    label: "Available",
    color: "text-primary",
    bgColor: "bg-primary/10 dark:bg-primary/20",
    dotColor: "bg-primary",
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
    color: "text-tertiary",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    dotColor: "bg-tertiary",
  },
  offline: {
    label: "Offline",
    color: "text-on-surface-variant",
    bgColor: "bg-surface-container-high dark:bg-surface-container-high",
    dotColor: "bg-on-surface-variant",
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
  "sms-inbound": { bg: "bg-primary/10", icon: "text-primary" },
  "sms-outbound": { bg: "bg-indigo-100", icon: "text-indigo-600" },
} as const;

/** Call action button colors (accept/decline/hold) — keep semantic */
export const actionColors = {
  accept: "bg-green-600 hover:bg-green-700 text-white",
  decline: "bg-red-600 hover:bg-red-700 text-white",
  hold: "bg-yellow-500 hover:bg-yellow-600 text-white",
} as const;

/** Hold state styling for call cards */
export const holdColors = {
  bg: "bg-yellow-50 dark:bg-yellow-950/30",
  border: "outline-yellow-200/20 dark:outline-yellow-800/20",
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
  draft: "bg-surface-container-high text-on-surface-variant",
  final: "bg-green-100 text-green-700",
  archived: "bg-yellow-100 text-yellow-700",
};

/** Calendar event type colors */
export const calendarEventColors = {
  synced: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  appointment: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
} as const;

/** Contact tag colors */
export const tagColors: Record<string, { bg: string; text: string; dot: string }> = {
  red:    { bg: "bg-red-100 dark:bg-red-900/30",    text: "text-red-700 dark:text-red-300",    dot: "bg-red-500" },
  blue:   { bg: "bg-blue-100 dark:bg-blue-900/30",   text: "text-blue-700 dark:text-blue-300",   dot: "bg-blue-500" },
  green:  { bg: "bg-green-100 dark:bg-green-900/30",  text: "text-green-700 dark:text-green-300",  dot: "bg-green-500" },
  purple: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500" },
  orange: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  yellow: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300", dot: "bg-yellow-500" },
  pink:   { bg: "bg-pink-100 dark:bg-pink-900/30",   text: "text-pink-700 dark:text-pink-300",   dot: "bg-pink-500" },
  teal:   { bg: "bg-teal-100 dark:bg-teal-900/30",   text: "text-teal-700 dark:text-teal-300",   dot: "bg-teal-500" },
};

export const TAG_COLOR_OPTIONS = Object.keys(tagColors);

// ---------------------------------------------------------------------------
// UI Recipes — Neumorphic Patterns
// ---------------------------------------------------------------------------
//
// STAT CARD (Neumorphic):
//   <Card>  {/* Card now has neu-outset + rounded-3xl built in */}
//     <CardHeader className={cardPatterns.statHeader}>
//       <CardTitle className={cardPatterns.statLabel}>LABEL</CardTitle>
//       <Icon className={cardPatterns.statIcon} />
//     </CardHeader>
//     <CardContent>
//       <div className={typography.stat}>{value}</div>
//       <p className={typography.caption}>description text</p>
//     </CardContent>
//   </Card>
//
// SETTINGS CARD (Neumorphic with hover):
//   <Card className={cardPatterns.hoverCard}>
//     <CardHeader>
//       <div className="flex items-center justify-between">
//         <div className="flex items-center gap-4">
//           <div className={cardPatterns.settingsIconWrap}>
//             <Icon className="h-5 w-5 text-primary" />
//           </div>
//           <div>
//             <CardTitle className={typography.cardTitle}>Title</CardTitle>
//             <CardDescription>Subtitle</CardDescription>
//           </div>
//         </div>
//       </div>
//     </CardHeader>
//   </Card>
//
// INPUT FIELD (Neumorphic inset):
//   <Input />  {/* Built-in neu-inset-sm + rounded-2xl */}
//
// PROGRESS BAR:
//   <div className="h-3 w-full neu-track">
//     <div className="h-full gradient-primary rounded-full" style={{ width: "75%" }} />
//   </div>
