# UI Design System Rules

Use these components for all new UI work:

- `FormField` + `Input` / `Select` for form controls
- `FormSection` for grouped form blocks
- `Card` + `Section` for page layout blocks
- `Button` and `Badge` for actions and statuses
- `Dialog` for modal/dialog surfaces
- `SegmentedControl` for tabs, segmented filters, and mode switches
- `Checkbox`, `RadioGroup`, and `Toggle` for boolean and exclusive choices
- `IconButton` for compact icon-only actions with required accessible labels
- `Notice` for alerts, warnings, confirmations, and inline guidance
- `EmptyState` for empty lists, missing results, and setup prompts
- `ProgressBar` for completion/readiness meters
- `Drawer` for side sheets and repeated lateral panels

React islands use the matching primitives exported by `src/components/ui-react`:
`Button`, `Card`, `Input`, `Select`, `Badge`, `Notice`, `Checkbox`, `IconButton`,
`SegmentedControl`, and `SegmentedItem`.

Do not build ad-hoc raw buttons, form controls, cards, dialogs, or segmented controls in
pages for new work. Tailwind utility classes are fine for one-off layout, spacing, and
page composition; repeated UI objects must go through `src/components/ui/*`.

Guardrail:

- `pnpm run check:ui` scans all `src` UI surfaces.
- `pnpm run check:ui:staged` runs in pre-commit for staged files.
- New raw `<button class=...>`, `<input class=...>`, `<select class=...>`,
  `<textarea class=...>`, raw dialogs/modals, raw card panels, and legacy external color
  tokens are blocked outside `ui/*` and `ui-react/*`.
- Existing legacy exceptions are listed explicitly in `scripts/check-ui-raw-objects.mjs`.
  Do not add to that list for new work; migrate the surface to a UI primitive instead.

Pattern:

```tsx
<FormSection title="...">
  <FormField label="..." required>
    <Input />
  </FormField>
</FormSection>
```
