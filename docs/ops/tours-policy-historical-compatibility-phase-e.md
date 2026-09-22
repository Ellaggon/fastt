# Fase E — Compatibilidad histórica y despliegue de políticas de tours

## Procedimiento controlado

1. Ejecutar el inventario de sólo lectura: `pnpm exec tsx scripts/db/audit-tour-policy-assignments.ts`.
2. Clasificar cada hallazgo:
   - **Compatible:** pago `pay_at_property`, no-show por total/porcentaje y cancelación con horas antes de la salida.
   - **Adaptable con decisión:** cancelación histórica por días. El proveedor debe elegir una nueva ventana en horas; nunca se convierte sola.
   - **Pendiente de reemplazo:** `CheckIn` hotelero, primera noche, prepago o estadía larga. Se reemplaza por una condición de tour o se elimina la asignación después de definir la operación de salida.
3. Crear/asignar una nueva política desde la tarifa. La escritura genera una versión/relación nueva; no edita la política histórica ni snapshots de reservas.
4. Confirmar preview, disponibilidad y la nueva política efectiva. Conservar evidencia del identificador anterior y el nuevo.
5. Reintentar publicación. El control de publicación bloquea tours que aún resuelven políticas incompatibles y devuelve `tour_policy_compatibility_review_required`.

## Reversión

Revertir sólo la asignación nueva al identificador/versionado anterior si la revisión comercial falla. No ejecutar migraciones que reescriban `daysBeforeArrival`, `first_night`, pagos ni snapshots. La reversión de código debe mantener las reglas guardadas como datos históricos; puede desactivar el bloqueo de publicación sólo mediante un cambio versionado y revisado.

## Estado de datos conocido

El inventario de Fase A registró dos hallazgos para `df7746a8-f728-4254-925e-a1e5a510ee7f`: una cancelación por días (adaptable con decisión explícita) y una condición `CheckIn` hotelera (pendiente de reemplazo). No se mutaron durante esta fase.
