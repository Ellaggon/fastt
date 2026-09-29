# Certificación financiera transversal: reserva, pago y cancelación — 2026-09-28

Status: partial  
Document type: certification  
Owner: Engineering / Finance  
Last verified: 2026-09-28  
Scope: reserva confirmada, evidencia de pago, conciliación, cancelación, comisión y separación de líneas  
Source of truth: contratos financieros y de dinero real enlazados desde los índices del dominio  
Related code/tests: `src/modules/financial/`, `src/lib/verification/commercial-lines.ts`, `tests/integration/financial-reconciliation.test.ts`, `tests/integration/tour-booking-e2e.test.ts`, `tests/integration/refund-cancellation-engine.test.ts`, `tests/integration/tour-p2-runtime-trust.test.ts`, `tests/integration/financial-stage3-reconciliation.test.ts`, `tests/integration/financial-stage4-provider-finance.test.ts`, `tests/integration/provider-commercial-collection-guard.test.ts`  
Review trigger: integrar un procesador, ratificar acuerdos de comisión/emisión fiscal o añadir alcance por línea a Finanzas de Proveedor

## Resultado

La certificación es parcial. En la base Supabase aislada de pruebas se verificó que una reserva
de alojamiento y una reserva de tour pueden quedar `confirmed` sin evidencia de pago; la
conciliación del alojamiento informa `missing_payment`. Las pruebas unitarias de conciliación
aceptan un pago importado y una liquidación sólo cuando coinciden reserva, importe y moneda, y
detectan evidencia ausente o discrepante. Esto verifica el registro y la conciliación de evidencia,
no una captura de dinero en Fastt.

También pasaron los escenarios automatizados de cancelación: alojamiento registra una cotización
y un ledger de reembolso idempotentes; tour anula el voucher y deja la reserva cancelada, y repetir
la cancelación no duplica el efecto. Ninguna prueba envió fondos ni llamó a un procesador real.

La actualización de una línea comercial conserva la otra: cambiar alojamiento a `property_collect`
dejó tours en `undecided`, y las declaraciones no soportadas se rechazaron. Es una garantía de
selección/configuración; no demuestra que la comisión financiera posterior esté separada por
línea.

## Evidencia ejecutada

- `financial-reconciliation.test.ts`: los casos de integración PostgreSQL pasaron; el caso de
  reserva pendiente de pago comprueba que el alojamiento sigue `confirmed`, sin transacciones,
  pagos ni liquidaciones, y que la conciliación no lo presenta como pagado.
- `tour-booking-e2e.test.ts`: pasó el recorrido búsqueda → hold → reserva confirmada y comprobó
  que no existe evidencia de pago asociada a esa reserva.
- `refund-cancellation-engine.test.ts` y `tour-p2-runtime-trust.test.ts`: pasó una cancelación
  por línea; para el test de tour se activaron los feature flags de certificación del entorno
  aislado.
- `financial-stage3-reconciliation.test.ts`: fixtures verifican coincidencia de captura
  importada/liquidación y rechazos por falta de liquidación, importe o moneda.
- `financial-stage4-provider-finance.test.ts`: fixtures verifican que no se presenta un payable
  cuando falta un snapshot de comisión.
- `provider-commercial-collection-guard.test.ts`: pasó con aislamiento de persistencia; prueba
  rechazo de modos no soportados y que alojamiento y tours conservan declaraciones distintas.
- `pnpm run check` terminó con cero errores; `pnpm run build` terminó correctamente. El build
  mantiene advertencias preexistentes de división de chunks.

Las integraciones con base usaron el proyecto aislado de pruebas (`FASTT_DATA_ENV=test`), nunca
Supabase de producción. No se escribieron reservas reales ni se ejecutaron migraciones en
producción.

## Límites que impiden declarar verde el recorrido completo

1. **Pago acreditado real:** Fastt no tiene procesador activo. El modelo admite evidencia externa
   importada y conciliación, pero no se probó una captura real ni un webhook de PSP. Véase
   [Activación de dinero real](../../payments/live-money-activation.md).
2. **Comisión acordada:** las pruebas financieras usan tasas sintéticas. El acuerdo de tours sigue
   siendo un borrador que requiere aceptación por proveedor. `CommissionSnapshot` no conserva una
   versión de acuerdo ni identidad de línea; los cálculos actuales no certifican una comisión
   contractual independiente para un proveedor mixto. No usar esos fixtures como deuda exigible.
3. **Cancelación y dinero:** los ledgers y cotizaciones prueban cálculo, estado e idempotencia; no
   acreditan que un reembolso se haya enviado al medio de pago.
4. **Documento fiscal:** `fiscal_snapshot`/recibo deriva del precio reservado. No es una factura
   emitida ni evidencia de pago. La auditoría de modos heredados sigue pendiente de decisión sobre
   emisor y alcance por línea.
5. **Certificación operativa:** no se probó un recorrido visual autenticado en navegador con un
   pago real o con un proveedor que haya aceptado una comisión por línea.

No se alteraron datos históricos, aprobaciones ni snapshots de reservas. Para cerrar esta
certificación se necesita un acuerdo aceptado por proveedor con versión y alcance por línea,
facturación definida por línea, y un adaptador de pago/reembolso habilitado y probado en sandbox
del PSP antes de cualquier liberación de dinero real.
