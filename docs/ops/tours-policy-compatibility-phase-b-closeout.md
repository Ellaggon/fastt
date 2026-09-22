# Cierre de Fase B — Compatibilidad de condiciones por negocio

**Fecha:** 21 de septiembre de 2026  
**Estado:** completada en código y regresión automatizada.  
**Depende de:** [contrato y caracterización de la Fase A](./tours-policy-contract-phase-a-closeout.md).

## Resultado

La tarifa sigue compartiendo una sola infraestructura de políticas entre alojamientos y tours. La decisión sobre qué condición puede verse, simularse o asignarse ya no depende de textos ni de filtros del navegador: el servidor resuelve `tarifa/variante/producto`, obtiene el tipo del producto y aplica el contrato de negocio de la Fase A.

| Destino resuelto | Categorías y reglas admitidas                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alojamiento      | Se conserva el catálogo previo: cancelación por estadía, llegada/salida, primera noche y modalidades de pago existentes.                             |
| Tour             | Catálogo propio: cancelación flexible 24 horas y no reembolsable, pago al proveedor durante la experiencia y no presentación por total o porcentaje. |
| Tipo desconocido | No recibe un catálogo por defecto ni puede asignar una política.                                                                                     |

El valor histórico `pay_at_property` sigue siendo compatible en tours, con la semántica de pago al proveedor durante la experiencia. Se rechazan por servidor el prepago, `CheckIn`, estadía corta/larga, plazos de cancelación sólo en días y no presentación basada en primera noche.

## Implementación

- `src/lib/policies/resolve-policy-business-context.ts` resuelve el producto real desde el ámbito de destino; no confía en un tipo enviado por el cliente.
- `src/lib/policies/policy-business-compatibility.ts` concentra el validador sin efectos laterales y los códigos/mensajes de recuperación.
- `assignment-options` exige ámbito y destino válidos, devuelve el contexto y filtra políticas reutilizables y presets para ese destino.
- Las plantillas `tour_flexible_24h` y `tour_non_refundable` tienen identidad, textos y tiers horarios propios; el catálogo de alojamientos no las recibe.
- `preview` y `assign` ejecutan el mismo validador para los modos `existing`, `preset` y `draft`. Una petición directa no puede guardar ni previsualizar una incompatibilidad oculta por la interfaz.
- Un borrador de no presentación para tour se persiste con base `total_booking`; no se genera ya una base de primera noche por defecto.
- `PolicyAssignmentFlow` carga las opciones para el ámbito elegido y limita sus categorías con el contexto devuelto. Esto mejora orientación, pero el control de seguridad es el servidor.

## Compatibilidad histórica

No se modificó ninguna política, asignación ni snapshot existente. La asignación histórica flexible basada en días y la regla `CheckIn` identificadas en Fase A siguen enumeradas para revisión. No aparecen como candidatas reutilizables para la tarifa del tour y tampoco pueden reasignarse ni previsualizarse mediante la API.

Las reservas ya creadas conservan su snapshot. La reparación de las asignaciones históricas y el bloqueo explícito de publicación/venta hasta que se resuelvan pertenecen a la Fase E; no se hace una conversión automática de días a horas ni de primera noche a reserva total.

## Validación ejecutada

```bash
pnpm exec vitest run tests/policies/policy-business-contract.test.ts tests/policies/policy-business-compatibility.test.ts tests/integration/tour-policy-existing-payment-assignment.test.ts tests/policies/policy-preset-catalog.test.ts tests/ui/tour-payment-terms.test.ts
pnpm run build
git diff --check
```

La regresión cubre:

- pago existente `pay_at_property` reutilizable en un tour;
- filtros de catálogo de tours y preservación del contrato hotelero;
- rechazos 409 de `preset`, `existing` y `draft` tanto en preview como en asignación;
- cancelación de larga estadía, no presentación por primera noche y prepago incompatibles.

El build de Astro completó correctamente. Sus advertencias de imports dinámicos ya existentes en el empaquetado de precios no afectan este cambio.

## Evaluación de salida

El objetivo de Fase B se cumple para las rutas contractuales cubiertas: las opciones, la vista previa y la asignación derivan el contexto desde el destino y comparten la misma compatibilidad. No hay vía de API para reutilizar, previsualizar o asignar una política hotelera incompatible a un tour.

Queda trabajo intencional de las fases siguientes, no un bypass de B:

1. **Fase C:** reemplazar la simulación hotelera por un preview fiel a salida, zona horaria, moneda e importes reales.
2. **Fase D:** terminar el vocabulario, navegación, accesibilidad y estados del editor de tours.
3. **Fase E:** reparar con decisión explícita las asignaciones históricas registradas en Fase A y bloquear publicación/venta cuando un tour todavía las tenga.
