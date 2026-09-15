# Cierre de Fase 3 — Caminos reservables por vertical

**Fecha:** 15-09-2026  
**Estado:** Fase 3 completada. F3-01, F3-02 y la regresión de cierre F3-03 fueron certificados contra Fastt Backup.

La fase termina el recorrido desde un borrador hasta una oferta consultable. El hotel conserva el contrato de habitación vendible: tipo de habitación, unidades físicas, tarifa, calendario de inventario y condiciones. El tour conserva el contrato de salida: participantes, cupo común, fecha futura, precio y condiciones.

## Decisiones de producto aplicadas

- El sidebar pasa a ser específico de la vertical cuando el proveedor sólo trabaja una vertical o cuando la selecciona desde el selector de alcance. Un proveedor mixto mantiene el menú general hasta elegir el alcance; no se infiere una vertical de forma ambigua.
- Hotel presenta **Mis alojamientos**, **Habitaciones**, **Reglas para huéspedes**, **Tarifas** y **Calendario**. Tour presenta **Mis tours**, **Salidas y cupos**, **Reservas** y **Operación de hoy**. Ambos conservan Finanzas, Configuración y Añadir servicio.
- Una salida compartida se reserva contra un cupo común: las categorías de participante no multiplican inventario. La salida privada es una solicitud de cotización; no muestra una acción que reserve inventario ni promete confirmación automática.
- Las salidas recurrentes no se ofrecen como automatización. Cada fecha se abre de forma explícita en calendario y conserva su control de cupo y precio.

## Evidencia del contrato comercial

| Vertical | Consulta comercial certificada | Resultado |
| --- | --- | --- |
| Hotel | `search-availability.test.ts` crea proveedor, habitación `hotel_room`, tarifa, inventario diario, precio efectivo y políticas; valida búsqueda, hold y confirmación. | Una estancia requiere precio e inventario durante toda la fecha solicitada. |
| Tour | `tour-booking-e2e.test.ts` crea dos salidas compartidas futuras, cada una con tarifa, cupo, precio efectivo y políticas; valida búsqueda, hold, confirmación, voucher y cupo independiente por salida. | Una salida futura requiere precio y cupo; una reserva descuenta sólo su propia salida. |
| Viajero tour | `TourDepartureSection` muestra fecha, participantes, cupo, precio, selección de tarifa y la secuencia reservar/confirmar. Para privado muestra únicamente cotización. | La interfaz representa el contrato configurado, sin rutas hoteleras. |

La batería de interfaz aprobada también verifica que el wizard de tour explica plantilla, cupo común, modalidad compartida/privada y el tratamiento manual de recurrencia. Las pruebas de semántica de Rooms & Rates protegen que las unidades físicas vivan en `VariantInventoryConfig` y la capacidad en `VariantCapacity`.

## Validación ejecutada

- `pnpm check` sin errores nuevos.
- `pnpm exec vitest run tests/unit/provider-operational-navigation.test.ts tests/catalog/tour-pdp-browser-surface.test.ts tests/guardrails/tour-commercial-wizard.test.ts` aprobó: 10 pruebas.
- El 15-09-2026, con `FASTT_DATA_ENV=test` contra Fastt Backup, `search-availability.test.ts -t "booking confirmed consumes availability"` aprobó: 1 prueba, 9 omitidas, 40,10 s. Registró búsqueda, hold, confirmación y búsqueda posterior sin inventario.
- El 15-09-2026, con `FASTT_DATA_ENV=test` contra Fastt Backup, `tour-booking-e2e.test.ts` aprobó: 1 prueba, 64,07 s. Registró búsqueda de dos salidas, hold, confirmación y cupo independiente tras la reserva.
- Para que la evidencia no dependa del reloj ni de datos residuales, los fixtures generan identidades únicas y fechas futuras. El runner de tours declara `TOURS_ROLLOUT_STAGE=general`, además de los interruptores de tours, porque el rollout gradual requiere ambas condiciones.
- **F3-02, comprobación visual en Brave:** se levantó una instancia local aislada en el puerto 4322 con `FASTT_DATA_ENV=test`, el rollout de tours en cohorte `general` y la oferta sembrada `prod_tour_99d87673-6383-452f-b373-5689ee04aefa`. En la ficha pública se seleccionó la salida del 17-09-2026 y su tarifa. El viajero vio dos salidas compartidas (09:00 y 15:30), `USD 80`, hasta 10 cupos, el grupo seleccionado y las condiciones: confirmación inmediata, cancelación gratuita hasta seis horas antes, pago en la propiedad, llegada/salida y no presentación configuradas.
- La comprobación expuso un marcador técnico de zona horaria en la fecha de cancelación. `TourDepartureSection` ahora lo presenta como fecha y hora locales legibles: `16/09/2026 a las 00:00 (hora local)`.

## Cierre pendiente

Los criterios de evidencia F3-01 y F3-02 están cerrados.

## Regresión de cierre F3-03

- El 15-09-2026, `tour-booking-e2e.test.ts` aprobó contra Fastt Backup en 64,94 s tras incorporar la comprobación posterior a la confirmación: se reservan 3 de 10 cupos de la salida de las 09:00 y una nueva búsqueda, con la misma ocupación tarifada, conserva esa salida y su tarifa con precio positivo.
- El `MISSING_PRICE` observado durante la primera inspección no era una pérdida de precio tras la confirmación: la interfaz había consultado 2 adultos y 0 niños, mientras el fixture de esa ejecución sólo había creado la tarifa para 2 adultos y 1 niño. La regresión usa la misma ocupación en búsqueda, hold, confirmación y verificación posterior, que es el contrato comercial correcto.

## Límites que permanecen explícitos

- No existe creación masiva ni regla de recurrencia para salidas. Hasta que tenga modelo, calendario, edición, cancelación y pruebas de inventario propios, se mantiene como trabajo manual por fecha.
- Privado no se convierte en reserva automática. La aceptación de una cotización continúa siendo el límite que habilita el inventario correspondiente.
- La navegación por vertical sólo organiza las superficies existentes; no agrega permisos. El alcance URL sigue siendo contexto de trabajo, no autorización.
