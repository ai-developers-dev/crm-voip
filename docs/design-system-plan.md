# Design System Plan — One Look Everywhere

## Context

The "Enter Sale" dialog ([sale-form-dialog.tsx](../src/components/contacts/sale-form-dialog.tsx)) is the gold standard: flat `rounded-md` borders, shared shadcn components, no bespoke styling. The "Carriers & Lines of Business" dialog ([carriers-settings-dialog.tsx](../src/components/settings/carriers-settings-dialog.tsx)) is the top offender: rounded-full checkmark avatars, pill-shape "Portal Connected" badge, custom-sized percentage inputs that reintroduced the soft recessed look.

The fix is structural, not cosmetic: **ban bespoke markup on interactive UI**. Every dialog, popup, and form must compose from the shared `src/components/ui/*` kit. Where the kit has gaps (the only reason teams reach for bespoke markup), fill them first, then migrate.

Enforcement has two layers: a human-readable design-system doc committed to the repo, and a **Claude Code skill** at `~/.claude/skills/` that auto-loads the rules whenever a future session detects a dialog/form task so drift doesn't happen quietly between sessions.

This plan is organized so Part 1 locks down the standard, Part 2 fills gaps that are blocking the ban, Part 3 migrates existing violations, and Part 4 prevents regressions.

---

## Part 1 — The design-system contract

The source of truth lives in two places once this plan lands:

1. **`docs/design-system.md`** in the repo (human-readable, committed, links to the reference dialog and forbidden-class list).
2. **`~/.claude/skills/crm-voip-design-system/SKILL.md`** on the user's machine (auto-loaded by Claude Code when the intent matches — keeps me honest across sessions).

Both files state the same rules:

### 1.1 The three laws

1. **Form controls MUST use the shared UI kit.** No raw `<input>`, `<select>`, `<textarea>`, `<input type="checkbox">`, `<input type="radio">`, `<input type="date">` in any new code. Use `Input`, `Select`, `Textarea`, `Checkbox`, `RadioGroup` from `@/components/ui/*`.
2. **No bespoke pills, soft shadows, or puffy rounding on interactive elements.** The forbidden class list (below) is banned outside the UI kit itself.
3. **Dialogs follow the Enter Sale structure.** Header → scrollable body sectioned with `space-y-4` → right-aligned footer with outline Cancel + default action.

### 1.2 Forbidden classes outside `src/components/ui/`

`neu-outset`, `neu-outset-sm`, `neu-inset`, `neu-inset-sm`, `neu-ambient`, `neu-outset-hover`, `neu-press`, `glass`, `gradient-primary`, `ghost-border`, `neu-track`, `rounded-full` (except on user-avatar images), `rounded-2xl`, `rounded-3xl`, inline `h-7`/`h-8`/`w-16` sizing on inputs (use the kit's size prop), raw hex colors (`#...`) outside design tokens.

### 1.3 Required class rules for interactive elements

- Borders → `border border-input` (defined token, visible in both themes).
- Rounding → `rounded-md` for inputs/selects/cards/dialogs, `rounded-sm` for checkboxes/small chips, never `rounded-full` on anything except avatar images.
- Shadows → `shadow-sm` for elevated cards, `shadow-md` for dropdowns/popovers, `shadow-lg` for dialogs only. Never `neu-*`.
- Focus → `focus-visible:ring-2 focus-visible:ring-primary/30` (already baked into the kit components; don't re-specify).

### 1.4 The Enter Sale structural template

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-lg">
    <DialogHeader>
      <DialogTitle>Enter Sale</DialogTitle>
      <DialogDescription>Short supporting line, optional</DialogDescription>
    </DialogHeader>

    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Read-only context block — use InfoRow (see gap list) */}
      <Card className="p-3 space-y-1">
        <InfoRow label="Agent" value={agentName} />
        <InfoRow label="Insured" value={contactName} />
      </Card>

      {/* Paired fields — grid-cols-1 md:grid-cols-2 gap-4 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Sale Type" htmlFor="saleType">
          <Select ...>...</Select>
        </FormField>
        <FormField label="Policy Number" htmlFor="policyNumber">
          <Input id="policyNumber" ... />
        </FormField>
      </div>

      {/* Sub-section header */}
      <SectionHeader>Lines of Business</SectionHeader>
      {/* ...repeating rows... */}
    </form>

    <DialogFooter>
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button type="submit" disabled={!isValid || submitting}>
        {submitting ? "Saving..." : "Submit Sale"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Part 2 — Fill the gaps first

Existing violations often exist because the kit didn't offer a convenient primitive. Five gap components get created in one commit before any migration happens. Each is small, stateless, and exported from `@/components/ui/*`.

### 2.1 `src/components/ui/form-field.tsx` (NEW)

Wraps `Label` + field slot + error message in a consistent vertical stack.

```tsx
interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  description?: string;
  children: React.ReactNode;
}
```

Produces: label row (with `*` when required) → child → tiny `text-destructive` error line (only when error). Single source of spacing between label and input, single source of error styling.

### 2.2 `src/components/ui/section-header.tsx` (NEW)

The uppercase subsection divider in the Enter Sale screenshot ("LINES OF BUSINESS", "EFFECTIVE DATE") is repeated ad-hoc today. Extract it:

```tsx
<SectionHeader>Lines of Business</SectionHeader>
// renders: <div className="label-text mb-2">{children}</div>
```

Uses the existing `.label-text` utility from `globals.css` so typography stays centralized.

### 2.3 `src/components/ui/info-row.tsx` (NEW)

The label/value read-only pair (Agent / Insured in the reference dialog):

```tsx
<InfoRow label="Agent" value="Doug Allen" />
// renders: <div className="flex items-center justify-between text-sm">
//   <span className="text-muted-foreground">{label}</span>
//   <span className="font-medium">{value}</span>
// </div>
```

Value accepts ReactNode, not just string — supports an icon + text pair.

### 2.4 `src/components/ui/confirm-dialog.tsx` (NEW)

Wraps `AlertDialog` from Radix into a one-line convenience helper so every "are you sure?" flow looks identical:

```tsx
<ConfirmDialog
  open={confirmOpen}
  onOpenChange={setConfirmOpen}
  title="Delete Sale?"
  description="This cannot be undone."
  confirmLabel="Delete"
  variant="destructive"
  onConfirm={handleDelete}
/>
```

Currently the codebase hand-rolls confirm dialogs (e.g. [sales-goals-manager.tsx](../src/components/sales-goals-manager.tsx)). This replaces them.

### 2.5 `src/components/ui/empty-state.tsx` (NEW)

Uniform empty-list placeholder (contact list, sales list, tasks, voicemails):

```tsx
<EmptyState
  icon={<Users className="h-8 w-8" />}
  title="No contacts yet"
  description="Add your first contact to get started."
  action={<Button>Add Contact</Button>}
/>
```

### 2.6 Radix AlertDialog dependency

Required for `ConfirmDialog`. The package is `@radix-ui/react-alert-dialog`. Add via npm if not already present, then wrap in `src/components/ui/alert-dialog.tsx` following the same shadcn pattern as `dialog.tsx`.

---

## Part 3 — Migrate existing violations

Ordered by blast radius so I can commit in review-sized chunks. Each bullet is one commit.

### 3.1 Carriers settings dialog rewrite [`src/components/settings/carriers-settings-dialog.tsx`]

**What changes**:
- Replace rounded-full checkmark `<div>` avatars with `<Checkbox>`. The primary `Checkbox` from the kit already renders the blue check on a flat bordered square.
- Replace the "Portal Connected" pill (`rounded-full px-2 py-0.5` with hardcoded emerald) with `<Badge variant="success">Portal Connected</Badge>`.
- Replace the percentage `<Input className="h-7 w-16 text-xs">` with the default `<Input>` inside a `w-20` wrapper. No more inline sizing.
- Section sub-labels ("LINES OF BUSINESS", "PORTAL CREDENTIALS") become `<SectionHeader>`.
- Credential inputs use `<FormField>` so the password-toggle eye icon lives in a consistent slot.

**Why first**: It's the dialog in the user's screenshot and the single most visible violation.

### 3.2 Replace native `<select>` with `<Select>` across ~11 dialogs/forms

Files: [contact-dialog.tsx](../src/components/contacts/contact-dialog.tsx), [policy-form-dialog.tsx](../src/components/contacts/policy-form-dialog.tsx), [task-form-dialog.tsx](../src/components/contacts/task-form-dialog.tsx), [appointment-form-dialog.tsx](../src/components/contacts/appointment-form-dialog.tsx), [document-form-dialog.tsx](../src/components/contacts/document-form-dialog.tsx), [settings/page.tsx](../src/app/(dashboard)/settings/page.tsx), [quotes/components/add-lead-form.tsx](../src/app/(dashboard)/quotes/components/add-lead-form.tsx), [admin/tenants/[id]/settings/page.tsx](../src/app/(dashboard)/admin/tenants/[id]/settings/page.tsx), [admin/tenants/[id]/settings/users/page.tsx](../src/app/(dashboard)/admin/tenants/[id]/settings/users/page.tsx), plus any others the explore agent flagged.

Mechanical swap: `<select className="..."><option>` → `<Select value={...} onValueChange={...}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="...">`.

### 3.3 Replace native `<input type="checkbox">` with `<Checkbox>`

Files in `add-lead-form.tsx` and the settings pages. Direct swap, same value binding.

### 3.4 Adopt `<FormField>` in `sale-form-dialog.tsx` itself and every other dialog

The reference dialog currently repeats `<Label> + <Input>` manually — works but doesn't benefit from the new wrapper. Migrating it last makes the reference the canonical user of the new wrapper so future readers copy the best pattern.

### 3.5 Structural rewrites deferred

[field-mapper-dialog.tsx](../src/components/settings/field-mapper-dialog.tsx), [portal-discovery-dialog.tsx](../src/components/settings/portal-discovery-dialog.tsx), and [workflow-dialog.tsx](../src/components/workflows/workflow-dialog.tsx) are complex custom flows (300+ lines each). They get noted as "follow the rules for any new work but don't do a wholesale rewrite now." Out of scope for this pass — flag for a follow-up.

---

## Part 4 — Lock it in

### 4.1 `docs/design-system.md` (NEW, committed to repo)

Committed version of this plan's Part 1 rules plus:
- Screenshot / link to the Enter Sale reference.
- The component-inventory table from the audit (which kit component covers which need).
- The forbidden-class list.
- "How to add a new dialog" walkthrough.
- "How to add a new page-level form" walkthrough.

Lives alongside other docs in the repo so new developers hit it first.

### 4.2 Claude Code skill [`~/.claude/skills/crm-voip-design-system/SKILL.md`]

Auto-triggers when Claude detects any of these in the current task: `dialog`, `modal`, `popup`, `form`, `input`, `select`, `checkbox`, `radio`, or edits to files matching `src/components/**/*-dialog.tsx` / `src/app/**/page.tsx` that contain a form.

Skill content (outline):
1. Reference the design-system doc path.
2. Paste the three laws from Part 1.
3. Paste the forbidden-class list.
4. Paste the Enter Sale template as a starter snippet.
5. Include a pre-commit checklist: "before I finish this task, grep for the forbidden classes in my diff and rewrite any hits."

The skill is project-scoped — it only fires when the working directory resolves to this CRM repo, so it doesn't pollute other projects.

### 4.3 CLAUDE.md link-in

Add a one-line entry under the existing "Key Directories" section of the repo's [CLAUDE.md](../CLAUDE.md): *"Styling rules and the forbidden-class list live in `docs/design-system.md`. Claude should read that file before any dialog, form, or popover work."*

### 4.4 Optional ESLint rule (future, flagged only)

A custom ESLint rule could fail the build on any forbidden class name in files outside `src/components/ui/`. Out of scope for this pass, but called out so we remember it exists as an option if drift recurs despite the skill and docs.

---

## Execution order

One reviewable commit per bullet. Tests after each.

1. **Part 2 gap components** — FormField, SectionHeader, InfoRow, AlertDialog wrapper, ConfirmDialog, EmptyState. New files only, zero risk.
2. **Part 3.1** — Carriers settings dialog rewrite. Largest visible impact; user sees the payoff immediately.
3. **Part 3.2** — Native `<select>` migration across ~11 files. Keep per-file commits small or group by directory if the diff is trivial.
4. **Part 3.3** — Native checkbox migration.
5. **Part 3.4** — Adopt `FormField` in the reference dialog and other dialogs.
6. **Part 4.1** — `docs/design-system.md` committed.
7. **Part 4.2** — Claude Code skill installed at `~/.claude/skills/crm-voip-design-system/`. (Not committed to repo — lives on the user's machine; document the installation in `docs/design-system.md`.)
8. **Part 4.3** — CLAUDE.md link-in.

Part 3.5 (workflow/field-mapper/portal-discovery rewrites) is explicitly out of scope.

---

## Verification

After each migration commit:

1. `npx tsc --noEmit` — passes.
2. `npm run build` — passes.
3. Visual spot-check in dev at 375px / 768px / 1280px on: the modified dialog, the Enter Sale dialog, the nearest form-heavy page.
4. Dark-mode toggle — all borders remain visible, no blur artifacts.

After the full sweep lands:

5. Grep the project for any forbidden-class strings outside `src/components/ui/` and `src/app/globals.css` — should return zero hits. Any that remain are failures to fix.

```bash
# Run this after each commit as a regression gate
grep -rE 'neu-(outset|inset|ambient|press|track)|gradient-primary|\bglass\b|ghost-border|rounded-(2xl|3xl|full)' src/ \
  --exclude-dir=ui --exclude=globals.css
```

Railway auto-deploy (GitHub-connected) picks up each commit. User hard-refreshes production and eyeballs: carriers settings dialog, Enter Sale dialog, contact dialog, task/appointment/document dialogs, settings pages.

---

## Success criteria

- User opens carriers settings dialog and sees the same flat, readable look as Enter Sale.
- Every form element looks the same across the app: same border color, same rounding, same height, same focus ring.
- The forbidden-class grep returns zero hits outside the UI kit.
- `docs/design-system.md` exists and is linked from CLAUDE.md.
- The Claude Code skill exists at `~/.claude/skills/crm-voip-design-system/SKILL.md` and auto-fires on dialog/form tasks — future sessions get the rules without the user having to repeat them.
