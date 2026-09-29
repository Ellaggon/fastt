# Auditoría de modos fiscales heredados — 2026-09-28

Status: partial  
Document type: certification  
Owner: Engineering / Finance  
Last verified: 2026-09-28  
Scope: clasificar `invoicingMode` existente sin cambiar su valor ni reescribir reservas  
Source of truth: lectura de solo lectura de Supabase producción (`xnbyxtqpediorzplfryh`) y esquema PostgreSQL vigente  
Related code/tests: `src/shared/infrastructure/db/schema/tables.ts`, `src/lib/provider-tax-configuration.ts`, `src/lib/provider-audit.ts`  
Review trigger: antes de migrar `invoicingMode`, definir emisor por línea o modificar un snapshot histórico

## Método y resultado

El 2026-09-28 se consultaron `ProviderTaxConfiguration`, `ProviderCommercialLine`,
`ProviderAuditLog`, `BookingTaxFee` y `BookingLineItem` dentro de transacciones `READ ONLY`.
Se conservaron sólo resultados agregados; no se exportaron IDs ni datos personales. No se
ejecutaron escrituras ni migraciones.

| Valor actual | Registros y contexto | Clasificación | Acción segura |
| --- | --- | --- | --- |
| `platform_receipt` | 6 perfiles: 5 sin línea comercial (3 fiscales pendientes, 2 verificados) y 1 proveedor mixto verificado. | Valor global que coincide con el valor predeterminado; el historial no prueba una elección por línea. El estado fiscal `verified` no verifica este modo. | No inferir aceptación ni rellenar líneas. Revisar el proveedor mixto antes de cualquier decisión nueva. |
| `hybrid` | 1 perfil fiscal pendiente con línea de tours; sin reservas asociadas. | Valor almacenado no predeterminado, pero sin evidencia suficiente de un acuerdo aceptado o de quién emite cada comprobante. | Confirmar con proveedor y Finanzas. No convertir a otro modo. |
| `provider_invoice` | 1 perfil fiscal pendiente con línea de alojamiento; sin reservas asociadas. | Control fuera del alcance principal de esta revisión; conservar como está. | No modificar como parte de una revisión de tours. |

El historial contiene tres escrituras `provider.tax_configuration.upsert` y ninguna transición
registrada entre un modo anterior y el actual. Hay escrituras que registran `platform_receipt` o
`hybrid`; por sí solas no acreditan aceptación contractual ni autoridad para emitir. El campo
es global por proveedor; no distingue tours de alojamientos.

El perfil mixto tiene 10 reservas. En sus 10 `BookingTaxFee.breakdownJson` y 10
`BookingLineItem.pricingBreakdownJson` revisados no aparece `invoicingMode`. Estos snapshots
permanecen intactos. Este resultado cubre esos campos y filas, no otros documentos fiscales
o snapshots que no se enumeran aquí.

También hay 6 filas de `ProviderCommercialLine`, todas con `collectionModel = undecided`.
Dos líneas (una de alojamiento y una de tours) no tienen `ProviderTaxConfiguration`; no se
debe crearles un modo implícito a partir del valor predeterminado.

## Tratamiento pendiente

- Solicitar confirmación del emisor fiscal por línea a los proveedores afectados y revisión de
  Finanzas antes de registrar una decisión nueva.
- Mantener los valores históricos legibles para auditoría; no convertir `hybrid` ni
  `platform_receipt` automáticamente.
- Cualquier decisión nueva debe tener alcance por línea, titular, vigencia y aceptación. Se
  aplica sólo a reservas futuras y conserva las versiones anteriores.
- No cambiar precios, cobros ni snapshots de las 10 reservas por este hallazgo. El modo fiscal
  global no demuestra quién cobró una reserva ni autoriza a Fastt a emitir un documento.

## Límites

La auditoría técnica no establece la intención original del proveedor ni determina el emisor
exigido por la normativa. Esa revisión necesita confirmación del titular y criterio de Finanzas.
Hasta entonces, estos valores quedan clasificados como pendientes de decisión, no como
configuración aprobada.
