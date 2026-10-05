# Contrato de interfaz de los dos playbooks de tours

Status: active  
Document type: canonical  
Owner: Tours / Provider Experience / Engineering  
Last verified: 2026-10-05  
Scope: cambios requeridos en presentación, formularios, tareas y publicación  
Source of truth: `tour-preparation-publication.md`; código actual citado en cada sección  
Related code/tests: `src/layouts/PlaybookLayout.astro`, `src/lib/playbook/`, `src/lib/onboarding/preparationSession.ts`, `tests/playbook/`, `tests/render/`, `tests/integration/preparation-session-persistence.test.ts`  
Review trigger: cambios de formularios, diagnóstico, componentes o estilo de estos playbooks

Lector: agente implementador y revisor técnico. Acción: construir y verificar el contrato
sin reinterpretar las decisiones de experiencia. Complementa el
[reporte de experiencia y diagramas](./tour-preparation-publication.md), que define el porqué
y los flujos completos. Este documento conserva las responsabilidades técnicas y los criterios
de regresión después de la implementación; no constituye evidencia de trabajo terminado.

La [especificación de navegación y verificación](./tour-playbook-navigation-contract.md)
completa este contrato con identidad, sesiones, compatibilidad y pruebas de cierre.

## 1. Resultado exigido y límites

Un flujo comercial con dos playbooks reales: A prepara, B completa pendientes y publica.
Comparten entidades, formularios y evaluadores. Difieren en entrada, navegación, retorno y
acción principal. No basta cambiar nombres ni esconder una de dos listas montadas en el DOM.

Mantener los cinco grupos de preparación y sus etiquetas actuales, incluida «Primera opción,
precio y condiciones». Los nombres abreviados del reporte conceptual describen esos grupos;
no autorizan renombrar la interfaz durante este cambio. Los diez requisitos siguen siendo
validaciones de datos; no se convierten en diez pantallas obligatorias ni en otro contador.

Preservar reglas de precios, políticas, autorización, inventario y propiedad del proveedor.
No modificar el diseño de campos ni la semántica del editor de salida. No agregar dependencias,
una tabla de progreso, otro motor de publicación o copias de los formularios para cada playbook.
Alojamiento y Añadir opción conservan sus contratos. Los cambios ajenos existentes en el árbol
no deben revertirse ni incorporarse por conveniencia a este rediseño.

## 2. Referencia visual obligatoria

La referencia verificable es `src/components/tours/TourPreparationProgress.astro`, incluyendo
su CSS local `tour-stage-rail__*`, y los controles compartidos actualmente utilizados por los
formularios. Antes de modificarlo, capturar en Brave o LibreWolf el componente abierto/cerrado,
escritorio y móvil, con una etapa activa y estados completos/pendientes. No usar Chrome.

Conservar tarjetas compactas, radio 0.5 rem, borde sutil, fondo oscuro, índice junto al título,
jerarquía tipográfica, estados discretos, selección azul con el token `--fastt-color-selection`,
hover y foco actuales. La cuadrícula de cinco columnas en escritorio y su adaptación móvil
permanecen; no reemplazarla por botones grandes, pills, otro stepper o una barra de porcentaje.
No sustituir clases por componentes que alteren silenciosamente dimensiones o apariencia.

El `summary` de etapas muestra «Etapa X de Y - [nombre]», cerrado por defecto con `details/summary`. Al abrirlo, mantiene
las cinco tarjetas y sus estados. «Pendiente · Etapa actual» puede permanecer dentro de la
única tarjeta activa; no debe repetirse como otro aviso encima del formulario. La pantalla
normal sólo muestra una ubicación («Etapa 4 de 5»), el título del formulario y contexto breve.
No repetir el nombre completo de la etapa en tres cabeceras.

B reutiliza el lenguaje visual de tarjetas y controles actuales. Sus tareas no llevan números
de etapa ni círculos que sugieran otra secuencia. Crear componentes de dominio sólo para
composición y conducta; usar `src/components/ui/` para nuevos controles repetibles conforme a
`docs/design-system-governance.md`. No copiar todo el CSS de A para construir B. Extraer un
estilo compartido únicamente si ambos lo necesitan y la comparación visual demuestra paridad.
No cambiar `src/styles/global.css` para corregir un caso que corresponde al componente local.

## 3. Layout y responsabilidad de componentes

`src/layouts/PlaybookLayout.astro` distingue ambos IDs mediante el contexto resuelto A/B
antes de construir sus acciones. `PreparationProgress` pertenece exclusivamente a A;
`TourReviewStatus` proyecta tareas y cumplidos para B. No montar los dos índices juntos.

**A:** renderizar contexto breve, indicador de etapa, acceso plegado a etapas y slot del
formulario. Eliminar de esta rama `TourPreparationChecks`, porcentajes, resumen de diez
comprobaciones y paneles de publicación. No cargarlos y ocultarlos mediante CSS. El aviso de
verificación se explica una sola vez al iniciar, no cada vez que se abre una pantalla de etapa 1.

**B/resumen:** título Publicar tour, contexto comercial, tareas pendientes y una acción
principal contextual. Requisitos cumplidos bajo un único disclosure cerrado. Si está listo,
mostrar revisión final. No montar `TourPreparationProgress` ni navegación anterior/siguiente de A.

**B/corrección:** título breve del formulario, causa del pendiente, valores existentes y
Guardar y volver. No repetir toda la lista de pendientes encima del editor. Permitir Volver a
publicación; si hay cambios sin guardar, aplicar la protección de borrador existente.

`TourPreparationProgress.astro` conserva presentación y CSS. Separar las props de progreso
numérico sólo si quedan consumidores reales; no mantener branches muertos por precaución.
`tour-publishing-stages.ts` proyecta estados de A a partir de los requisitos compartidos: no
marca una etapa completa por visita. Una lectura desconocida nunca significa pendiente vacío.

`TourPreparationChecks.astro` y los controladores del segundo índice se retiraron al quedar
sin consumidores. `TourReviewStatus.astro` usa una lista compacta de tareas dentro de la
tarjeta existente, sin otra tarjeta por requisito. Aporta acciones y estados relevantes a B,
sin imprimir cuatro paneles repetidos en cada corrección. No crear otro componente que
replique los mismos evaluadores.

## 4. Publicación basada en tareas, no en formularios repetidos

Conservar `src/lib/tours/tourDiagnosticContract.ts`, `tourPreparationRequirements.ts` y
`tourDiagnosticPresentation.ts` como fuentes de requisitos y capacidades. Añadir una proyección
pura de tareas si la presentación actual no la ofrece. Nunca derivar cumplimiento del DOM,
localStorage, formularios visitados o un contador de sesión.

Cada tarea necesita clave estable, requisitos que resuelve, causa breve, ámbito afectado,
responsable, estado y destino seguro. Agrupar por intención y entidades, no sólo por pathname:
precio y condiciones comparten ruta, pero son vistas diferentes. Perfil y capacidad pueden
compartir una edición de salida y una tarea. Evitar duplicar esa tarea por cada requisito.

Correspondencia operativa:

- Presentación → content; actividades → categories.
- Logística → location o subtype según causa real; puede requerir más de una corrección.
- Fotos → images, conservando cargas confirmadas y orden.
- Participantes → tickets.
- Perfil y capacidad → departures/[slotId], precargado y deduplicado.
- Precio → rates/plans/[ratePlanId] con `vista=price`.
- Condiciones → la misma tarifa con `vista=conditions`; conservar retornos de editores auxiliares.
- Calendario → rates/calendar, oferta seleccionada y `focus=availability`.

Reutilizar los builders existentes para resolver rutas completas; estos nombres no autorizan
inventar IDs. Si no existe opción o tarifa, la tarea conduce a su creación mediante la
superficie actual y luego vuelve a B. B no exige tener una oferta completa para poder explicar
cómo crearla; la selección es necesaria cuando hay ambigüedad, no cuando no existe nada.

Un requisito listo queda cumplido automáticamente. Uno parcialmente satisfecho abre los datos
actuales y enfoca el primer campo pertinente. No borrar valores válidos ni esconder campos
relacionados necesarios. Tras guardar, reevaluar todos los requisitos afectados y retirar la
tarea sólo si realmente se resolvió. Un requisito puede invalidarse por una edición posterior;
mostrar la nueva causa conservando datos.

«N tareas pendientes» cuenta acciones agrupadas; «Requisitos cumplidos (N)» cuenta validaciones.
No presentar ambos como una fracción común. Estados de Fastt en revisión se muestran aparte,
sin botones ficticios para el proveedor. Una lectura fallida ofrece Reintentar y no reconstruye
una lista de formularios vacíos. El estado de activación se trata en revisión final, sin generar
una tarea circular que impida llegar a la acción Activar.

## 5. Formularios y acciones por origen

Auditar `src/pages/product/[id]/`: content, categories, location, subtype, images, tickets,
departures/[slotId]/index y preview. Además `src/pages/rates/plans/manage.astro`,
`src/pages/rates/plans/[ratePlanId].astro` y `src/pages/rates/calendar.astro`.

Cada pantalla recibe el mismo contexto resuelto; no vuelve a inferir el playbook con otra
regla. En A, Guardar y continuar lleva al siguiente formulario de la etapa o a la siguiente
etapa. En B, Guardar y volver siempre conduce al resumen actualizado. Fuera de playbooks,
conservar el comportamiento operativo habitual. Atrás del navegador debe respetar historial
sin disparar guardados ni activaciones.

En `TourSlotProfileEditor.astro`, conservar secciones, campos, controles, ayudas de capacidad
y recuperación de borrador. Cambiar únicamente integración de contexto y acción posterior.
Guardar perfil no cambia inventario ni reservas existentes; aplicar cupo predeterminado a
nuevas fechas sigue siendo elección explícita. Mantener recuperación idempotente de creación.

En `RatePlanPricingSurface.astro`, conservar selección de vista, editor y validación. El botón
guiado debe enviar el formulario correcto y esperar confirmación; precio no puede saltar a
condiciones antes de persistir. En B no encadenar condiciones/calendario tras guardar precio.
En `SingleCalendarWorkspace.tsx`, distinguir intención A/B del flujo hotelero: el cierre de A
abre B, una corrección de B regresa a B, ninguno activa oferta implícitamente.

Revisar `src/lib/forms/playbookFormDraft.ts` y `productImagesHandler.ts`: borradores aislados
por entidad, respuesta confirmada antes de limpiar, sin recrear un borrador limpiado al salir.
Un borrador local nunca acredita preparación ni aparece como guardado entre dispositivos.
`src/lib/forms/productImageUpload.ts` conserva la identidad de cada carga en memoria al
reintentar una respuesta perdida; la asociación de galería conserva IDs confirmados y orden.
B permite guardar fotos parciales y vuelve al resumen, donde el mínimo sigue pendiente.
No borrar formularios si falla navegación después de que el servidor ya guardó.

Todos los envíos: bloquear doble clic mientras están pendientes; informar error junto a la
acción; conservar valores; permitir reintento. Una respuesta perdida requiere reconciliar
estado antes de repetir creación. No añadir un segundo mecanismo de idempotencia si el
endpoint ya lo proporciona. El botón de salida no debe prometer guardado cuando sólo navega.

## 6. Entradas, revisión y publicación efectiva

Actualizar acciones de `src/pages/catalog/tours.astro`, ficha del producto y
`src/lib/onboarding/providerOnboardingEntry.ts`, buscando consumidores de los builders:
Crear/Continuar preparación → A; Publicar/Continuar publicación → B. Una entrada directa a B
no exige recorrer A. Desde B, Editar preparación abre A con retorno explícito; las correcciones
puntuales permanecen en B. Reanudar no presenta dos tarjetas competidoras para el mismo tour.

Reutilizar `src/pages/product/[id]/preview.astro` como resumen/revisión de B; no crear otro
preview ni duplicar la ficha del viajero. Corregir redirecciones automáticas que expulsan al
primer requisito o ejecutan el orden de A. Inicialmente mostrar tareas; cuando no haya
pendientes previos, revisión. Los cumplidos siguen consultables bajo demanda.

Activar y publicar son comandos distintos. Reutilizar `/api/rateplans/activate-guided`,
`/api/product/evaluate` y `/api/product/publish`; comprobar sus consumidores y validaciones.
La evaluación cliente orienta; cada comando autoriza y valida en servidor. Si falta activación,
la acción principal es Activar oferta; confirmada ésta, Publicar tour. No publicar al abrir B,
al guardar calendario ni al alcanzar diez requisitos cumplidos.

Si activar funciona y publicar falla, conservar activación y mostrar sólo el fallo vigente.
Si aparece un nuevo bloqueo, reconstruir las tareas; si no se conoce el resultado, releer antes
de repetir. Un tour ya publicado muestra su estado y acceso operativo, sin pedir otra
publicación ni crear una oferta. Agotamiento actual no convierte la preparación en incompleta.

