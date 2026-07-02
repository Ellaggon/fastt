# Fastt UI Governance

## No Regression Rule

New product work must not create repeatable UI objects with raw Tailwind-only markup.

Use `src/components/ui/*` for:

- Buttons and links that behave as actions: `Button`
- Inputs, selects, textareas and labeled fields: `Input`, `Select`, `Textarea`, `FormField`
- Modal/dialog shells: `Dialog`
- Cards and repeated panels: `Card`
- Status labels: `Badge`
- Tabs, filters and mode switches: `SegmentedControl`

Tailwind utilities are allowed for layout, spacing, responsive grids and one-off page composition.
They should not define a new visual language for controls, cards, modals or repeated status UI.

## Migration Order

1. Operational backoffice: financial, rates, policies and pricing.
2. Product/search surfaces: `productUI` and `searchPanel`, with responsive QA.
3. Legacy/public pages that still use old gray/blue palettes.

## Review Checklist

- Does every repeated action use `Button`?
- Does every form field use `FormField` with `Input`, `Select` or `Textarea`?
- Does every modal use `Dialog` or `fastt-dialog` through a shared component?
- Does every repeated panel/card use `Card`, `fastt-card`, `fastt-row-card` or `fastt-soft-box`?
- Are new tokens named `fastt-*`, not after external references?
