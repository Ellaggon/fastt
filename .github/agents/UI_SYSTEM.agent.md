---
name: UI_SYSTEM
description: Enforces a strict, scalable UI system across all pages and forms. Use this agent whenever creating or modifying UI.
argument-hint: "a UI task, form, or page to implement or refactor"
---

# UI System Contract (Enforced)

This project uses a STRICT UI system.

This is NOT a guideline. This is a constraint.

Any UI that does not follow this system is considered invalid.

---

# 1. Core Principles

- Consistency over creativity
- Reuse over reinvention
- Clarity over density
- Progressive disclosure
- System > page-level decisions

---

# 2. Design Tokens (MANDATORY TARGET STATE)

All UI MUST converge to semantic tokens.

## Tokens

- bg.canvas
- bg.surface
- bg.subtle

- text.primary
- text.secondary
- text.muted

- border.default
- border.strong

- action.primary

- success
- warning
- error
- info

---

## Migration Rule (IMPORTANT)

During migration, UI MAY temporarily use Tailwind utility classes **ONLY IF**:

- They match the established design defined in PROVIDER_UI_STANDARD
- They are consistent across the module
- They do not introduce new visual patterns

---

## Forbidden (STRICT)

- Arbitrary hex values (unless already defined in system)
- Mixing multiple color systems in the same view
- Introducing new palettes without system definition

---

# 3. Spacing System (8pt)

Allowed scale:

- 1, 2, 3, 4, 6, 8, 10, 12

Rules:

- Between fields → gap-4
- Inside field → space-y-2
- Between sections → space-y-8
- Inside cards → space-y-6

Forbidden:

- Arbitrary spacing values
- w-[98%], mt-[37px], etc.

---

# 4. Typography

Allowed scale:

- text-3xl → page titles
- text-2xl → section titles
- text-xl → subsections
- text-lg → labels
- text-sm → body
- text-xs → meta

Rules:

- Titles → font-semibold
- Labels → font-medium
- Consistent hierarchy per page

Forbidden:

- tracking-[...]
- Mixed typography scales in same section

---

# 5. Components (MANDATORY)

All UI MUST use:

- FormSection
- FormField
- Input / Select
- Button
- Card
- Badge
- Section

Forbidden:

- raw <input>, <select>, <textarea>
- custom form layouts
- duplicating components

---

# 6. Form System (STRICT)

Structure:

FormSection  
 FormField  
 Label  
 Input / Select  
 HelpText (optional)  
 Error

Rules:

- Label ALWAYS above input
- Placeholder NEVER replaces label
- Required fields show "\*"
- Error ALWAYS below input

---

# 7. States (REQUIRED)

Every UI must support:

- loading
- empty
- error
- success
- disabled

---

# 8. Buttons

- EXACTLY one primary CTA per section
- Primary CTA must be visible
- Secondary actions must be visually weaker

---

# 9. Layout System

Page structure MUST be:

PageHeader  
PageBody (max-w-7xl mx-auto px-6)  
 Section  
 Card

Rules:

- Forms → max-w-3xl
- No arbitrary widths

---

# 10. Navigation Rule (CRITICAL)

- NEVER use <form method="GET"> for navigation
- ALWAYS use <a href="...">
- Forms ONLY for POST actions

Violation = broken UX

---

# 11. Migration Rule (MANDATORY)

When touching ANY file:

- You MUST migrate it to this system
- You MUST NOT leave mixed styles
- You MUST align it with PROVIDER_UI_STANDARD

---

# 12. Source of Truth

Visual decisions are defined in:

→ PROVIDER_UI_STANDARD.md

This file enforces structure.
That file defines appearance.

---

# 13. Goal

The entire product must feel:

- built by one team
- with one system
- with zero visual inconsistencies
