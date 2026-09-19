# Tours checkout — certificación operativa pendiente de Fase 3

**Estado:** código cerrado; certificación operativa end-to-end pendiente.  
**Última revisión:** 19 de septiembre de 2026.  
**Ámbito:** hold, checkout, autenticación, respuestas operativas, confirmación, recuperación y Tus viajes.

## Decisión de pago

Tours confirma exclusivamente reservas con **pago al proveedor durante la experiencia**. Fastt no cobra, no retiene fondos y no simula una pasarela de pago. Una tarifa que declare prepago queda bloqueada en checkout hasta contar con procesador y autorización comercial acreditados.

## Evidencia disponible

El detalle del cierre técnico está en [Cierre en código — Tours Fases 2 y 3](./tours-phase-2-3-code-closeout.md).

- La ficha crea el hold y deriva a `/checkout/tours`; ya no confirma directamente desde la selección.
- El checkout lee el `PriceQuote` y la política inmovilizados en el hold, exige sesión y conserva `returnTo` tras iniciar sesión.
- Las preguntas obligatorias se validan en servidor y sus respuestas se guardan dentro del snapshot de contacto de la reserva junto con la etiqueta/código de la pregunta vigente.
- La confirmación exige comprador autenticado, usa el mismo `holdId` de forma idempotente y rechaza que otra cuenta recupere ese hold.
- La página comprueba el estado de confirmación después de una pérdida de respuesta de red, antes de permitir un reintento.
- `pnpm run build` y la batería focalizada de 10 casos aprobaron el 19 de septiembre de 2026.
- `tests/integration/tour-check-in-and-guest-trip.test.ts` aprobó contra la base PostgreSQL de test el 19 de septiembre de 2026. Cubre pregunta obligatoria congelada en el hold, confirmación, reintento idempotente, recuperación por hold, rechazo de otra cuenta, persistencia de respuestas, viaje y voucher.

## Casos obligatorios de cierre

| ID       | Escenario                    | Resultado que debe observarse                                                                           |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| P3-OC-01 | Persona sin sesión           | Redirección a inicio/creación de cuenta y retorno al mismo hold mientras siga vigente.                  |
| P3-OC-02 | Sesión vencida               | No se confirma; se recupera identidad y selección o se informa vencimiento.                             |
| P3-OC-03 | Pregunta obligatoria ausente | El servidor rechaza la confirmación, no crea reserva y la interfaz enfoca el error.                     |
| P3-OC-04 | Precio o tarifa cambia       | El `priceQuoteId` no coincide, no se confirma y se exige nueva disponibilidad/cotización.               |
| P3-OC-05 | Último cupo y doble clic     | Se crea una sola reserva; ambos intentos devuelven el mismo identificador sólo para el mismo comprador. |
| P3-OC-06 | Hold vencido                 | No se muestra éxito ni se crea reserva; se ofrece comprobar disponibilidad.                             |
| P3-OC-07 | Respuesta de red perdida     | Se consulta el estado por hold; una reserva existente abre su viaje y una pendiente permite reintentar. |
| P3-OC-08 | Pago no compatible           | Una política de prepago no se confirma ni muestra un cobro ficticio.                                    |
| P3-OC-09 | Recuperación                 | La reserva confirmada aparece en `/trips` y sólo su comprador puede abrirla.                            |

## Criterio de cierre

El registro se marca **certificado** cuando P3-OC-01 a P3-OC-09 tienen evidencia `passed` contra un entorno comercial controlado, la prueba integrada de base de datos finaliza correctamente y la oferta usada cumple las condiciones pendientes de la certificación operativa de Fase 2.

No ampliar el rollout de checkout de Tours usando sólo pruebas de superficie o fixtures aislados.
