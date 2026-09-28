# Onboarding y verificación de proveedores

Status: active
Document type: index
Owner: Provider Experience
Last verified: 2026-09-28
Scope: entrada, preparación, verificación por negocio y activación
Source of truth: código y contratos enlazados
Review trigger: cambio de navegación, diagnóstico o autorización

## Empezar por la tarea

| Tarea | Fuente |
| --- | --- |
| Requisitos de alojamiento | [Anexo vigente](../domains/lodging/policy-annex.md) |
| Requisitos de tours | [Matriz BO v1 en borrador](../domains/tours/policy-annex.md); no equivale a una política firmada |
| Ratificación y operación con una persona | [Activación comercial](./phase-4-policy-activation.md) |
| Creación y continuidad de tours | [Flujo del proveedor](../domains/tours/provider-workflow.md) |
| Cohortes y métricas del onboarding | [Rollout](./phase-5-rollout.md) |
| Base de pruebas y conectividad | [Aislamiento de datos](../engineering/marketplace-data-isolation.md) |

Para entrada y retorno consultar `src/lib/onboarding/providerOnboardingEntry.ts`.
Para progreso por línea y experiencia consultar `src/lib/verification/` y
`src/lib/provider-verification-workspace.ts`; para autorización comercial,
`src/lib/commercial-policy/`. La interfaz no concede permisos por porcentaje.

## Historia, sólo para investigar regresiones

El [contrato inicial](./phase-0-contract.md) y la
[auditoría de septiembre](../fastt-onboarding-ux-audit-2026-09-13.md) describen el proyecto
antes de la verificación por línea. Sus planes y estados no sustituyen los contratos actuales.
La [evidencia de preparación y reserva de septiembre](../certifications/onboarding/preparation-2026-09.md)
consolida las pruebas y sus límites; no debe usarse para repetir fases consumidas.
