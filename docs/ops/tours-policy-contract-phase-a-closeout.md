# Cierre de Fase A — Contrato y caracterización de condiciones para tours

**Fecha:** 21 de septiembre de 2026  
**Estado:** completada en código y caracterización.  
**Límite:** no filtra todavía el editor ni cambia asignaciones históricas; esa aplicación pertenece a la Fase B.

## Decisiones de contrato

| Dimensión | Hotel / alojamiento | Tour | Tipo sin contrato |
| --- | --- | --- | --- |
| Categorías disponibles | Cancelación, pago, llegada/salida, no presentación | Cancelación, pago, no presentación | Ninguna |
| Ancla de cancelación | Llegada | Hora programada de salida | No soportada |
| Unidad para nuevas reglas | Días | Horas antes de la salida | Ninguna |
| Base de penalidad de cancelación | Reserva total o tarifa de habitación | Reserva total | Ninguna |
| Base de no presentación | Primera noche, total o porcentaje | Total o porcentaje | Ninguna |
| Pago permitido | Pago en propiedad o prepago | Pago al proveedor durante la experiencia | Ninguno |
| Fastt cobra/custodia fondos | Según modalidad hotelera | No | No |

El valor persistido `pay_at_property` se conserva por compatibilidad, pero en tours significa exclusivamente: el proveedor cobra durante la experiencia; Fastt no autoriza, cobra, custodia ni reembolsa fondos. Las reglas antiguas basadas en días, noches o llegada se conservan para historia y snapshots; no se convierten automáticamente a horas o a la semántica de una salida.

## Consumidores inventariados

| Capa | Consumidor | Responsabilidad |
| --- | --- | --- |
| Página | `src/pages/rates/plans/[ratePlanId].astro` | Contexto de tarifa, pestañas, preguntas y avance del playbook |
| Superficie | `src/components/policy/RatePlanPoliciesSurface.astro` | Estado de condiciones y disparadores de edición |
| Editor | `src/components/policy/PolicyAssignmentFlow.astro` | Plantilla, reutilización, personalización, preview y guardado |
| Opciones | `src/pages/api/policies/assignment-options.ts` | Catálogo de políticas, plantillas y destinos disponibles |
| Preview | `src/pages/api/policies/preview.ts` | Consecuencias antes de asignar |
| Escritura | `src/pages/api/policies/assign.ts` | Propiedad, validación y reemplazo de asignación |
| Dominio | `src/modules/policies/application/use-cases/build-policy-calculation-snapshot.ts` | Cálculo de plazos y snapshots |
| Reserva | `src/pages/api/booking/cancel.ts` | Aplicación financiera de la condición congelada |

## Fixture y regresiones

El contrato se declara en `src/lib/policies/policy-business-contract.ts`; no está conectado todavía a la UI ni a las APIs de filtrado. Los fixtures de hotel, tour y negocio desconocido están separados en `tests/fixtures/policies/business-contract-fixtures.ts`.

Se agregó una regresión de API para reutilización de pago existente: la consulta ahora selecciona `PolicyRule.ruleKey` además del valor y reconoce `paymentType=pay_at_property`. Antes, buscaba una clave que la consulta no había seleccionado y rechazaba la política con un falso `tour_prepayment_not_available`.

## Inventario histórico de tours

Ejecutado con `pnpm exec tsx scripts/db/audit-tour-policy-assignments.ts`. El script sólo realiza `SELECT` y emite JSON; no cambia ninguna fila.

| Total | Resultado |
| --- | --- |
| Asignaciones de tours | 4 |
| Activas | 4 |
| Requieren revisión | 2 |

La única experiencia encontrada, `otra prueba de tour` (`df7746a8-f728-4254-925e-a1e5a510ee7f`), tiene dos asignaciones que deben conservarse y revisarse en la Fase E:

1. **Cancelación flexible** en la tarifa `d31281f5-9363-493f-9815-f805dca63675`: usa un corte basado en días, sin `hoursBeforeDeparture`. Requiere decisión explícita; no se transforma automáticamente.
2. **Llegada/salida estándar** en la misma tarifa: categoría `CheckIn`, propia de alojamiento. Debe sustituirse por la información operativa de la salida cuando la Fase B/D habilite el contrato de tours.

No presentación porcentual al 100% y pago `pay_at_property` aparecen compatibles con el contrato de tours. Este inventario no declara una política histórica inválida para reservas anteriores: clasifica qué necesita reparación antes de nuevas ventas bajo el contrato nuevo.

## Validación ejecutada

```bash
pnpm exec vitest run tests/policies/policy-business-contract.test.ts tests/integration/tour-policy-existing-payment-assignment.test.ts tests/policies/policy-preset-catalog.test.ts tests/ui/tour-payment-terms.test.ts
pnpm exec tsx scripts/db/audit-tour-policy-assignments.ts
```

Resultado: 8 pruebas aprobadas; inventario de sólo lectura completado. La prueba cubre además que la semántica y la plantilla hotelera de larga estadía se mantienen antes de introducir el filtrado para tours.

## Salida de fase

Cada categoría del contrato tiene ancla, unidad, base y semántica de pago verificables. Los datos existentes siguen intactos y los casos históricos que requieren tratamiento están enumerados. La siguiente fase debe consumir este contrato en opciones, preview y escritura, y bloquear incompatibilidades también para llamadas directas a API.
