# Table Planner Design System

`table-planner` already has a domain core in [`src/core`](/Users/bg/repos/blog-projects/table-planner/src/core). The UI needed the same separation: a small design core that owns visual decisions instead of scattering them through `App.tsx` and one large stylesheet.

## Layers

1. `src/core`
   Owns planner rules, document shape, reducers, conflict detection, import/export.

2. `src/design-system/tokens.ts`
   Owns the canonical visual tokens: color, radius, space, shadow, typography.

3. `src/design-system/theme.css`
   Exposes those tokens as CSS variables so any component or stylesheet can consume them.

4. `src/design-system/primitives.tsx`
   Owns reusable low-level UI building blocks such as buttons, file buttons, and stat cards.

5. Feature UI
   `App.tsx` and future feature components compose primitives and should only use semantic classes or CSS variables, not hard-coded raw values.

## Rules

- Add new colors, spacing values, and radii in `tokens.ts` first.
- Prefer semantic names like `accent`, `surface`, `danger`, `ink-muted` over raw color intent like `blue-500`.
- Keep primitives generic. They should not know about weddings, guests, or tables.
- Keep feature styling in feature CSS, but consume `var(--...)` tokens rather than literal values.
- If a pattern repeats three times, promote it into a primitive or shared utility class.

## Initial Primitive Set

- `Button`
  Shared button treatment with variants and sizes.
- `FileButton`
  Consistent file-input trigger without native input chrome dominating the layout.
- `StatCard`
  Shared shell for KPI and summary cards.

## Next Refactors

- Split `App.tsx` into feature sections:
  - `features/header`
  - `features/guests`
  - `features/tables`
  - `features/inspector`
- Replace repeated form rows with shared field primitives.
- Move panel and badge styles into explicit primitives once layout stabilizes.
- Introduce semantic density modes for the inspector and canvas.
