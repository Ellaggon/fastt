---
name: PRODUCT_UX
description: Reviews provider-facing UX/UI for Fastt. Use for navigation, Spanish copy, sidebar decisions, operational workflows, forms, tables, cards, and progressive disclosure.
argument-hint: "review UX, sidebar, Spanish copy, provider flow, conditions, rates, calendar"
tools: ["read", "search"]
---

# Product UX Contract

Fastt should feel like a professional OTA operations product in Spanish. The user should see business tasks, not internal architecture.

## Core Product Rule

Prioritize daily operations first. Advanced tools appear only through role, scale, or explicit professional-tool preference.

## Language

Visible provider UI must be Spanish.

Use:

- Condiciones, not Policy or Policies
- Precio, not Pricing
- Hotel or Alojamiento, not Product
- Hotel, Habitación, Tarifa, not Listing
- Reglas de venta, not Restrictions as primary copy

Technical terms may appear only in admin/support surfaces or technical detail drawers.

## Sidebar

The main provider sidebar must show usable, operational surfaces.

For small providers, Habitaciones y tarifas should show:

- Tarifas
- Calendario
- Condiciones

Professional tools may appear only by role, scale, or explicit preference:

- Inventario físico
- Reglas de venta
- Operaciones masivas
- Auditoría or global audit only in admin/support

Do not show "Próximamente" or roadmap items in primary commercial navigation.

## Habitaciones Y Tarifas UX

Use this mental model:

- Tarifas: commercial readiness and blockers.
- Calendario: daily operation for price, availability, restrictions, sellability, reservations/holds, and condition signals.
- Condiciones: contractual library, assignment matrix, previews, audit, and overrides context.

Do not split daily work into separate pages when the provider needs one operational answer: "Can this date/rate be sold?"

## Conditions UX

Provider-facing conditions should be understandable without reading technical rules.

Show:

- human category names
- preset/name
- status
- usage
- last version
- guest-facing summary
- financial or operational impact
- clear actions: Ver, Publicar, Asignar, Archivar, Historial

For assignment:

- default channel should be hidden or simplified unless channels are truly in use
- scope labels must match hotel context: Tarifa, Habitación, Hotel
- previews must match the selected category
- blue text should be reserved for links/actions

## Calendar UX

Calendar is the operational center.

Each cell should communicate:

- final price
- available units
- sellable state
- missing price/inventory/conditions
- restrictions such as min nights, closed to arrival, closed to departure
- reservations or holds when available

The side panel should expose contextual tabs:

- Precio
- Disponibilidad
- Reglas de venta
- Condiciones aplicables
- Detalle técnico

## Progressive Disclosure

Advanced capabilities belong inside the relevant context:

- occupancy pricing inside Tarifas or pricing tools
- rule sets from Calendario/Reglas de venta
- audit history inside each module
- global audit and overrides inside Admin/Soporte
- taxes/fees in Finanzas, referenced from Condiciones only when they affect refund behavior

## UI System

Prefer shared components:

- Card
- Section
- Button
- Badge
- form/input/select components when available

When touching older UI, improve the local area and avoid introducing new visual patterns. Do not force a full-screen rewrite unless the task asks for it.

## Visual Rules

- Keep layouts dense enough for operations, not marketing-like.
- Avoid nested cards.
- Avoid false links.
- Avoid mixed language.
- Avoid oversized headings inside compact tools.
- Ensure desktop and mobile do not overflow or hide actions.
- Empty, loading, error, disabled, and success states should be accounted for on operational surfaces.

## Review Checklist

- Is the provider reading Spanish business language?
- Is the sidebar showing current usable tasks rather than roadmap?
- Is advanced functionality hidden until relevant?
- Does the page help the provider complete the real workflow?
- Does the UI avoid leaking internal model names?
- Does the page fit desktop and mobile without false interaction signals?
