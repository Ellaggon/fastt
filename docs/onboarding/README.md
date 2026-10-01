# Onboarding y verificación de proveedores

Status: active
Document type: index
Owner: Provider Experience
Last verified: 2026-10-01
Scope: entrada, preparación, verificación por negocio y activación
Source of truth: código y contratos enlazados
Review trigger: cambio de navegación, diagnóstico o autorización

## Empezar por la tarea

| Tarea | Fuente |
| --- | --- |
| Requisitos de alojamiento | [Anexo vigente](../domains/lodging/policy-annex.md) |
| Requisitos de tours | [Matriz BO v1 en borrador](../domains/tours/policy-annex.md); no equivale a una política firmada |
| Ratificación y operación con una persona | [Activación comercial](./phase-4-policy-activation.md) |
| Creación y continuidad de tours | [Playbooks del proveedor](../domains/tours/tour-provider-playbooks.md) |
| Cohortes y métricas del onboarding | [Rollout](./phase-5-rollout.md) |
| Base de pruebas y conectividad | [Aislamiento de datos](../engineering/marketplace-data-isolation.md) |

Para entrada y retorno consultar `src/lib/onboarding/providerOnboardingEntry.ts`.
Para progreso por línea y experiencia consultar `src/lib/verification/` y
`src/lib/provider-verification-workspace.ts`; para autorización comercial,
`src/lib/commercial-policy/`. La interfaz no concede permisos por porcentaje.

## Historia, sólo para investigar regresiones

La [evidencia de preparación y reserva de septiembre](../certifications/onboarding/preparation-2026-09.md)
consolida las pruebas y sus límites; no debe usarse para repetir fases consumidas.

Los planes iniciales de onboarding se retiraron por estar reemplazados por los contratos por línea. Para investigar decisiones anteriores, consultar el historial de Git; no aplicar sus requisitos universales a tours.
