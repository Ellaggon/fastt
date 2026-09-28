# Evidencia histórica de preparación y reserva — septiembre de 2026

Status: archived
Document type: certification
Owner: Provider Experience / QA
Last verified: 2026-09-28
Scope: resultados registrados el 14–15 de septiembre; investigación de regresiones
Source of truth: cierres F0–F3 conservados en Git y suites enlazadas
Related code/tests: tests/integration/onboarding-phase0-contract.test.ts, tests/integration/provider-onboarding-authenticated.e2e.test.ts, tests/integration/tour-booking-e2e.test.ts
Review trigger: investigar una regresión de preparación, continuidad o consumo de inventario
Supersedes: docs/onboarding/phase-0-closeout.md, docs/onboarding/phase-1-closeout.md, docs/onboarding/phase-2-closeout.md, docs/onboarding/phase-3-closeout.md

## Qué demuestra este registro

Consolidación documental del 28 de septiembre, sin volver a ejecutar las pruebas.
Los resultados siguientes fueron declarados en los informes originales; no certifican el
código actual, producción, ratificación comercial ni todos los recorridos de accesibilidad.
Los requisitos vigentes se encuentran en el [índice de onboarding](../../onboarding/README.md).

| Fecha / ámbito | Evidencia registrada | Límite |
| --- | --- | --- |
| 14 septiembre, diagnóstico inicial | 35 pruebas aprobadas: 26 sin SQL y 9 de integración PostgreSQL; escenarios P00–P07 en Fastt Backup. | Helpers con almacenamiento sustituido no prueban joins ni endpoints; la suite SQL cubre sólo sus fixtures. |
| 14 septiembre, entrada y autenticación | 28 pruebas unitarias/de superficie; integración con PostgreSQL real de identidad, contacto operativo, creación hotelera y bloqueo previo a publicación. | La autenticación de integración era simulada; no equivale a un recorrido real de sesión en navegador. |
| 14 septiembre, reanudación | Integración de borradores hotel/tour, variante, tarifa y recuperación de una sesión por playbook sin duplicar productos. | Los datos no guardados permanecían locales; markup accesible no certifica lector de pantalla. |
| 15 septiembre, oferta reservable | 10 pruebas unitarias/de superficie; búsqueda hotelera con hold y confirmación: 1 aprobada y 9 omitidas, 40,10 s. Tour: 1 aprobada, 64,07 s. | Entorno aislado, no rendimiento ni transacciones de producción. |
| 15 septiembre, consumo de cupo | Regresión tour aprobada en 64,94 s: reserva de 3 sobre 10 cupos, búsqueda posterior con la misma composición de participantes y precio positivo. | Cambiar participantes puede necesitar otra tarifa; no demuestra precio disponible para cualquier grupo. |

## Rutas para reproducir o investigar

Usar el [entorno aislado](../../engineering/marketplace-data-isolation.md), fixtures propias
y fechas futuras. Consultar cada suite antes de ejecutarla: el modelo de verificación y sus
prerrequisitos evolucionaron después de estos resultados.

- [Diagnóstico PostgreSQL](../../../tests/integration/onboarding-phase0-contract.test.ts).
- [Alta y reanudación con autenticación simulada](../../../tests/integration/provider-onboarding-authenticated.e2e.test.ts).
- [Contrato de sesión](../../../tests/unit/preparation-session.test.ts) y [superficie guiada](../../../tests/ui/provider-onboarding-phase2.test.ts).
- [Búsqueda y reserva hotelera](../../../tests/integration/search-availability.test.ts).
- [Reserva y cupo por salida](../../../tests/integration/tour-booking-e2e.test.ts).

## Inspección visual y límites conservados

El 15 de septiembre se registró una inspección en Brave sobre una instancia local aislada:
dos salidas compartidas, USD 80, cupo de 10 y selección de tarifa/participantes. Detectó un
marcador técnico de zona horaria en cancelación; el informe registró su corrección visual.
No constituye certificación actual de corte temporal, políticas ni lector de pantalla.

La consulta inicial del embudo no tenía eventos suficientes en los últimos 30 días para
medir conversión. No derivar tasas de éxito de los fixtures. La navegación por vertical y
el contexto de URL organizan trabajo, pero no conceden autorización. Cualquier revisión
actual debe contrastar la interfaz con los bloqueos del servidor y la política firmada.
