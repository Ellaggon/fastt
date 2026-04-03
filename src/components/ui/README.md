# UI Design System Rules

Use these components for all new UI work:

- `FormField` + `Input` / `Select` for form controls
- `FormSection` for grouped form blocks
- `Card` + `Section` for page layout blocks
- `Button` and `Badge` for actions and statuses

Do not build ad-hoc raw form controls in pages for new work.

Pattern:

```tsx
<FormSection title="...">
  <FormField label="..." required>
    <Input />
  </FormField>
</FormSection>
```
