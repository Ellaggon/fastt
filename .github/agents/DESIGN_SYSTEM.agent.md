---
name: DESIGN_SYSTEM
description: Defines the visual system, interaction patterns, and real UI standards of the product. Use this as the source of truth for UI/UX decisions.
argument-hint: "a UI/UX analysis, design decision, or system standard"
---

# Design System (Source of Truth)

This document defines the **real visual and interaction system** of the product.

It is based on the **actual implementation in /provider**, not theoretical design.

UI_SYSTEM enforces structure.  
This file defines how the product LOOKS, BEHAVES, and EVOLVES.

---

# 1. System Philosophy

- Dark-first application (canvas-driven)
- Light surfaces for interaction (cards, forms)
- Single-surface UX (no route fragmentation)
- Server-driven UI (minimal client JS)
- OTA-grade clarity and hierarchy

---

# 2. Current Reality (IMPORTANT)

The system is **partially standardized**.

### Fully aligned

- `/provider` dashboard
- `/provider` step views (register/profile/verification)

### Partially aligned

- `/provider/tax-fees` (visual + React divergence)

### NOT aligned (legacy)

- `/provider/policies/*`

---

# 3. Layout System (REAL IMPLEMENTATION)

## Global

- Canvas: `bg-black`
- Layout: Navbar fixed + offset handled by layout (`pt-20`)
- Container: `max-w-7xl mx-auto px-6`
- Vertical rhythm: `space-y-8`

---

## Page Structure (Canonical)

PageHeader (on canvas)  
Progress Card (dark)  
Sections  
 Cards

---

## Rules

- Header is ALWAYS on canvas (never inside card)
- Cards contain ALL interaction
- Pages MUST NOT handle navbar offset manually

---

# 4. Navigation Pattern (CRITICAL)

## Single Surface Pattern

All flows MUST happen inside ONE route:

Example:

- `/provider`
- `/provider?step=register`
- `/provider?step=profile`
- `/provider?step=verification`

---

## Rules

- Step replaces dashboard (no mixed views)
- Navigation uses `<a href>`
- Forms are ONLY for POST

---

# 5. Color System (CURRENT STANDARD)

## Canvas

- Background: `#000000`
- Text primary: `text-slate-100`
- Text secondary: `text-slate-400`

---

## Surfaces

- Base: `bg-white`
- Text: `text-slate-900`
- Border: `border-slate-200`

---

## Section Variants (Dashboard Only)

- Identity → `bg-orange-50`
- Operational → `bg-emerald-50`
- Verification → `bg-slate-100`

---

## Primary Action

- Background: `#1E3A8A`
- Hover: `#1e40af`
- Text: white

---

## Status System

### Success

- bg-green-100 / text-green-800 / ✅

### Warning

- bg-orange-100 / text-orange-800 / ⚠️

### Info

- bg-blue-100 / text-blue-800

---

## Rules

- Canvas colors NEVER used inside cards
- Surface text NEVER used on dark background
- No new colors without updating system

---

# 6. Typography

## Strategy

- Branding → Serif (titles)
- UI → Sans-serif

---

## Scale

- H1 → text-3xl (serif, uppercase for branding)
- H2 → text-xl font-semibold
- Body → text-sm / text-base
- Label → text-sm font-medium
- Meta → text-xs

---

## Rules

- No arbitrary tracking
- Consistent hierarchy per page

---

# 7. Cards (Core Unit)

Cards are mandatory for ALL interactions.

## Structure

- Rounded
- Border
- Padding: `p-6`
- Internal spacing: `space-y-6`

---

## Types

- White cards → forms, data
- Dark cards → progress, system status

---

# 8. Forms (REAL PATTERN)

## Current Implementation

- Server-side POST forms
- No client JS required
- Step-based rendering

---

## Layout

- max-w-3xl
- Inside Card
- Vertical flow

---

## Problem (IMPORTANT)

Forms are currently:

❌ Built manually  
❌ Not using UI components (FormField/Input/etc.)

---

## Target

All forms MUST migrate to UI_SYSTEM components.

---

# 9. Buttons

## Primary

- Blue (#1E3A8A)
- White text
- Used for ALL actions

---

## Rules

- One primary per section
- Must be clearly visible

---

# 10. Badges

## Types

- Success → green + check
- Warning → orange + warning
- Info → blue
- Verification → "Aprobado" (green)

---

## Rules

- Always include icon when relevant
- Compact size

---

# 11. Language

- Entire UI MUST be Spanish
- No mixed language

---

# 12. KNOWN INCONSISTENCIES (CRITICAL)

## Forms (Provider)

- Using raw inputs instead of UI system
- Must be migrated

---

## Tax Fees

- Uses React (breaks server pattern)
- Has debug UI
- Uses custom styles (rounded-[2rem], gradients)

---

## Policies

- Completely outside system
- Uses legacy layout + forms

---

## Tokens

- Hardcoded values exist:
  - #1E3A8A
  - rounded-[...]
  - tracking-[...]

---

# 13. Migration Strategy

## Phase 1 (NOW — Controlled Reality)

Allowed:

- Tailwind colors USED in provider
- Existing hex values already in system

Rules:

- Must match provider patterns
- No new visual experiments
- No mixing styles

---

## Phase 2 (TARGET)

All UI MUST use semantic tokens:

- bg.canvas
- bg.surface
- text.primary
- action.primary

At this stage:

❌ Tailwind colors forbidden  
❌ Hex values forbidden

---

# 14. Expansion Plan

## Step 1

Fix `/provider/policies` → FULL alignment

## Step 2

Fix `/provider/tax-fees`

- Remove React divergence
- Remove debug
- Normalize styles

## Step 3

Extract tokens → system-wide

## Step 4

Apply to:

- hotels
- tours
- inventory modules

---

# 15. Enforcement Relationship

## UI_SYSTEM

- Enforces structure
- Enforces components
- Enforces spacing/layout rules

---

## DESIGN_SYSTEM

- Defines colors
- Defines UX patterns
- Defines interaction model
- Defines migration path

---

# 16. Critical Rule

If UI_SYSTEM and DESIGN_SYSTEM conflict:

→ DESIGN_SYSTEM defines the visual truth  
→ UI_SYSTEM must be updated to match

---

# 17. Goal

The system must feel:

- built by one team
- visually consistent
- predictable
- scalable
- production-grade (no experimental UI)
