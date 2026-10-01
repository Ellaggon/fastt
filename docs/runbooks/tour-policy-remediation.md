# Reparación de políticas históricas de tours

Status: active  
Document type: runbook  
Owner: Tours / Operations  
Last verified: 2026-10-01
Scope: detectar y reemplazar condiciones incompatibles sin alterar reservas anteriores  
Source of truth: `scripts/db/audit-tour-policy-assignments.ts` y `src/lib/policies/audit-tour-policy-compatibility.ts`  
Related code/tests: `src/lib/product/canonical-product-publication.ts`, pruebas de compatibilidad de políticas
Review trigger: cambio del catálogo, compatibilidad o asignación de políticas de tours

## Preparación

Ejecutar el inventario de sólo lectura:

```bash
pnpm exec tsx scripts/db/audit-tour-policy-assignments.ts
```

Clasificar cada resultado:

- `compatible`: pago `pay_at_property`, no-show por total/porcentaje y cancelación con horas.
- `decision_required`: cancelación por días; el proveedor debe elegir una ventana en horas.
- `replacement_required`: `CheckIn`, primera noche, prepago o estadía larga.

## Reparación

1. Registrar producto, variante, tarifa, política anterior y motivo.
2. Elegir explícitamente una condición compatible en el editor de la tarifa.
3. Crear/asignar una nueva versión. No editar la versión histórica.
4. Confirmar preview, salida, zona horaria, disponibilidad y política efectiva.
5. Registrar el identificador nuevo y conservar el anterior para trazabilidad.
6. Reintentar publicación. No debe quedar `tour_policy_compatibility_review_required`.

Nunca convertir días a horas ni primera noche a reserva total de manera automática. Los holds y reservas existentes conservan su snapshot.

## Retiro controlado de `CheckIn`

Desde las condiciones de una tarifa bloqueada, **Revisar condición heredada** consulta las asignaciones activas del producto, opción y tarifa seleccionados. Muestra alcance, canal y vigencia antes de **Confirmar retiro en este alcance**. Una asignación del producto afecta a todas sus opciones/tarifas; una de opción afecta a sus tarifas. Se retira una asignación por confirmación y se reevalúa la pantalla conservando URL y selección.

`/api/policies/repair-tour-checkin` exige proveedor autenticado, tarifa propia de tours y confirmación explícita. La transacción vuelve a comprobar categoría, sujeto y relación con la oferta; desactiva sin borrar, registra actor, asignación y contexto con motivo `tour_historical_checkin_removed`. Reintentos y concurrencia no duplican auditoría. Se invalidan diagnóstico y resolución efectiva del alcance afectado. No modifica políticas, versiones ni snapshots anteriores; tampoco reemplaza cancelación ni habilita venta automáticamente.

Las asignaciones globales no pueden retirarse desde la cuenta del proveedor: requieren revisión interna porque su alcance excede ese tour. Si no hay asignaciones retirables y persiste el bloqueo, usar soporte. Tras una respuesta perdida, actualizar para verificar el estado antes de reintentar; no inferir éxito de un fallo de red.

Referencia ejecutable: `tests/integration/tour-checkin-repair.test.ts` (PostgreSQL aislado: concurrencia, actor/propiedad, hoteles, categoría, snapshot histórico); `tests/policies/tour-checkin-repair-api.test.ts` (contrato HTTP).

## Reversión

Si la revisión comercial falla, restaurar la asignación anterior por su identificador/versionado y deshabilitar la nueva. No reescribir `daysBeforeArrival`, `first_night`, pagos ni snapshots. Cualquier relajación temporal del gate de publicación exige un cambio de código revisado y una ventana de despliegue registrada.

## Inventario conocido

La lectura del 21 de septiembre de 2026 encontró cuatro asignaciones activas y dos que requerían revisión en el tour `df7746a8-f728-4254-925e-a1e5a510ee7f`: cancelación basada en días y `CheckIn` hotelero. El dato es evidencia fechada; volver a ejecutar el inventario antes de operar.
