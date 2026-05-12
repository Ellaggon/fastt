# Backoffice Governance Baseline

## Purpose

This document is the source of truth for Capa 0: Backoffice Governance Baseline.

The goal is to make the enterprise OTA operating model visible without changing domain runtime behavior. The backoffice must communicate ownership boundaries that already exist in the core architecture:

- Pricing is ratePlan-first.
- Inventory is physical and variant-first where inventory ownership requires it.
- Booking is snapshot-driven.
- Search is read-only.
- Catalog consumes pricing summaries and must not become a pricing engine.
- Internal ops and observability are not normal provider workspace navigation.

## Operating contexts

| Context                      | Purpose                                                | Surface rule                                                   |
| ---------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| Public Marketplace           | Guest-facing discovery and product detail              | Uses public/search layouts only.                               |
| Provider Workspace           | Provider operational workspace                         | Uses WorkspaceLayout and ownership-driven navigation.          |
| Enterprise Operations        | Rooms/rates, reservations, content, finance, analytics | Uses WorkspaceLayout and canonical enterprise sidebar.         |
| Internal Admin               | Platform/provider governance                           | Internal-only unless an admin shell and RBAC exist.            |
| Internal Ops / Observability | Health, debug, backfills, shadow reports               | Never linked directly from provider sidebar.                   |
| Governance                   | Provider settings, verification, controls              | Visible only as administration/governance, not generic system. |
| Support                      | Help, cases, escalation                                | Planned; not active until a support workflow exists.           |

## Shell governance

| Shell              | Status            | Rule                                                        |
| ------------------ | ----------------- | ----------------------------------------------------------- |
| WorkspaceLayout    | Canonical         | Provider workspace and enterprise operations.               |
| DashboardLayout    | Legacy            | Do not use for new provider-facing enterprise operations.   |
| NavDashboardLayout | Legacy            | Horizontal legacy navigation; not the enterprise map.       |
| UILayout           | Public            | Marketplace only.                                           |
| SearchLayout       | Public            | Search/discovery only.                                      |
| Layout             | Transitional base | Auth/public/simple pages only; not a full enterprise shell. |

## Route classification

| Route pattern            | Status        | Context                      | Owner                       |
| ------------------------ | ------------- | ---------------------------- | --------------------------- |
| /dashboard               | Canonical     | Enterprise Operations        | Command Center              |
| /product/\*\*            | Canonical     | Provider Workspace           | Property Content            |
| /rates/plans/\*\*        | Canonical     | Enterprise Operations        | Rooms & Rates               |
| /pricing/bulk            | Canonical     | Enterprise Operations        | Rooms & Rates               |
| /pricing/rules           | Transitional  | Enterprise Operations        | Rooms & Rates               |
| /pricing/calendar        | Legacy        | Enterprise Operations        | Rooms & Rates               |
| /inventory/bulk          | Canonical     | Enterprise Operations        | Rooms & Rates               |
| /booking/\*\*            | Canonical     | Enterprise Operations        | Reservations                |
| /provider/policies/\*\*  | Transitional  | Enterprise Operations        | Rooms & Rates               |
| /provider/tax-fees       | Transitional  | Enterprise Operations        | Payments & Finance          |
| /analytics/\*\*          | Transitional  | Enterprise Operations        | Analytics & Performance     |
| /system/integrations     | Transitional  | Enterprise Operations        | Connectivity                |
| /provider                | Transitional  | Governance                   | Administration & Governance |
| /provider/verification   | Transitional  | Governance                   | Administration & Governance |
| /admin/\*\*              | Internal-only | Internal Admin               | Internal Admin              |
| /api/internal/\*\*       | Internal-only | Internal Ops / Observability | Internal Ops                |
| /, /hotels/**, /tours/** | Public        | Public Marketplace           | Public Marketplace          |

## Canonical enterprise navigation

The sidebar is organized by operational ownership, not by implementation folders.

1. Command Center
2. Rooms & Rates
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

## Navigation rules

- Do not link provider sidebar items directly to /api/internal/\*\*.
- Do not expose legacy /pricing/calendar in primary navigation.
- Do not use a generic System bucket for unrelated governance, connectivity, and provider setup.
- Do not duplicate conceptual entries that navigate to the same route unless they represent different valid contexts.
- Do not create variant-pricing navigation. Variants may provide physical context only.
- Do not expose admin or debug surfaces as provider workspace pages.
- Do not introduce write behavior through search, analytics, or dashboard read paths.

## Migration strategy

Capa 0 establishes governance without building new enterprise modules.

Completed in this baseline:

- The provider sidebar is ownership-driven.
- Direct internal API links were removed from operator navigation.
- /pricing/calendar is declared legacy and removed from primary navigation.
- Provider policies and tax-fees were moved onto WorkspaceLayout.
- DashboardLayout remains declared legacy.
- Governance route and shell classifications are versioned in src/lib/backoffice-governance.ts.
- Guardrails protect the enterprise navigation from internal API and legacy-route leakage.

Next focus after Capa 0:

Capa 1 should harden the enterprise shell itself: responsive behavior, role-aware visibility, route classification UI states, and admin/internal shell separation.
