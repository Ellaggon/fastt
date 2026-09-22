# Certificación F — Tours

**Fecha:** 21 de septiembre de 2026. **Entorno:** localhost autenticado, Brave perfil Work.

## Evidencia completada

| Escenario | Resultado |
| --- | --- |
| Tour real, tarifa `d31281f5-9363-493f-9815-f805dca63675` | La página muestra cancelación/no-show, pago al proveedor, alcance global de preguntas y playbook activo. |
| Pago posterior | Texto visible: el proveedor cobra al realizar el tour; Fastt no procesa el pago. |
| Preguntas | Declara una respuesta por reserva, alcance a todas las salidas/tarifas y snapshot para reservas nuevas. |
| Contexto y navegación | La guía conserva producto, variante, tarifa y siguiente paso. El bloque de salida ofrece enlace directo a calendario con esos identificadores. |
| Hallazgo de UI durante prueba | Se detectó la frase residual “Usa Anterior”; se corrigió antes del cierre. |
| Build y diff | `pnpm run build` y `git diff --check` aprobados. |

## Regresiones previas que sostienen esta certificación

Las pruebas aisladas de B/C verifican compatibilidad de políticas, rechazo de llamadas directas, preview de pago sin cotización inventada y reutilización de `pay_at_property`. La auditoría de E bloquea la publicación si una tarifa efectiva conserva una política hotelera incompatible.

## Escenarios no certificables con los datos actuales

El entorno autenticado sólo expone un tour con dos salidas inactivas y una tarifa. No hay evidencia operativa disponible para certificar dos tarifas, salida compartida y privada, varias monedas/zonas horarias, último cupo, sesión vencida, doble clic de reserva, pérdida de red durante hold, rechazo de pago, lector de pantalla o móvil real. Tampoco se ejecutaron mutaciones de reserva para no alterar datos del proveedor.

Estos escenarios quedan como certificación de despliegue, no como fallos de código: requieren fixtures aislados o datos comerciales reales aprobados. La Fase F no puede declararse completamente certificada hasta disponer de ellos.
