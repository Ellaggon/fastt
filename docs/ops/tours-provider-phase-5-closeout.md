# Cierre en código — Tours Fase 5

**Estado:** cerrado en código el 20 de septiembre de 2026.  
**Alcance:** creación, reanudación, edición y preparación para publicación de tours.  
**Objetivo:** permitir que el proveedor publique una experiencia fiel y mantenga precio, salidas y disponibilidad sin recorrer formularios ajenos a su tarea.

## Resultado de producto

El recorrido detallado conserva sus pasos necesarios, pero los presenta en seis etapas comprensibles:

1. **Identidad:** creación y contenido principal.
2. **Destino:** zona pública de descubrimiento.
3. **Experiencia:** fotos, características, logística e itinerario.
4. **Participantes y búsqueda:** tipos de participante y categorías públicas como conceptos separados.
5. **Salidas y venta:** salida, precio, condiciones, preguntas y disponibilidad.
6. **Revisión y publicación:** vista pública real y requisitos pendientes.

La etapa permanece visible al pasar de una salida a tarifa, condiciones y calendario. Los enlaces comerciales conservan `productId`, `variantId` y `ratePlanId`, de modo que el proveedor no pierde el contexto de la salida que estaba editando.

## Decisiones cerradas

| Riesgo | Comportamiento implementado | Evidencia |
| --- | --- | --- |
| El catálogo obliga a recordar dónde quedó el trabajo | Cada tour muestra estado, porcentaje, requisito exacto y acción siguiente. Los publicados abren disponibilidad como tarea primaria. | `src/pages/catalog/tours.astro`; prueba de Fase 5 |
| Categorías de búsqueda se confunden con participantes | Son páginas, persistencia y requisitos independientes. Participantes define edades/cupos; categorías define descubrimiento público. | `tickets.astro`; `categories.astro`; guardrails |
| La guía desaparece en tarifas | Las superficies de precio, condiciones y calendario reciben la misma etapa 5 de 6 y conservan el contexto comercial. | Validación en Brave; pruebas de navegación |
| Se reutiliza lenguaje de alojamiento | La interfaz usa salida, participante, cupo, modalidad, idioma, presentación y pago al proveedor. | Build; prueba `tour-commercial-wizard` |
| Ubicación pública promete un punto de encuentro exacto | La zona pública y el punto operativo se explican por separado y enlazan al campo correspondiente sin duplicar datos. | `location.astro`; `subtype.astro` |
| No se sabe a quién ni cuándo se pregunta | Las preguntas indican alcance de todo el tour, una vez por reserva, comprador/viajero principal, obligatoriedad y efecto sólo en reservas nuevas. | `rates/plans/[ratePlanId].astro` |
| Editar precio o disponibilidad pierde la salida | Los accesos directos llevan producto, salida y tarifa hasta precio, condiciones y calendario. | `tourProviderNavigation.ts`; pruebas de Fase 5 |
| La vista previa difiere de la ficha pública | La vista previa carga la página pública real para el proveedor propietario. Desactiva cotización, hold y checkout mientras el tour no está publicado. | `product/[id]/preview.astro`; `tours/[id]/index.astro` |
| Los criterios de calidad son de alojamiento o genéricos | Se mantienen criterios universales y se agregan recomendaciones según actividad: esfuerzo/seguridad, agua/equipo, alimentación o edades. | `tourActivityQuality.ts` |
| Se exige más de una salida sin necesidad comercial | Una salida activa completa satisface el requisito; la disponibilidad y tarifa siguen siendo obligatorias para vender. | evaluación de preparación; prueba de Fase 5 |

## Validación ejecutada

```bash
pnpm exec vitest run tests/playbook/tour-provider-phase5.test.ts tests/playbook/launch-tour.test.ts tests/guardrails/tour-commercial-wizard.test.ts tests/playbook/complete-to-publish-resume.test.ts tests/unit/preparation-session.test.ts tests/playbook/tour-rate-playbook-context.test.ts tests/playbook/playbook-primary-cta.test.ts
pnpm exec vitest run tests/integration/tour-wizard-create.test.ts
pnpm run build
```

Resultados:

- Contratos y guardrails de publicación: **34/34 casos aprobados**.
- Revalidación focalizada después del cierre de contexto comercial: **25/25 casos aprobados**.
- Creación aislada por JSON y formulario nativo, incluida la continuidad de `launch-tour`: **1/1 caso aprobado** contra la base de pruebas.
- Build de producción: **aprobado**.
- Inspección en Brave de una tarifa real: guía visible como **Etapa 5 de 6**, lenguaje de tours y enlace de disponibilidad con producto, salida y tarifa.

## Criterio de salida

H16 y H17 quedan resueltos en código. El proveedor puede identificar el requisito pendiente, abrir el campo exacto, retomar un borrador, editar directamente una oferta publicada y mantener el contexto al cambiar precio o disponibilidad. La vista previa utiliza la misma superficie pública y no habilita funciones comerciales inexistentes.

## Certificación operativa pendiente

Para declarar la fase certificada de punta a punta falta una sesión manual autenticada que recorra en navegador los cinco escenarios del reporte: crear un tour simple, retomar el borrador, editar uno publicado, cambiar el precio de una salida y revisar disponibilidad. La sesión local expiró después de validar la etapa comercial; no se ingresaron credenciales ni se alteró una oferta real para completar esa evidencia.

Este pendiente es de certificación visual y operativa. No representa una brecha funcional conocida y sólo debe producir cambios de código si el recorrido manual revela una divergencia nueva.
