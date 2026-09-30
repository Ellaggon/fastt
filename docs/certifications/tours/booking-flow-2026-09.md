# Certificación de ficha y checkout de tours — septiembre 2026

Status: pending-operational-evidence  
Document type: certification  
Owner: Tours / QA  
Last verified: 2026-09-30
Scope: ficha pública, selección, hold, checkout, confirmación, recuperación y persistencia del perfil de salida
Source of truth: código de ficha, inventario y checkout; esta página registra evidencia
Related code/tests: `src/pages/tours/`, `src/pages/booking/`, `tests/integration/tour-booking-e2e.test.ts`, `tests/catalog/tour-pdp-provider-preview-parity.test.ts`
Review trigger: completar la matriz pendiente o cambiar el contrato de ficha, hold o checkout

## Cierre automatizado

El código congela salida, tarifa, fechas, participantes, moneda, precio, preguntas y políticas en el hold. Checkout exige identidad, el `priceQuoteId` del hold y respuestas obligatorias. La confirmación es idempotente por hold, rechaza otra cuenta y recupera una reserva existente después de una respuesta perdida. Tours sólo admite pago al proveedor durante la experiencia.

Las pruebas focalizadas y la integración PostgreSQL aprobaron el 19 de septiembre de 2026. Incluyeron snapshot de preguntas, confirmación, reintento, propiedad, viaje y voucher.

## Evidencia de paridad de ficha — 2026-09-26

La ficha de proveedor y la pública comparten `src/pages/tours/[id]/index.astro`,
`TourGallery` y `TourDepartureSection`. La vista previa exige propiedad del proveedor,
se identifica como privada, excluye canonical/JSON-LD público y no monta el motor de
reserva, el CTA móvil, hold ni checkout. Si la descripción es demasiado breve o
repetitiva, muestra una alerta editorial con enlace directo a corregirla.

Validación aprobada:

- `tests/catalog/tour-pdp-provider-preview-parity.test.ts` y superficies relacionadas:
  23 pruebas.
- `PLAYWRIGHT_BROWSER=brave PLAYWRIGHT_BASE_URL=http://localhost:4321 PLAYWRIGHT_PUBLIC_CERTIFICATION=1 pnpm exec playwright test tests/e2e/public-marketplace-certification.spec.ts --project=brave --workers=1`.
- `pnpm run lint:tours`, `pnpm exec astro check` y `pnpm run build`.
- Presupuesto HTML local: `/tours` (300.006 B, 818 ms TTFB) y la ruta de destino de
  tours (321.035 B, 628 ms TTFB) quedaron dentro de sus límites. `/buscar/tours`
  excede su presupuesto HTML por 5.090 B y permanece como seguimiento de rendimiento.

La muestra local auditada sigue en vista previa y su descripción requiere revisión
editorial; la URL pública redirige al catálogo porque el tour no está publicado. Esto
confirma el aislamiento, pero no sustituye la matriz comercial con una oferta publicada
de datos reales.

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

## Persistencia del perfil de salida — 2026-09-30

Tres escenarios aprobados contra PostgreSQL aislado mediante la ruta real:

```bash
pnpm exec vitest run tests/integration/tour-slot-profile-persistence.test.ts --reporter=dot
```

- Inserción y actualización del perfil conservan íntegramente las filas de `DailyInventory`, incluidas fechas, cupos y `reservedCount` positivo. La actualización conserva `TourSlotProfile.createdAt`.
- Una edición normal conserva íntegramente `VariantInventoryConfig`. El cambio explícito del cupo predeterminado conserva su horizonte y `createdAt`, sin modificar fechas existentes.
- `maxPax` actualiza el máximo de grupo en perfil y `VariantCapacity`; el cupo predeterminado se inicializa cuando falta o cambia con la acción explícita del formulario.

La autenticación y el refresco de caché están simulados; las lecturas y escrituras PostgreSQL son reales. Los fixtures se eliminan al terminar. Esta evidencia no certifica autenticación real ni sustituye la matriz comercial pendiente.
