# Design System

This is the source of truth for how dialogs, popups, forms, and interactive UI should look in this app. **Read this before building or editing any dialog, popover, or form.**

The rule is simple: **every interactive piece of UI composes from the shared `src/components/ui/*` kit**. No bespoke markup, no hand-rolled inputs, no pill badges, no custom shadows. If you need something the kit doesn't have, add it to the kit — don't inline it on a page.

---

## The three laws

1. **Form controls come from the kit.** No raw `<input>`, `<select>`, `<textarea>`, `<input type="checkbox">`, or `<input type="radio">` in application code. Use `Input`, `Select`, `Textarea`, `Checkbox`, `RadioGroup` from `@/components/ui/*`.
2. **No bespoke pills, soft shadows, or puffy rounding on interactive elements.** The forbidden-class list (below) is banned outside the UI kit itself.
3. **Dialogs follow the Enter Sale structure.** Header → scrollable body sectioned with `space-y-4` → right-aligned `DialogFooter` with outline Cancel + default action.

---

## Reference dialog

[src/components/contacts/sale-form-dialog.tsx](../src/components/contacts/sale-form-dialog.tsx) is the canonical template. When building a new dialog, copy its structure:

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-lg">
    <DialogHeader>
      <DialogTitle>Enter Sale</DialogTitle>
      <DialogDescription>Optional supporting line</DialogDescription>
    </DialogHeader>

    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Read-only context (agent/insured etc.) */}
      <div className="rounded-md border p-3 space-y-1 bg-muted/30">
        <InfoRow label="Agent" value={agentName} />
        <InfoRow label="Insured" value={contactName} />
      </div>

      {/* Paired fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Sale Type" htmlFor="saleType">
          <Select value={saleType} onValueChange={setSaleType}>
            <SelectTrigger id="saleType" className="w-full">
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>{/* items */}</SelectContent>
          </Select>
        </FormField>
        <FormField label="Policy Number" htmlFor="policyNumber">
          <Input id="policyNumber" value={policyNumber} onChange={...} />
        </FormField>
      </div>

      {/* Sub-section */}
      <SectionHeader>Lines of Business</SectionHeader>
      {/* ...repeating rows... */}
    </form>

    <DialogFooter>
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button type="submit" disabled={!isValid || submitting}>
        {submitting ? "Saving..." : "Submit Sale"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Forbidden classes outside `src/components/ui/`

- `neu-outset`, `neu-outset-sm`, `neu-inset`, `neu-inset-sm`, `neu-ambient`
- `neu-outset-hover`, `neu-press`, `neu-track`
- `glass`
- `gradient-primary`
- `ghost-border`
- `rounded-full` (only allowed on user-avatar images)
- `rounded-2xl`, `rounded-3xl`
- Inline sizing (`h-7`, `h-8`, `w-16`, etc.) on `Input`/`Select`/`Textarea`. If the field needs a specific width, wrap it in a sized container instead. If it needs a specific height, use the kit's `size` prop where one exists.
- Raw hex colors (`#...`) outside design tokens in `globals.css`.

**Regression check** — run this from the repo root. Zero hits = clean.

```bash
grep -rE 'neu-(outset|inset|ambient|press|track)|gradient-primary|\bglass\b|ghost-border|rounded-(2xl|3xl|full)' src/ \
  --exclude-dir=ui --exclude=globals.css
```

---

## Required patterns for interactive elements

| Attribute | Rule |
|---|---|
| Border | `border border-input` — defined token, visible light + dark |
| Rounding | `rounded-md` for inputs/selects/cards/dialogs; `rounded-sm` for checkboxes/small chips |
| Shadow | `shadow-sm` for elevated cards; `shadow-md` for dropdowns/popovers; `shadow-lg` for dialogs only |
| Focus | Already baked into kit components via `focus-visible:ring-2 focus-visible:ring-primary/30` — don't re-specify |

---

## Component inventory

Everything lives in `src/components/ui/*.tsx`.

| Need | Component | Notes |
|---|---|---|
| Buttons | `Button` | Variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`. Sizes: `xs`/`sm`/`default`/`lg`, `icon`/`icon-xs`/`icon-sm`/`icon-lg`. |
| Text input | `Input` | Default `h-9`. Don't override height. |
| Multi-line text | `Textarea` | `min-h-[60px]`. |
| Dropdown select | `Select` + `SelectTrigger` + `SelectContent` + `SelectItem` + `SelectValue` | Use for every single-choice dropdown — never native `<select>`. |
| Single checkbox | `Checkbox` | `size-4 rounded-sm border border-input`, fills on checked. |
| Radio group | `RadioGroup` + `RadioGroupItem` | |
| Toggle switch | `Switch` | |
| Tabs | `Tabs` + `TabsList` + `TabsTrigger` + `TabsContent` | |
| Labeled form field | `FormField` | Wraps `Label` + control + optional description + optional error. Use instead of hand-rolling `<div className="space-y-2"><Label>…</Label>…</div>`. |
| Subsection label inside a dialog | `SectionHeader` | Uppercase, tracked, muted — never use `<Label>` as a heading. |
| Read-only label/value pair | `InfoRow` | Horizontal row: muted label + bold value. |
| Dialog / modal | `Dialog` + `DialogContent` + `DialogHeader` + `DialogTitle` + `DialogDescription` + `DialogFooter` | Always wrap actions in `DialogFooter` — never a bespoke flex row. |
| Destructive confirmation | `ConfirmDialog` | One-call helper for "are you sure" flows. Supports destructive variant. |
| Empty list placeholder | `EmptyState` | Icon + title + optional description + optional action. |
| Badge / chip | `Badge` | Variants: `default`, `secondary`, `destructive`, `outline`, `success`, `warning`, `info`. **Never** apply custom colors — use a variant. |
| Card | `Card` + `CardHeader` + `CardTitle` + `CardDescription` + `CardContent` + `CardFooter` | |
| Alert banner | `Alert` + `AlertTitle` + `AlertDescription` | `default` / `destructive`. |
| Slide-out drawer | `Sheet` + `SheetContent` | Variants: `top`, `right` (default), `bottom`, `left`. |
| Popover | `Popover` + `PopoverTrigger` + `PopoverContent` | |
| Hover tooltip | `Tooltip` + `TooltipTrigger` + `TooltipContent` | Wrap with `TooltipProvider`. |
| Context menu | `DropdownMenu` + `DropdownMenuTrigger` + `DropdownMenuContent` + `DropdownMenuItem` | |
| Scrolling area | `ScrollArea` | Radix-based custom scrollbar. Requires bounded parent height. |
| Avatar | `Avatar` + `AvatarImage` + `AvatarFallback` | Only place `rounded-full` is allowed. |
| Table | `Table` + `TableHeader` + `TableBody` + `TableRow` + `TableHead` + `TableCell` | |

---

## How to add a new dialog

1. Create the file under `src/components/{feature}/*-dialog.tsx`.
2. Import from `@/components/ui/*`: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Button`, `FormField`, plus whichever controls the form needs (`Input`, `Select`, `Textarea`, `Checkbox`, `SectionHeader`, `InfoRow`).
3. Copy the reference template above.
4. Every label+control pair goes inside `<FormField>`.
5. Every non-header subsection title goes inside `<SectionHeader>` (uppercase "LINES OF BUSINESS" style).
6. Paired fields: `grid grid-cols-1 md:grid-cols-2 gap-4`.
7. Body wraps in `<form>` with `className="space-y-4"`.
8. Actions go in `<DialogFooter>` — outline Cancel on the left, default action on the right.
9. If deletion/destruction is possible, open a `<ConfirmDialog>` instead of an inline `window.confirm()`.

---

## How to add a new page-level form

Same rules as dialogs, minus the `Dialog`/`DialogContent` shell. Use `FormField` for every control, `SectionHeader` for subsections, `DialogFooter` equivalent is just a right-aligned flex row with Cancel + Submit.

---

## What stays, what goes

**Keeps** — the Material 3 surface color palette (`--surface-*`), the typography utilities (`.page-title`, `.section-title`, `.label-text`), the `cardPatterns` exports from [src/lib/style-constants.ts](../src/lib/style-constants.ts). These are centrally defined and compose well.

**Goes** — everything in the forbidden-class list. The deprecated utilities still exist in `globals.css` so stragglers don't 500 during transition, but they're marked `@deprecated` and should not be added to any new code. When you spot an existing usage outside `src/components/ui/`, migrate it.

---

## Enforcement

A Claude Code skill at `~/.claude/skills/crm-voip-design-system/SKILL.md` auto-loads these rules whenever a Claude Code session detects a dialog, form, popover, or related task in this repo. It's installed per-developer — if you're new to the project, install it by copying the file (see the skill for self-install instructions).

The skill + this doc + CLAUDE.md's pointer form the three-layer safety net against drift.
