# Backoffice Governance Baseline

## Purpose

This document is the source of truth for Capa 0: Backoffice Governance Baseline.

The baseline makes the OTA operating model visible without changing domain runtime behavior. It governs shells, routes, navigation, ownership, and context boundaries so the backoffice does not drift back into a generic admin panel.

Runtime invariants remain unchanged:

- Pricing is ratePlan-first.
- Inventory is physical and variant-first where inventory ownership requires it.
- Booking is snapshot-driven.
- Search is read-only.
- Catalog consumes pricing summaries and must not become a pricing engine.
- Internal ops and observability are not provider workspace navigation.

## Operating contexts

| Context                      | Purpose                                                      | Surface rule                                                     |
| ---------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Public Marketplace           | Guest-facing discovery, auth, search, and product detail     | Uses public/search/base layouts only.                            |
| Provider Workspace           | Provider operational workspace                               | Uses WorkspaceLayout and ownership-driven navigation.            |
| Enterprise Operations        | Rooms/rates, reservations, content, finance setup, analytics | Uses WorkspaceLayout and canonical enterprise sidebar.           |
| Internal Admin               | Platform/provider governance                                 | Uses InternalAdminLayout only.                                   |
| Internal Ops / Observability | Health, debug, backfills, shadow reports                     | Internal-only APIs; never linked directly from provider sidebar. |
| Governance                   | Provider settings, verification, controls                    | Visible only as Administration & Governance.                     |
| Support                      | Help, cases, escalation                                      | Planned; not active until support workflow exists.               |

## Shell governance

| Shell               | Status            | Rule                                                             |
| ------------------- | ----------------- | ---------------------------------------------------------------- |
| WorkspaceLayout     | Canonical         | Provider workspace and enterprise operations.                    |
| InternalAdminLayout | Canonical         | Internal admin surfaces only.                                    |
| DashboardLayout     | Compatibility     | Alias over WorkspaceLayout; it must not own separate navigation. |
| NavDashboardLayout  | Legacy isolated   | Not the enterprise navigation map and not used by active pages.  |
| UILayout            | Public            | Marketplace only.                                                |
| SearchLayout        | Public            | Search/discovery only.                                           |
| Layout              | Transitional base | Auth/public/simple pages only; not a provider workspace shell.   |

## Route governance

Route governance is versioned in `src/lib/backoffice-governance.ts` and enforced by `tests/guardrails/backoffice-governance-navigation.test.ts`.

Mandatory coverage:

- Every `src/pages/**/*.astro` route must match one governance classification.
- Every `src/pages/api/**/*.ts` route must match one governance classification.
- `/api/internal/**` defaults to internal-only, except explicitly classified provider-facing BFF/read/operational endpoints.
- `/admin/**` must remain internal-admin.
- `/pricing/**` routes remain legacy redirect/contextual compatibility and must not be exported as primary route helpers.
- `DashboardLayout` may exist only as a WorkspaceLayout compatibility alias; active pages must not use it as an independent shell.
- `InternalAdminLayout` may only be used under `src/pages/admin/**`.
- Provider-facing pages may not call APIs classified as `internal-only`.
- Navigation targets must match their route classification status and owner.
- Active pages must use the shell expected by their route governance context.

## Primary route ownership families

| Route pattern                                                          | Status                   | Context                      | Owner                       |
| ---------------------------------------------------------------------- | ------------------------ | ---------------------------- | --------------------------- |
| /dashboard                                                             | Canonical                | Enterprise Operations        | Command Center              |
| /product/\*\*                                                          | Canonical                | Provider Workspace           | Property Content            |
| /rates/plans/\*\*                                                      | Canonical                | Enterprise Operations        | Rooms & Rates               |
| /rates/calendar                                                        | Canonical                | Enterprise Operations        | Rooms & Rates               |
| /rates/restrictions                                                    | Canonical                | Enterprise Operations        | Rooms & Rates               |
| /pricing, /pricing/rules, /pricing/calendar                            | Legacy                   | Enterprise Operations        | Rooms & Rates               |
| /inventory, /inventory/bulk                                            | Transitional             | Enterprise Operations        | Rooms & Rates               |
| /booking/\*\*                                                          | Canonical                | Enterprise Operations        | Reservations                |
| /provider/policies/\*\*                                                | Canonical                | Enterprise Operations        | Rooms & Rates               |
| /provider/tax-fees                                                     | Transitional             | Enterprise Operations        | Payments & Finance          |
| /analytics/\*\*                                                        | Transitional             | Enterprise Operations        | Analytics & Performance     |
| /system/integrations                                                   | Transitional             | Enterprise Operations        | Connectivity                |
| /provider, /provider/verification                                      | Transitional             | Governance                   | Administration & Governance |
| /provider/profile, /provider/register                                  | Legacy                   | Governance                   | Administration & Governance |
| /admin/\*\*                                                            | Internal-only            | Internal Admin               | Internal Admin              |
| /api/internal/dashboard-summary                                        | Canonical                | Enterprise Operations        | Command Center              |
| /api/internal/product-summary                                          | Canonical                | Provider Workspace           | Property Content            |
| /api/internal/variants-summary, /api/internal/variant-summary          | Canonical                | Provider Workspace           | Property Content            |
| /api/internal/availability-summary, /api/internal/inventory/recompute  | Canonical / Transitional | Enterprise Operations        | Rooms & Rates               |
| /api/internal/provider-bookings-summary, /api/internal/booking-summary | Canonical                | Enterprise Operations        | Reservations                |
| /api/internal/provider-summary                                         | Transitional             | Governance                   | Administration & Governance |
| /api/internal/\*\*                                                     | Internal-only fallback   | Internal Ops / Observability | Internal Ops                |
| /api/pricing/**, /api/rateplans/**, /api/rates/\*\*                    | Canonical                | Enterprise Operations        | Rooms & Rates               |
| /api/inventory/\*\*                                                    | Canonical                | Enterprise Operations        | Rooms & Rates               |
| /api/booking/\*\*                                                      | Canonical                | Enterprise Operations        | Reservations                |
| /api/product/**, /api/products/**, /api/variant/\*\*                   | Canonical                | Provider Workspace           | Property Content            |
| /api/provider/**, /api/providers/**                                    | Transitional             | Governance                   | Administration & Governance |
| /api/admin/\*\*                                                        | Internal-only            | Internal Admin               | Internal Admin              |
| /, /hotels/**, /tours/**, /api/search-v2                               | Public                   | Public Marketplace           | Public Marketplace / Search |

## Canonical enterprise navigation

The sidebar is organized by operational ownership, not implementation folders.

1. Command Center
2. Habitaciones y tarifas
3. Reservations
4. Property Content
5. Payments & Finance
6. Analytics & Performance
7. Connectivity
8. Administration & Governance

The following modules remain planned and must not be represented as mature operational surfaces yet:

- Revenue Management
- Marketing
- Guest Relations / CRM
- Opportunities
- Support Operations
- Observability Console
- Administration RBAC

## Capa 1 enterprise shell canonicalization

WorkspaceLayout is no longer a generic dashboard wrapper. It is the canonical enterprise
operations shell and must derive its visible context from `backofficeRouteClassifications`
and `enterpriseNavigation`.

The enterprise shell must show:

- active ownership section,
- human-readable route governance status (`Operational` or `Transitional`),
- human-readable operational context (`Enterprise Operations`, `Provider Workspace`, `Governance`),
- provider account session,
- a page-level context panel that explains ownership and maturity,
- planned modules as collapsed, non-clickable roadmap markers only.

Transitional modules are allowed in navigation when they represent real, governed surfaces,
but they must be visually marked as transitional in both navigation and shell context.
Planned modules must not link anywhere until a real route and ownership classification exist.
They are collapsed by default to avoid roadmap clutter.

## Capa 2 Rooms & Rates operating model

Habitaciones y tarifas is calendar-first. It is not a generic ARI hub and it must not expose
future maturity as primary navigation. The provider-facing mental model is:

- **Tarifas:** commercial rate plans attached to rooms, including price base, commercial
  readiness and links to resolve missing setup.
- **Calendario:** daily operating surface for price, available units, sellability, sales
  rules, reservations/holds and applicable conditions.
- **Condiciones:** contractual matrix and library for cancellation, payment, no-show and
  check-in/check-out terms by rate, room, hotel and channel scope.

Advanced tools exist only by progressive disclosure: role, provider scale or explicit
professional-tools preference. They may appear as contextual or professional surfaces, but
must not clutter the small-provider sidebar.

- **Inventario físico:** advanced physical inventory detail; daily unit operation lives in
  Calendario.
- **Reglas de venta:** professional sale-rule workspace for recurrent min-stay, stop-sell,
  arrival/departure and booking-window rules.
- **Operaciones masivas:** batch price/inventory/rule actions inside the calendar operating
  context.

The canonical operating map lives in `roomsAndRatesOperationalMap` inside
`src/lib/backoffice-governance.ts`. CI enforces that physical lanes do not navigate into
pricing mutation ownership, commercial lanes do not navigate into variant internals, and
provider navigation stays calendar-first.

## Navigation rules

- Do not link provider sidebar items directly to `/api/**`.
- Do not expose legacy `/pricing/**` in primary navigation.
- Do not export `routes.pricingCalendar()` as a normal helper.
- Keep `/rates/calendar` as the daily operating surface for price, cupo, sale rules and
  applicable conditions.
- Keep the small-provider sidebar focused on Tarifas, Calendario and Condiciones.
- Expose Inventario físico, Reglas de venta and Operaciones masivas only through progressive
  disclosure.
- Do not export route helpers for nonexistent pages.
- Do not use a generic System bucket for governance, connectivity, or provider setup.
- Do not duplicate conceptual entries that navigate to the same route unless they represent different valid contexts.
- Do not create variant-pricing navigation. Variants may provide physical context only.
- Do not expose admin/debug/backfill/shadow-report surfaces as provider workspace pages.
- Do not call endpoints classified as internal-only from provider-facing pages.
- Do not introduce write behavior through search, analytics, or dashboard read paths.
- Do not render planned modules as active navigation links.
- Do not hide transitional state by folding it into canonical-looking labels.
- WorkspaceLayout must use the route governance SoT to render owner/context/status.
- Do not expose raw governance enum values such as `enterprise-operations` in operator UI.
- Do not add a WorkspaceLayout page without the shared page-level context panel.

## Completed baseline

- Provider sidebar is ownership-driven and consumes `enterpriseNavigation`.
- Direct internal API links were removed from operator navigation.
- Provider-facing `/api/internal/*` BFF/read endpoints are explicitly classified; true internal ops remain internal-only.
- `/pricing/**` routes are legacy redirect/contextual compatibility, removed from primary navigation.
- `routes.catalog()` was removed because no `/catalog` surface exists.
- Condiciones runs as a canonical Rooms & Rates surface; taxes/fees run as a transitional
  Payments & Finance surface.
- Internal admin pages run on `InternalAdminLayout`.
- Internal admin product review no longer depends on provider context or redirects to provider workspace.
- `DashboardLayout` no longer owns navigation; it may exist only as WorkspaceLayout compatibility.
- Astro page and API route governance coverage is enforced in CI.
- Navigation guardrails block internal-only and legacy-route leakage.
- Shell/context alignment and navigation/owner compatibility are enforced in CI.
- WorkspaceLayout now renders governance-aware owner, context, and route status.
- Transitional navigation items are visually marked without changing their labels.
- Planned modules are collapsed roadmap markers, not active workspaces.
- Topbar uses human-readable operational context labels instead of raw governance enums.
- WorkspaceLayout renders a shared page-level context panel for all workspace pages.
- Habitaciones y tarifas exposes Tarifas, Calendario and Condiciones as the primary operating
  flow, with advanced inventory/rules/bulk operations behind progressive disclosure.

## Residual debt accepted after Capa 0

- `NavDashboardLayout` still exists as isolated legacy debt and is not the enterprise navigation source.
- Several surfaces remain transitional by design: Analytics, Connectivity, taxes/fees, provider settings, verification.
- `/system/integrations` keeps its historical path for compatibility, but visible ownership is Connectivity.
- Several provider-facing BFF endpoints still live under `/api/internal/*` for URL compatibility, but their governance classification is no longer internal-only.
- Full role-aware permissions remain future work; Capa 1 only canonicalizes visible shell/navigation governance.
