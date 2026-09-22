# Certificación de ficha y checkout de tours — septiembre 2026

Status: pending-operational-evidence  
Document type: certification  
Owner: Tours / QA  
Last verified: 2026-09-22  
Scope: ficha pública, selección, hold, checkout, confirmación y recuperación  
Source of truth: código de ficha, inventario y checkout; esta página registra evidencia
Related code/tests: `src/pages/tours/`, `src/pages/booking/`, `tests/integration/tour-booking-e2e.test.ts`  
Review trigger: completar la matriz pendiente o cambiar el contrato de ficha, hold o checkout

## Cierre automatizado

El código congela salida, tarifa, fechas, participantes, moneda, precio, preguntas y políticas en el hold. Checkout exige identidad, el `priceQuoteId` del hold y respuestas obligatorias. La confirmación es idempotente por hold, rechaza otra cuenta y recupera una reserva existente después de una respuesta perdida. Tours sólo admite pago al proveedor durante la experiencia.

Las pruebas focalizadas y la integración PostgreSQL aprobaron el 19 de septiembre de 2026. Incluyeron snapshot de preguntas, confirmación, reintento, propiedad, viaje y voucher.

## Matriz pendiente de ficha

- Dos tarifas con condiciones diferentes y cambio sin estado residual.
- Salida compartida con idiomas y grupo mixto.
- Salida privada como solicitud/cotización, sin hold instantáneo.
- Cupo agotado con alternativa útil.
- Galería con una/varias fotos, móvil, teclado y lector.
- Ficha útil sin fecha y sin coordenadas.

## Matriz pendiente de checkout

- Sin sesión y sesión vencida con retorno al mismo hold.
- Pregunta obligatoria ausente.
- Cambio de precio o tarifa.
- Último cupo y doble clic.
- Hold vencido.
- Pérdida de respuesta y recuperación.
- Política de pago incompatible.
- Reserva visible sólo para el comprador en `/trips`.

## Criterio de cierre

Todos los escenarios deben registrar `passed` en un proveedor controlado, sin datos personales en la evidencia. Un fallo abre una corrección ligada al escenario. No ampliar rollout basándose únicamente en fixtures o pruebas de superficie.
