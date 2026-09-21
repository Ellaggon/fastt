# Cierre de Fase C — Preview fiel y cálculo temporal de tours

**Fecha:** 21 de septiembre de 2026  
**Estado:** completada en código y regresión automatizada.

## Resultado

El endpoint de preview identifica el negocio desde la tarifa y, para tours, deja de reutilizar el resumen financiero hotelero. Resuelve desde el destino la hora de salida de la variante, la zona horaria y moneda del perfil del proveedor. La fecha se usa sólo cuando una salida la aporta: si falta, se declara la falta y no se inventa un límite absoluto.

El resultado para tours separa tres conceptos:

- **Resumen público:** condición de cancelación, pago o no presentación expresada respecto de la salida.
- **Escenarios contractuales:** antes, en y después del corte, sin convertirlos en una liquidación ficticia.
- **Estado de cobro:** pago al proveedor durante la experiencia; Fastt no cobra, custodia ni promete reembolsar ese pago.

El preview no devuelve `quotes` para tours y descarta cualquier `grossAmount` arbitrario enviado por el navegador. Por ello desaparecen BOB 1.000, dos noches, estadía de 28 noches e impuestos/cargos 80/12/8 que el editor anterior fabricaba.

## Implementación

- [build-tour-policy-preview.ts](../../src/lib/policies/build-tour-policy-preview.ts) construye una presentación específica por categoría sin montos cuando no existe cotización autorizada.
- [preview.ts](../../src/pages/api/policies/preview.ts) obtiene hora de salida desde `TourSlotProfile`, zona horaria y moneda desde `ProviderProfile`, y responde `previewContext` con los datos disponibles.
- El camino de alojamientos conserva el preview financiero anterior.

## Validación

Se ejecutaron `pnpm exec vitest run tests/integration/tour-policy-existing-payment-assignment.test.ts tests/policies/policy-business-compatibility.test.ts --reporter=verbose`, `pnpm run build` y `git diff --check`.

La integración certifica que el preview de pago de tour devuelve `quotes: null`, marca que falta cotización y afirma que Fastt no cobra, custodia ni reembolsa el pago al proveedor. Las pruebas de compatibilidad y los rechazos de API de Fase B permanecen aprobados.

## Evaluación de salida

La salida de Fase C se cumple para el editor: ninguna cifra ilustrativa se presenta como cotización y el pago posterior no promete un reembolso de Fastt. El preview usa la hora, zona y moneda disponibles del destino y no inventa una fecha de salida.

La paridad de un importe final con una reserva requiere que el editor reciba una selección concreta de fecha, participantes y tarifa desde la disponibilidad. Esa conexión de navegación y estado pertenece a la Fase D; una vez exista, debe enviar la fecha seleccionada y usar el snapshot del hold para mostrar una cotización autorizada.
