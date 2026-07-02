# UI Design System Rules

Use these components for all new UI work:

- `FormField` + `Input` / `Select` for form controls
- `FormSection` for grouped form blocks
- `Card` + `Section` for page layout blocks
- `Button` and `Badge` for actions and statuses
- `Dialog` for modal/dialog surfaces
- `SegmentedControl` for tabs, segmented filters, and mode switches

Do not build ad-hoc raw buttons, form controls, cards, dialogs, or segmented controls in
pages for new work. Tailwind utility classes are fine for one-off layout, spacing, and
page composition; repeated UI objects must go through `src/components/ui/*`.

Pattern:

```tsx
<FormSection title="...">
  <FormField label="..." required>
    <Input />
  </FormField>
</FormSection>
```
