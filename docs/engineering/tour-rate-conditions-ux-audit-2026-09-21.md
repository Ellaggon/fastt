# Auditoría de condiciones de tarifa: tours y reutilización por negocio

Fecha: 21 de septiembre de 2026. Estado: análisis y plan; las Fases A, B y C quedaron cerradas en
[`docs/ops/tours-policy-contract-phase-a-closeout.md`](../ops/tours-policy-contract-phase-a-closeout.md)
y [`docs/ops/tours-policy-compatibility-phase-b-closeout.md`](../ops/tours-policy-compatibility-phase-b-closeout.md),
y [`docs/ops/tours-policy-preview-phase-c-closeout.md`](../ops/tours-policy-preview-phase-c-closeout.md).

## 1. Conclusión

Conviene conservar la página de tarifa, las entidades de políticas y el mecanismo de asignación/versionado. Es necesario separar la presentación, las opciones permitidas y los escenarios de cálculo por capacidades del negocio. Duplicar toda la página para tours crearía dos implementaciones que acabarían divergiendo; sustituir palabras en el modal actual tampoco resuelve el problema contractual.

La adaptación anterior alcanzó la superficie exterior, pero no completó los flujos interiores. Por tanto, la declaración previa de cierre de H16/H17 en código fue demasiado amplia respecto de las condiciones comerciales. Esta auditoría registra esa brecha de implementación; no debe confundirse con la certificación manual pendiente de Fase 5.

## 2. Alcance y evidencia

Se revisó la ruta de tarifa indicada por el usuario y sus componentes, plantillas, llamadas de cliente, endpoints de opciones, vista previa y asignación, además del constructor financiero y el contrato de pago de tours. El ejemplo visual proviene del usuario. El intento de inspección de la pestaña en Brave falló por tiempo de respuesta del navegador; no se afirma haber abierto todos los modales en esta revisión.

Fuentes principales en el repositorio:

- `src/pages/rates/plans/[ratePlanId].astro`: página, pestañas, preguntas, estado y eliminación.
- `src/components/policy/RatePlanPoliciesSurface.astro`: resumen y botones por categoría.
- `src/components/policy/PolicyAssignmentFlow.astro`: modos plantilla, existente y personalizada, vista previa y guardado.
- `src/data/policy/policy-presets.ts`: catálogo contractual de plantillas.
- `src/lib/policies/buildPolicyCategoryPreview.ts`: presentación de consecuencias.
- `src/pages/api/policies/{assignment-options,preview,assign}.ts`: opciones y validaciones de servidor.
- `src/modules/financial/application/use-cases/build-policy-financial-preview.ts`: simulaciones e importes de ejemplo.
- `src/modules/policies/application/use-cases/build-policy-calculation-snapshot.ts`: plazos y ancla temporal.
- `src/lib/tours/tour-payment-terms.ts`: pago al proveedor durante la experiencia.

## 3. Causa raíz

`RatePlanPoliciesSurface` reconoce `offeringType === "tour"`, pero entrega al modal principalmente `paymentMode="provider_at_experience_only"`. El modal carece de un contexto integral de negocio. Su catálogo llega desde `assignment-options` sin filtro contractual por destino; la vista previa tampoco deriva del destino la moneda, salida, precio o zona horaria.

El resultado es una pantalla exterior de tours con un editor interior hotelero. Además, `policySummaryForDisplay` reemplaza “primera noche” por “reserva”: puede ocultar una regla incompatible sin modificar su significado en el motor.

## 4. Hallazgos priorizados

| ID  | Prioridad | Hallazgo confirmado en código                                                                                                                                                           | Consecuencia y corrección                                                                                                                                                                        |
| --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C01 | Alta      | Cancelación ofrece todas las plantillas, incluida larga estadía; las demás también contienen reglas de noches y llegada.                                                                | Crear catálogo compatible por actividad, sin modificar las plantillas hoteleras existentes. No basta renombrarlas.                                                                               |
| C02 | Alta      | La API de preview usa por defecto BOB 1.000, llegada dentro de 14 días y estancia de dos noches. El motor añade ejemplo de 28 noches y distribución 80% base, 12% impuestos, 8% cargos. | Los Bs 200 son un supuesto de simulación, no evidencia de impuestos configurados. Mostrar explícitamente los supuestos o usar contexto real; nunca presentarlos como cotización autorizada.      |
| C03 | Alta      | No presentación permite primera noche y estadía completa, incluso en el formulario personalizado.                                                                                       | Para tours admitir sólo bases soportadas —total de reserva o porcentaje— y validar también en servidor.                                                                                          |
| C04 | Alta      | `assign` restringe pago en tours, pero no muestra un control equivalente de compatibilidad para larga estadía, primera noche o CheckIn hotelero.                                        | Una opción oculta en cliente seguiría pudiendo asignarse por API. Centralizar la validación de compatibilidad en opciones, preview y escritura.                                                  |
| C05 | Alta      | En reutilización de pago, la consulta selecciona sólo `ruleValue`, pero busca `row.ruleKey === "paymentType"`.                                                                          | No encuentra la regla y puede rechazar pago al proveedor válido. Seleccionar/filtrar la clave y cubrir el caso con integración.                                                                  |
| C06 | Alta      | El preview de plantillas y políticas existentes no envía hora de salida; el personalizado ofrece 09:00 como ejemplo. Los tiers por días pueden calcular un límite a medianoche.         | Una ventana en días calendario no equivale a horas exactas antes de la salida. Definir semántica y usar el mismo ancla que reserva/cancelación; no convertir políticas antiguas silenciosamente. |
| C07 | Media     | Títulos, textos de pago y no presentación, ámbitos “Hotel/Habitación” y resumen financiero permanecen hoteleros.                                                                        | Presentadores y vocabulario por negocio; ámbitos de tours: experiencia, salida, tarifa.                                                                                                          |
| C08 | Alta      | La UI de preview habla de reembolso/cobro mientras tours opera sin cobro en plataforma.                                                                                                 | Separar penalidad contractual, saldo pagado y reembolso realmente procesable. No prometer devolución automática ni liquidación al operador.                                                      |
| C09 | Media     | Al abrir en modo simple se usa por defecto plantilla y se selecciona la primera opción, aunque el disparador lleva política actual.                                                     | Abrir mostrando condición vigente y su origen; ninguna sustitución implícita por abrir el modal.                                                                                                 |
| C10 | Media     | El guardado desactiva el botón después de esperar preview y no envuelve el fetch de asignación con recuperación `try/finally`.                                                          | Revisar doble clic durante preview, fallo de red y respuesta perdida. Bloquear desde el inicio y recuperar estado antes de reintentar una escritura incierta.                                    |
| C11 | Media     | El modal es un overlay `div`; sólo se observa foco inicial en cerrar, sin contrato local de diálogo, Escape, contención y retorno del foco.                                             | Usar diálogo accesible compartido y validar teclado, lector y móvil. La conducta final requiere comprobación en navegador.                                                                       |
| C12 | Media     | Los enlaces HTML de pestañas usan sólo `?vista=...`; el JS construye navegación conservando URL.                                                                                        | Preservar contexto también en href para nueva pestaña, navegación sin JS y accesibilidad.                                                                                                        |
| C13 | Media     | El modo técnico describe drafts como “Horario personalizado” aun cuando son cancelación o no presentación.                                                                              | Nombrar la condición por categoría y explicar alcance real e historial sin vocabulario interno.                                                                                                  |
| C14 | Media     | `assignment-options` devuelve políticas activas de todo el proveedor y scopes de sus productos.                                                                                         | Filtrar por destino y compatibilidad; la pertenencia al mismo proveedor no vuelve intercambiables todas las reglas.                                                                              |

## 5. Comportamiento correcto por acción

### Cambiar cancelación

Mostrar primero “Condición actual”, alcance y origen heredado/específico. Tres modos: plantillas compatibles, reutilizar condición compatible y personalizar. Para tours, las etiquetas deben describir el umbral —por ejemplo, “Cancelación gratuita hasta 24 horas antes”— además de cualquier nombre comercial. Los plazos propuestos deben aprobarse como decisiones de producto; no se deduce que todas las actividades deban usar 24 horas.

Personalizar debe ofrecer cantidad y unidad de anticipación, referencia de inicio y penalidad posterior. Evitar dos campos simultáneos días/horas con precedencia escondida. Explicar el tratamiento en el instante exacto del corte. Mostrar zona horaria y salida usada; si no hay salida, utilizar ejemplo explícito o limitarse a la regla relativa.

La vista previa debe separar texto del viajero y simulación del operador. El primero resume condiciones reales; la segunda muestra sus supuestos y escenarios justo antes/después del corte. Quitar larga estadía en tours. No afirmar cobro o reembolso ejecutado.

### Cambiar no presentación

Mostrar la obligación si el viajero no se presenta a la salida. Opciones sólo si están soportadas: porcentaje del total, total de la reserva y exención cuando el contrato la admita. Una penalidad no equivale a capacidad de cargar una tarjeta. La hora de presentación y tolerancia pertenecen a la operación de la salida; no inventar tolerancia desde una política comercial.

### Cambiar pago

Con la capacidad actual de tours, mostrar pago al proveedor al realizar la experiencia, sin prepago ni custodia de fondos por Fastt. Si sólo hay una modalidad, usar una confirmación clara y evitar un selector que sugiera opciones inexistentes. Reutilizar una política compatible debe funcionar. No exponer campos de porcentaje anticipado o vencimiento cuando no aplican.

### Presentación para la salida

Conservar el bloque específico de tours. En lugar de depender del consejo “usa Anterior”, proporcionar acceso directo a la salida correspondiente con regreso al paso y contexto preservado. No habilitar CheckIn/CheckOut hotelero. Para alojamientos conservar sus ventanas de entrada/salida y reglas operativas existentes.

### Plantilla / reutilizar / personalizar

Los tres modos deben usar la misma matriz de compatibilidad. “Reutilizar” informa origen, versión y destinos afectados; guardar reemplaza la asignación de esta tarifa, sin editar una política compartida por otros productos. Una política histórica incompatible debe verse como “requiere revisión”, manteniendo sus snapshots de reservas anteriores.

### Preguntas de reserva

El alcance de todo el tour ya está explicado: no es una propiedad exclusiva de la tarifa visible. Mantenerlo junto al título y al guardado. Revisar al cambiar tarifa que el usuario entienda que modifica preguntas de todas las salidas; ofrecer acceso a configuración de la experiencia. No prometer preguntas por participante, tarifa o idioma si el contrato no las soporta. Confirmar preservación de preguntas existentes al editar presets y obligatoriedad.

### Guardar, cerrar y continuar

Guardar debe identificar experiencia, salida, tarifa y categoría, informar que afecta nuevas contrataciones según el contrato de snapshots y presentar éxito sólo tras persistencia. Cambiar selección invalida el preview. Cerrar no guarda y devuelve el foco al disparador. Un error conserva datos y permite recuperación. “Confirmar condiciones y continuar” debe detectar cambios sin guardar y comprobar preparación efectiva, no sólo presencia visual de tarjetas.

### Edición normal fuera del playbook

Revisar también pestañas precio/condiciones/detalles, tarifa principal, activar/desactivar y eliminar. Son acciones compartidas válidas, pero su contexto debe decir salida/tarifa en tours y habitación/tarifa en alojamientos. Activación debe usar validación comercial; eliminación debe explicar referencias bloqueantes y devolver al producto correcto. Esta auditoría no ejecutó escrituras de estado ni eliminaciones, por lo que no certifica esos efectos.

## 6. Arquitectura recomendada

Conservar `/rates/plans/[ratePlanId]` como contenedor. Separar: contenedor y navegación; editor accesible común; formulario de cancelación por capacidades; presentación de consecuencias; resolución/validación de dominio compartida.

Introducir un contexto resuelto por servidor a partir de tarifa → variante → producto. Campos propuestos: tipo de negocio, nombres de ámbitos, categorías permitidas, bases de penalidad, ancla temporal, unidades admitidas, modos de pago habilitados y capacidades de simulación. La URL ayuda a navegar, pero no decide autorización ni tipo de negocio.

Registrar adaptadores por negocio en lugar de multiplicar `isTour ? ... : hotel`. Alojamiento conserva noches, llegada, estancia larga y primera noche. Tour usa inicio de salida, participantes y penalidad sobre reserva. Nuevos negocios deben declarar capacidades; un tipo desconocido no debe heredar automáticamente hotel. Paquetes combinados requieren una decisión contractual propia y no deben heredar todas las capacidades de sus componentes.

Mantener inicialmente los valores persistidos compatibles, incluido `pay_at_property`, mediante un adaptador de presentación. Renombrar enums de base de datos no es necesario para corregir UX y aumenta el riesgo. Añadir identidad/versionado de plantillas nuevas para tours; no alterar las reglas de una plantilla existente compartida con hoteles.

## 7. Plan de acción por fases

### A — Contrato y caracterización · M

Inventariar consumidores del editor y políticas actualmente asignadas a tours con consultas de sólo lectura. Definir ancla temporal, unidades, bases y semántica del pago posterior. Capturar pruebas de comportamiento hotelero antes de tocarlo. Corregir la consulta de reutilización de pago y agregar su regresión.

Entregables: matriz de compatibilidad, fixtures separados y listado de asignaciones históricas que requieren revisión. Salida: cada opción tiene significado verificable; no se cambia ninguna reserva previa. Dependencias: contrato de pago y snapshots de fases 0–3.

### B — Compatibilidad compartida de servidor · L

Resolver contexto desde el destino; implementar catálogo de tours con identidad propia y validación reutilizable. Aplicarla a opciones, preview y asignación, tanto en preset como existing y draft. Rechazar bases hoteleras en tours y prepago no soportado. Mantener catálogo hotelero sin cambios de reglas.

Entregables: resolver y validadores compartidos, errores accionables y pruebas de API. Salida: ni peticiones directas ni políticas existentes pueden eludir compatibilidad. Depende de A.

### C — Preview fiel y cálculo temporal · L

Separar resumen público, simulación y estado de cobro. Obtener fecha/hora/zona/moneda de la salida cuando corresponda. Si falta un importe real, etiquetar ejemplo o mostrar porcentajes sin monto. Eliminar impuestos y cargos inventados de la vista real. Ejecutar escenarios antes, en y después del corte; verificar que guardar y reservar resuelven las mismas reglas.

Entregables: preview por capacidades y paridad con snapshots. Salida: ninguna cifra ilustrativa parece una cotización y ningún pago posterior promete un reembolso de Fastt. Depende de A y B.

### D — Editor y navegación de tours · L

Pasar contexto completo al editor; abrir condición actual, filtrar los tres modos y contextualizar todos los textos. Incorporar enlace directo a salida. Hacer explícito el alcance global de preguntas. Conservar parámetros en enlaces normales y guía. Implementar estados de cargando, sin opciones, inválido, guardando, guardado y recuperación; resolver accesibilidad del diálogo.

Entregables: subcomponentes reutilizables y formularios específicos donde cambie el significado. Salida: el usuario puede recorrer todos los botones sin conceptos hoteleros ni cambios implícitos. Depende de B; preview final depende de C.

### E — Compatibilidad histórica y despliegue · M

Auditar asignaciones incompatibles; clasificarlas en compatibles, adaptables con decisión explícita y pendientes de reemplazo. No traducir primera noche a reserva ni convertir días a horas automáticamente. Conservar políticas/snapshots históricos y registrar nuevas versiones. Preparar reversión de código que no reinterprete contratos guardados.

Entregables: informe de datos afectados y procedimiento controlado. Salida: hoteles preservan comportamiento; tours incompatibles muestran reparación concreta antes de habilitar venta. Depende de B–D.

### F — Certificación completa · M

Ejecutar pruebas aisladas y luego recorrido autenticado en Brave/LibreWolf. Validar dos tarifas, compartida/privada, múltiples monedas y zonas horarias, cambio de fecha, sin salida, política heredada/específica, datos históricos y proveedor con hoteles y tours. Revisar pago existente, doble clic, red caída, respuesta perdida, sesión vencida y teclado/móvil.

Entregables: evidencia por escenario, build y regresiones aprobadas. Salida: paridad entre editor, resumen, ficha pública y snapshot de nueva reserva, sin alteración de reservas anteriores. Depende de todas las fases previas.

## 8. Matriz mínima de aceptación

| Caso                                        | Resultado esperado                                                  |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Tour: abrir cada botón y los tres modos     | Vocabulario de tours; sólo capacidades compatibles                  |
| Hotel: mismos recorridos                    | Conserva plantillas, noches y cálculos existentes                   |
| Elegir moderada en tour                     | Umbral explícito respecto del inicio; sin estadía de 28 noches      |
| Salida 15:30 y corte de 24 horas            | Límite calculado respecto de 15:30 en zona de la actividad          |
| Preview sin precio/fecha                    | Explica datos faltantes o identifica ejemplo; no inventa cotización |
| Pago posterior                              | No afirma dinero cobrado o devolución automática                    |
| Reutilizar pago compatible                  | Se asigna sin rechazo por regla ausente artificialmente             |
| POST de larga estadía/primera noche en tour | Rechazo de servidor con explicación                                 |
| Guardar una tarifa                          | Otras tarifas y reservas previas conservan su contrato              |
| Abrir y cerrar sin editar                   | Ninguna política se sustituye                                       |
| Fallo de red y reintento                    | Sin éxito falso ni bloqueo permanente; resultado recuperable        |
| Abrir pestaña/enlace en nueva ventana       | Conserva producto, salida, tarifa y retorno aplicable               |
| Tipo de negocio nuevo/desconocido           | No hereda opciones hoteleras por defecto                            |

## 9. Orden recomendado

Priorizar A y B para proteger significado contractual; después C y D para cerrar la experiencia completa; E y F completan migración y evidencia. No considerar cerrado este problema con sustituciones de texto: la aceptación requiere coherencia entre opciones disponibles, reglas guardadas y consecuencias mostradas.
