# Contrato técnico de Preparar tour y Publicar tour

Status: active  
Document type: canonical  
Owner: Tours / Provider Experience / Engineering  
Last verified: 2026-10-05  
Scope: identidad, sesiones, compatibilidad, eficiencia y verificación de los dos playbooks  
Source of truth: `tour-preparation-publication.md`; código actual citado en cada sección  
Related code/tests: `src/layouts/PlaybookLayout.astro`, `src/lib/playbook/`, `src/lib/onboarding/preparationSession.ts`, `tests/playbook/`, `tests/render/`, `tests/integration/preparation-session-persistence.test.ts`  
Review trigger: cambios de identidad, formularios, sesiones, diagnóstico o estilo de estos playbooks

Lector: agente implementador y revisor técnico. Acción: construir y verificar el contrato
sin reinterpretar las decisiones de experiencia. Complementa el
[reporte de experiencia y diagramas](./tour-preparation-publication.md), que define el porqué
y los flujos completos. Este documento conserva las responsabilidades técnicas y los criterios
de regresión después de la implementación; no constituye evidencia de trabajo terminado.

Aplicar conjuntamente el [contrato de interfaz](./tour-playbook-ui-contract.md), que fija
componentes, formularios y conservación visual. La división responde a dos responsabilidades
durables: interfaz y navegación/persistencia; no a fases ni reportes de sesión.

## 1. Identidades, enlaces y compatibilidad

Decisión técnica: reutilizar `launch-tour` para A y `complete-to-publish` para B **en tours**.
Los valores ya existen en `PlaybookId`, el endpoint de sesión y el CHECK PostgreSQL. La
separación visible no requiere nuevos IDs físicos ni migración de esquema por este motivo.
El comportamiento de `complete-to-publish` en hoteles no se transforma en B de tours.
Verificar que el entorno recibió `db/migrations/2026-09-20_complete_to_publish_preparation_session.sql`: una base antigua puede conservar el CHECK de sólo `launch` y `launch-tour`. Aplicar la migración existente según el runbook PostgreSQL; no crear otra ni retirar la restricción.

Los enlaces nuevos de tours incorporan `tourFlowVersion=2`, marcador de semántica de
navegación, distinto de `writeVersion: 2` del protocolo existente de sesiones. A usa
`playbook=launch-tour`; B usa `playbook=complete-to-publish`. `step` identifica el formulario
real, no un ordinal visible. `flow=create|complete` se conserva donde haya consumidores, pero
no tiene precedencia sobre una identidad explícita válida. No usar `flow=complete` para
capturar accidentalmente una URL nueva de A.

Centralizar resolución y construcción en `src/lib/playbook/`; si hace falta un módulo puro
nuevo, usar `tour-playbook-context.ts`. Debe resolver identidad, versión, paso, entidades,
retorno validado y destino tras guardar. No repartir detecciones por texto o pathname entre
componentes. Actualizar `types.ts`, `resolve-playbook.ts`, `launch-tour.ts`,
`complete-to-publish.ts` y `playbook-nav.ts` según sus responsabilidades existentes.

Compatibilidad de enlaces de tours sin marcador:

- `launch-tour` se interpreta como A; preview antiguo transfiere a B.
- `complete-to-publish` o alias `complete`, en formularios de preparación y sin evidencia de
  retorno de publicación, se interpreta como A. Normalizar aliases mediante funciones existentes.
- Preview, una acción explícita Publicar o una corrección con retorno válido a preview se
  interpreta como B. Una sesión compatible puede aportar intención; no puede sustituir una
  selección explícita incompatible de opción/tarifa.
- Si no se puede determinar el paso, abrir un destino seguro del mismo tour. Si falta contexto
  comercial, mostrar selección o creación pertinente; no elegir arbitrariamente otra oferta.
- Tras resolver, emitir únicamente URL canónica con versión. Aceptar entradas antiguas mediante
  un adaptador; no perpetuar dos implementaciones de navegación. Evitar bucles de redirección.

Validar proveedor → producto → opción → tarifa. Mantener los resolutores
`loadTourCommercialContext.ts` y `resolveTourCommercialContext.ts` en `src/lib/tours/`.
Un `returnTo` sólo puede apuntar a rutas internas permitidas del mismo contexto, con longitud
y anidación acotadas; no envolver retornos recursivamente. Un enlace manipulado no concede
acceso ni permite cambiar de producto después del guardado.

## 2. Sesiones y reanudación sin duplicación

Actualizar `src/lib/onboarding/preparationSession.ts`, `preparationSessionContext.ts`,
`src/pages/api/onboarding/preparation-session.ts` y el escritor de `PlaybookLayout.astro`.
La tabla `ProviderPreparationSession` ya diferencia producto y playbook; aprovecharla.
Guardar URL canónica, paso, opción, tarifa y retorno validado en `lastPath`. No persistir copias
del formulario ni flags de requisitos cumplidos. Conservar autenticación, ownership, writer
fence v2 y protección temporal existentes.

Al transferir A → B, persistir la intención de B antes de anunciar que podrá reanudarse allí.
Si falla la sesión después de guardar datos comerciales, no informar pérdida del formulario:
mostrar que el guardado fue correcto y que no se pudo registrar la reanudación. Reintentar sin
crear otra opción. Evitar depender de un `pagehide` no confirmado para cerrar la transición.

El bloqueo actual por producto/playbook sólo ordena escrituras dentro de un ID. Extender la
coordinación del flujo de tours al producto/usuario/proveedor para que un envío tardío de A
no gane a una entrada posterior a B. Comparar tiempos entre ambas identidades bajo la misma
transacción/bloqueo y rechazar sobrescritura obsoleta. Una vuelta explícita B → A más reciente
sí debe aceptarse. No marcar A como cumplido sólo por cambiar de playbook: puede haber omisiones.

El lector agrupa las sesiones de tours por producto y elige la intención válida más reciente,
conservando contexto; no produce dos Continuar para el mismo tour. Completar publicación
cierra las sesiones del flujo mediante resultado confirmado; visitar preview no las completa.

El cierre y las escrituras de tours comparten además un bloqueo por producto/proveedor.
El lector excluye tours publicados incluso si la limpieza de sesiones aún no terminó.

Normalizar sesiones antiguas al leer usando las reglas de compatibilidad anteriores y escribir forma nueva
al reanudar. No hacer un reemplazo masivo de todos los `complete-to-publish` por B: perdería
el lugar de preparación. Probar colisión con sesiones nuevas, misma entidad en dos pestañas,
retorno desde verificación, cambio de dispositivo y opción/tarifa eliminada. No modificar
la restricción SQL ni crear migraciones mientras los IDs y columnas existentes cubran el contrato.

## 3. Eficiencia y eliminación de código residual

Cargar una vez el contexto y diagnóstico por render y pasarlos a las proyecciones consumidoras.
No volver a consultar la misma oferta para header, etapas, tareas y preview independientemente.
Reevaluar tras mutación o retorno pertinente; no introducir polling permanente de requisitos.
Las secciones nativas plegables no necesitan una isla React ni otro controlador cliente.

Eliminar imports, props, listeners y selectores de la presentación retirada cuando no tengan
referencias. Comprobar antes de borrar los archivos de disclosure/rail ya retirados en el árbol
actual. No restaurarlos para sostener el diseño anterior ni conservar dos implementaciones
ocultas por flags. Mantener sólo el adaptador de compatibilidad de entradas antiguas.

Buscar consumidores de IDs, `flow=complete`, `returnTo`, `TourPreparationChecks`,
`tour-stage-rail`, activación y sesión antes y después del cambio. Cada modificación debe
explicar qué responsabilidad resuelve. No reformatear archivos ajenos ni añadir abstracciones
para un único caso. La separación del flujo no altera esquema comercial, precios ni reservas.

## 4. Orden de ejecución y pruebas de salida

1. Registrar referencia visual y comportamiento actual; revisar diff existente y fixtures.
2. Implementar contexto, builders y compatibilidad con pruebas puras de A/B y aliases.
3. Resolver sesiones, transición y selección comercial antes de conectar nuevas entradas.
4. Separar ramas del layout y tareas de B; comprobar que nunca coexistan ambos índices.
5. Integrar cada formulario, tarifas, imágenes y calendario con guardado/retorno correcto.
6. Conectar catálogo, reanudación y preview; verificar activar/publicar y recuperación.
7. Retirar código sin consumidores; comparar apariencia y recorrer casos completos.

Cada paso debe superar su comprobación antes de avanzar. Una prueba fallida exige corregir
la causa; no debilitar una aserción para aceptar el comportamiento que se quería eliminar.
Actualizar pruebas que exigían la antigua doble navegación, conservando sus controles de datos.

Casos mínimos de aceptación:

- Nuevo tour: nueve etapas, un formulario por pantalla, sin requisitos visibles en A.
- B con cinco requisitos listos: reconoce sus datos; sólo pide faltantes y nunca nueve etapas.
- Perfil y capacidad pendientes: una tarea, formulario precargado, un guardado, retorno a B.
- Precio listo/fotos insuficientes: corregir fotos no recorre precio ni condiciones.
- Todo listo: revisión directa; activación explícita si procede y publicación confirmada.
- Sin opción/tarifa: creación pertinente; con varias: selección; con IDs incompatibles: rechazo.
- Verificación pendiente de Fastt: estado de espera y otras tareas disponibles, sin reiniciar A.
- Error de lectura, validación, sesión, activación y publicación: mensaje específico y recuperación.
- Respuesta perdida/doble envío: sin duplicados; fallo de publicación conserva activación exitosa.
- URL antigua, refresh, dos pestañas y reanudación en otro dispositivo: intención y contexto correctos.
- Guardar perfil conserva reservas/cupos; hotel y añadir opción mantienen su comportamiento.
- Escritorio/móvil: estilo de etapas conservado, sin desbordamiento, foco visible y orden de teclado.

Extender pruebas existentes de `tests/playbook/` (launch-tour, complete-to-publish-resume,
tour-wizard-contract, tour-preview-canonical-context, tour-commercial-rate-context),
`tests/unit/preparation-session*.test.ts`, `tests/render/tour-preparation-progress.test.ts`
y `tests/render/playbook-session-persistence.test.ts`. Añadir casos nuevos de separación,
agrupación y retorno donde corresponda; probar resultados observables, no sólo cadenas de código.

Integración: `tests/integration/preparation-session-persistence.test.ts`,
`tour-slot-profile-persistence.test.ts` y `tour-guided-rate-activation-transaction.test.ts`.
Ejecutar con configuración/env de pruebas y fixtures aislados; no activar ni publicar el tour
real del ejemplo. Validar carreras y persistencia en PostgreSQL, no únicamente con mocks.

Comandos de calidad: Vitest dirigido con `FASTT_DATA_ENV=test`; render con
`vitest.astro.config.ts`; integración con `vitest.integration.config.ts` cuando corresponda.
Después ejecutar `pnpm run check`, ESLint de archivos afectados, `pnpm run check:ui`,
`pnpm run build`, `pnpm run check:docs` y `git diff --check`. Comprobar nuevos archivos UI
explícitamente si el guardrail sólo enumera archivos tracked. Antes de commit, si se solicita,
ejecutar `pnpm run check:docs:staged`.

La revisión visual usa Brave o LibreWolf y capturas comparables antes/después, con el disclosure
abierto y cerrado. Verificar teclado, lector semántico, errores anunciados y retorno de foco;
no confiar sólo en snapshots. No ejecutar un proyecto Playwright que arranque Chrome por defecto.

## 5. Criterio de cierre

Entregar una matriz requisito → cambio → evidencia → resultado, sin crear otro reporte de
sesión en docs. Cerrar únicamente si todos los casos aplicables pasan y el resultado visual
conserva la referencia. Si hay gaps, registrarlos, resolver uno por uno y repetir los casos
impactados hasta comprobar el contrato; una compilación exitosa no acredita experiencia correcta.
Distinguir evidencia local de despliegue. Una prueba bloqueada se declara pendiente, nunca aprobada.
Mantener esta especificación y el diagrama sincronizados si aparece una decisión justificada.
