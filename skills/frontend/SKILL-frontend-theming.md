# Frontend Engineer - Theming

<!-- Token Target: 600-800 tokens -->
<!-- Load When: any task involving styling, colors, layout, or new component creation -->

## Tailwind CSS v4 — Theme Rules

All styling uses Tailwind CSS v4 with CSS-first configuration. No `tailwind.config.js`.

### Theme Architecture

```
@import "tailwindcss";
@import "@soloenterprise/theme/dashboard";  /* SoloEnterprise dashboard */
@import "@soloenterprise/theme/client-template";  /* Agent-generated projects */
```

Design tokens live in `@theme` blocks in CSS files, NOT JavaScript config.

### Color Usage — STRICT

**Use semantic names. Never raw values.**

```tsx
// ✅ CORRECT
<div className="bg-brand-500 text-neutral-50">
<div className="bg-surface text-surface-foreground">
<div className="border-border">

// ❌ WRONG — raw oklch in components
<div className="bg-[oklch(0.62_0.21_259)]">

// ❌ WRONG — arbitrary hex when a token exists
<div className="bg-[#3b82f6]">

// ❌ WRONG — TW3 default palette (removed in dashboard theme)
<div className="bg-blue-500 text-gray-700">
```

**For client projects:** Use `--color-primary`, `--color-secondary`, `--color-accent`, `--color-surface`, `--color-muted`. Never `--color-blue-500`.

**For dashboard:** Use `--color-brand-*` scale + `--color-neutral-*` scale + semantic colors (`--color-success-500`, `--color-danger-500`, `--color-warning-500`, `--color-info-500`).

### shadcn/ui Integration

shadcn/ui components use CSS variables (`--primary`, `--background`, etc.) bridged from theme vars in `:root`. Do NOT redefine these in `@theme`. They are mapped in the dashboard/client theme files.

When wrapping shadcn components:
```tsx
// ✅ Let shadcn use its own variable system
<Button variant="destructive">Delete</Button>

// ❌ Don't override shadcn internals with Tailwind classes
<Button className="bg-danger-500 hover:bg-danger-600">Delete</Button>
```

### Spacing

TW4 uses a single `--spacing: 0.25rem` multiplier. All spacing values are dynamic:
- `mt-8` → `calc(var(--spacing) * 8)` = `2rem`
- `px-5` → `calc(var(--spacing) * 5)` = `1.25rem`
- `w-17` works — no config extension needed

Do NOT use arbitrary spacing values when a multiplier exists:
```tsx
// ✅ CORRECT
<div className="p-6 mt-4 gap-3">

// ❌ WRONG — unnecessary arbitrary value
<div className="p-[1.5rem] mt-[1rem] gap-[0.75rem]">
```

### Dark Mode

Dark mode uses the `.dark` class strategy. Theme files define both light and dark values via `:root` and `.dark` selectors.

```tsx
// ✅ CORRECT — uses semantic colors that auto-switch
<div className="bg-surface text-surface-foreground">

// ✅ CORRECT — explicit dark variant when needed
<div className="bg-white dark:bg-neutral-900">

// ❌ WRONG — hardcoded colors that break in dark mode
<div className="bg-white text-black">
```

### Adding New Theme Variables

If a task requires a new color, spacing value, or design token that doesn't exist:

1. **Check if a semantic equivalent exists.** `bg-brand-400` might work instead of inventing `bg-highlight`.
2. **If genuinely new:** Add to the appropriate theme file in `packages/theme/`, not inline in components.
3. **Never add `@theme` blocks inside component CSS.** Theme definitions are centralized.

### Project Initialization (New Client Projects)

The FIRST frontend task on any new client project MUST be:
1. Copy `packages/theme/client-template.css` to project
2. Replace `:root` CSS variable values with client brand colors
3. Verify shadcn/ui variable bridge works
4. Only THEN proceed to component tasks

### Forbidden Patterns

- `tailwind.config.js` / `tailwind.config.ts` — use `@theme` in CSS
- `@apply` for anything other than base typography — use utility classes directly
- Inline `style={{}}` for colors — use Tailwind classes
- `!important` — fix specificity with proper layer ordering
- Raw color values in JSX (`#hex`, `rgb()`, `oklch()`) — use theme tokens
- Importing default TW palette colors (`blue-500`, `red-300`) in dashboard code
