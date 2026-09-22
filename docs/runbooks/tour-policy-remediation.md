# Reparación de políticas históricas de tours

Status: active  
Document type: runbook  
Owner: Tours / Operations  
Last verified: 2026-09-22  
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

## Reversión

Si la revisión comercial falla, restaurar la asignación anterior por su identificador/versionado y deshabilitar la nueva. No reescribir `daysBeforeArrival`, `first_night`, pagos ni snapshots. Cualquier relajación temporal del gate de publicación exige un cambio de código revisado y una ventana de despliegue registrada.

## Inventario conocido

La lectura del 21 de septiembre de 2026 encontró cuatro asignaciones activas y dos que requerían revisión en el tour `df7746a8-f728-4254-925e-a1e5a510ee7f`: cancelación basada en días y `CheckIn` hotelero. El dato es evidencia fechada; volver a ejecutar el inventario antes de operar.
