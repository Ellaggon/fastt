# Fiscalidad de ventas: contrato de transición v1

## Límites de dominio

- **Fiscalidad de ventas** administra reglas que cambian el precio mostrado o cobrado al huésped.
- **Identidad fiscal** permanece en `/provider/settings/verification/fiscal` y es la única fuente de residencia fiscal, registro empresarial, NIT y modo de facturación.
- Una definición comercial no debe guardar NIT, residencia del proveedor ni documentos de identidad.

## Fuente de verdad e inventario

| Superficie | Fuente o contrato |
| --- | --- |
| Definiciones | `TaxFeeDefinition` y `/api/provider/tax-fees/definitions` |
| Asignaciones | `TaxFeeAssignment` y `/api/provider/tax-fees/assignments` |
| Simulación | `/api/provider/tax-fees/preview` y `computeTaxBreakdown` |
| Búsqueda y hold | `resolveEffectiveTaxFees` → `PriceQuote` |
| Reserva y recibo | `BookingTaxFee`, `PriceQuote` y documento fiscal de reserva |
| Canal | `buildChannelTaxFeePayload` y `/api/booking/[bookingId]/channel-tax-payload` |
| Reportes | snapshots de reserva, reembolsos y `/api/provider/tax-fees/reports` |

Los campos activos de `TaxFeeDefinition` son: `code`, `name`, `kind`, `calculationType`, `value`, `currency`, `inclusionType`, `appliesPer`, `priority`, `jurisdictionJson`, `effectiveFrom`, `effectiveTo` y `status`.

Los campos activos de `TaxFeeAssignment` son: `taxFeeDefinitionId`, `scope`, `scopeId`, `channel` y `status`.

## Resolución y publicación

- Versión del contrato: `fiscality_contract_v1`.
- Cadena de especificidad para explicar el resultado: tarifa → unidad → producto → proveedor.
- Estrategia vigente: **acumulación**. Una asignación directa no sustituye una regla heredada durante esta transición; todas las asignaciones activas válidas entran al cálculo.
- Orden de cálculo actual: prioridad ascendente, fecha de creación ascendente e identificador. No se añade un desempate por alcance en Fase 0 para evitar alterar importes ya publicados.
- Canal: una asignación del canal solicitado y una asignación sin canal se acumulan.
- Una definición solo entra a ventas si su estado persistido es `active`, está dentro de vigencia y es válida para cálculo.

## Estados oficiales de interfaz

| Estado | Regla de transición |
| --- | --- |
| `draft` | Definición sin asignaciones. |
| `scheduled` | Inicio de vigencia futuro. |
| `active` | Al menos una asignación activa y regla vigente. |
| `paused` | Tiene asignaciones, ninguna activa. |
| `expired` | Fin de vigencia pasado. |
| `conflict` | Tiene asignaciones activas equivalentes duplicadas. |
| `archived` | Estado persistido archivado. |

Estos estados son derivados en Fase 0; el almacenamiento continúa usando `active` y `archived` hasta la migración de versionado.

## Rutas de compatibilidad

| Ruta | Comportamiento durante transición |
| --- | --- |
| `/provider/settings/tax-fees` | Workspace actual de fiscalidad de ventas. |
| `/provider/settings/tax-fees/identity` | Redirige a Verificación fiscal. |
| `/provider/settings/tax-fees/sales` | Redirige al workspace fiscal. |
| `/provider/settings/tax-fees/reports` | Se mantiene disponible hasta que Actividad absorba reportes. |

## Auditoría antes de migrar

Ejecutar `pnpm exec tsx src/scripts/audit-fiscality-configuration.ts --provider=<id>` y resolver o aceptar explícitamente cada hallazgo antes de aplicar cambios de esquema.
