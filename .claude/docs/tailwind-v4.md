# Tailwind CSS v4

Both frontends use Tailwind **v4** (`apps/museum` via `@tailwindcss/postcss`;
`apps/web` via `@tailwindcss/vite`). The breaking changes below are CSS-level and
apply to both. This is a quick reference — distilled from the legacy `.cursor` rules.

## Critical breaking changes

| v3 | v4 | Why |
|----|----|-----|
| `@tailwind base/components/utilities;` | `@import "tailwindcss";` | Single import |
| `<div class="border">` | `<div class="border border-gray-200">` | Default border is now `currentColor` |
| `focus:ring` | `focus:ring-3 focus:ring-blue-500` | Ring width 3px→1px, color blue-500→`currentColor` |
| `focus:outline-none` | `focus:outline-hidden` | Accessibility-aware invisible outline |
| `bg-[--brand-color]` | `bg-(--brand-color)` | CSS-variable arbitrary-value syntax |
| `first:*:pt-0` | `*:first:pt-0` | Variant stacking is now left-to-right |

**Always specify border and ring colors explicitly** — v4 defaults to `currentColor`,
which is the single most common v4 bug.

## Configuration is CSS-first

```css
@import "tailwindcss";

@theme {
  --color-brand-500: oklch(0.84 0.18 117.33);
  --font-display: "Satoshi", "sans-serif";
  --breakpoint-3xl: 1920px;
}
```

- Use `@theme` in CSS instead of `tailwind.config.js`. JS config is no longer
  auto-detected — load it explicitly with `@config "..."` if you still have one.
- Custom utilities: `@utility name { ... }`, not `@layer utilities { .name { ... } }`.
- Prefer direct CSS variables (`var(--color-red-500)`) over `theme(...)`.

## New features worth using

- **Container queries** (no plugin): `<div class="@container"><div class="@sm:grid-cols-2 @lg:grid-cols-4">`.
- **Boolean data-attribute variants:** `<div data-active class="opacity-50 data-active:opacity-100">`.
- Enhanced variant composability (`group-has-focus:` etc.).

## MOCA specifics

- `apps/museum` is **dark-first** with an OKLCh token palette + one accent; see its
  design-system skill (`apps/museum/.claude/skills/moca-library-design/`). Use the
  tokens in `src/app/globals.css` — never invent colors. The accent is env-driven
  (`ACCENT_COLOR`), injected as `--accent`.
- PostCSS config (`apps/museum`): `{ plugins: { "@tailwindcss/postcss": {} } }`.
