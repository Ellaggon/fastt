# Cierre en código — Tours Fases 2 y 3

**Estado:** cerrado en código el 19 de septiembre de 2026.  
**Alcance:** ficha y selección comercial, hold, checkout, identidad, confirmación y recuperación.  
**Límite:** este cierre no sustituye la certificación visual/comercial con una oferta controlada descrita en los registros operativos de Fase 2 y Fase 3.

## Decisiones cerradas

| Riesgo                                                     | Comportamiento implementado                                                                                                                         | Evidencia ejecutable                                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Una tarifa o grupo nuevo reutiliza una cotización anterior | La identidad idempotente del hold incluye salida, tarifa, fechas, cupo y composición del grupo.                                                     | `tour-phase2-phase3-contract.test.ts`                                                              |
| Moneda implícita o incorrecta                              | Búsqueda, ficha, hold, `PriceQuote`, checkout y reserva usan la moneda de `SearchUnitView`; una mezcla de monedas bloquea la oferta.                | `resolve-search-offers-v2-shadow-read.test.ts`; build                                              |
| Cambio rápido de tarifa muestra condiciones antiguas       | La respuesta de selección se aplica sólo si todavía coincide con la salida y tarifa activas.                                                        | Build y guardrail de superficie                                                                    |
| Volver pierde fecha, grupo o tarifa                        | La ficha serializa salida/tarifa en URL y el checkout reconstruye un enlace con fecha y participantes exactos.                                      | `tour-phase2-phase3-contract.test.ts`                                                              |
| Fecha agotada deja un vacío sin salida                     | La ficha ofrece hasta tres próximas fechas materializadas con precio y cupo para el mismo grupo.                                                    | Build                                                                                              |
| Galería inaccesible                                        | La galería usa diálogo modal nativo, devuelve el foco, soporta Escape y flechas, anuncia la foto y omite controles redundantes con una sola imagen. | Build; certificación visual P2-OC-05/06 pendiente                                                  |
| Preguntas cambian durante checkout                         | Las definiciones se congelan al crear el hold; checkout y confirmación leen el mismo snapshot.                                                      | `tour-check-in-and-guest-trip.test.ts`                                                             |
| Se confirma sin identificar la cotización                  | Tours exige el `priceQuoteId` exacto del hold y un nombre de titular válido.                                                                        | `tour-check-in-and-guest-trip.test.ts`                                                             |
| Sesión vence al confirmar                                  | Un `401` retorna a login con el mismo hold y cotización; no muestra éxito.                                                                          | Build y guardrail de superficie                                                                    |
| Se pierde la respuesta de red                              | Checkout consulta estado por hold; redirige sólo con reserva confirmada y diferencia pendiente, vencido, ausente y fallo de red.                    | `tour-check-in-and-guest-trip.test.ts` para recuperación confirmada; build para estados de cliente |
| Reintentos duplican reserva                                | La confirmación se serializa por hold, limpia su cola y el mismo comprador recibe el mismo `bookingId`; otra cuenta es rechazada.                   | `tour-check-in-and-guest-trip.test.ts`                                                             |
| Se simula un cobro                                         | Sólo se confirma pago al proveedor durante la experiencia; prepago continúa bloqueado.                                                              | `tour-payment-terms.test.ts`                                                                       |

## Validación reproducible

```bash
pnpm run build
pnpm exec vitest run tests/unit/tour-phase2-phase3-contract.test.ts tests/search/resolve-search-offers-v2-shadow-read.test.ts tests/catalog/tour-pdp-browser-surface.test.ts tests/ui/tour-payment-terms.test.ts --reporter=verbose
TOURS_ROLLOUT_STAGE=general TOURS_ROLLOUT_MIN_DWELL_MS=0 pnpm exec vitest run tests/integration/tour-check-in-and-guest-trip.test.ts --reporter=verbose
```

Resultados del cierre:

- Build de producción: `passed`.
- Pruebas focalizadas: 4 archivos, 10 casos, `passed`.
- Integración PostgreSQL de reserva, snapshot de preguntas, idempotencia, recuperación, propiedad, viaje y voucher: 1 caso, `passed`.

## Frontera de certificación

El código de ambas fases queda cerrado. La declaración **certificado operativamente** se mantiene separada hasta ejecutar P2-OC-01–07 y P3-OC-01–09 con una oferta comercial controlada, dispositivos/lector de pantalla y evidencia archivada. Esa actividad no requiere cambios de producto salvo que revele una divergencia nueva.
