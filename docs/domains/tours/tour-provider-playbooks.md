# Playbooks del proveedor para tours

Status: active  
Document type: canonical  
Owner: Tours / Provider Experience  
Last verified: 2026-09-30
Scope: definición ideal de los recorridos guiados (playbooks) del proveedor de tours, sus etapas, diagnóstico compartido, navegación y reglas de interfaz  
Source of truth: este documento; implementación en `src/lib/playbook/`, layouts de playbook y superficies enlazadas del proveedor  
Related code/tests: `src/lib/playbook/`, `src/layouts/PlaybookLayout.astro`, `src/pages/product/`, `src/pages/catalog/tours.astro`, pruebas de wizard comercial de tours  
Review trigger: cambio de etapas, playbooks, requisitos de preparación, verificación o activación comercial de tours  
Supersedes: [Flujo del proveedor para tours](./provider-workflow.md) (recuento y orden de etapas del recorrido de preparación)

## Principios de diseño (referencia de mercado)

- **Airbnb:** separa creación de la experiencia, revisión y programación posterior; distingue requisitos del anfitrión de requisitos del anuncio. En Fastt esto respalda separar preparación de la oferta y habilitación del proveedor, aunque ambas confluyan antes de publicar.
- **Airbnb (programación):** reúne fecha, hora, modalidad, precio, tamaño del grupo y repetición; al editar distingue una ocurrencia de las futuras y explica el tratamiento de experiencias ya reservadas. El alcance de un cambio debe ser explícito.
- **Airbnb (pendientes):** acción concreta que conduce a la sección que debe corregirse (por ejemplo, completar el precio de una opción), no un aviso genérico que devuelve al inicio.
- **Expedia:** sus fuentes públicas respaldan separar configuración inicial de operación cotidiana; no imponen un orden de editor privado verificable desde documentación externa.

## Base reutilizable

| Recorrido o herramienta | Decisión |
| ----------------------- | -------- |
| **Crear tour** (`launch-tour`) | Conservar sus formularios y reorganizarlos en el playbook de preparación. |
| **Completar preparación** (`complete-to-publish`) | Convertirlo en modo de continuación del mismo recorrido de creación, no un playbook con reglas distintas. |
| **Verificación de tours** | Recorrido independiente, conectado con cada experiencia. |
| **Añadir o editar salida** | Recorrido corto para añadir una opción comercial completa; reutilizar formulario, persistencia y enlaces comerciales existentes. |
| **Corregir pendientes** | Reparación guiada basada en el diagnóstico compartido. |
| **Calendario, reservas y operación diaria** | Acceso directo; no obligar a pasar por la creación. |
| **Solicitudes privadas** | Gestión de solicitudes hasta existir una cotización estructurada (fuera del alcance de un playbook de cierre de venta privada en la fase actual). |

**Continuar preparación** es una entrada al playbook 1 que conserva lo ya hecho.

## Cuatro playbooks

| Playbook | Finalidad | Tipo de navegación |
| -------- | --------- | ------------------ |
| **1. Preparar y publicar un tour** | Construir una primera oferta coherente. | Seis etapas, con reanudación. |
| **2. Habilitar mi actividad de tours** | Resolver identidad y requisitos aplicables al proveedor. | Áreas paralelas con estados. |
| **3. Añadir una opción al tour** | Incorporar otro horario, idioma o modalidad vendible. | Recorrido corto de cuatro pasos. |
| **4. Resolver pendientes de venta** | Corregir causas concretas de bloqueo o pérdida de disponibilidad. | Pasos dinámicos según diagnóstico. |

## Playbook 1 — Preparar y publicar un tour

### Seis etapas

| Etapa | Contenido | Condición para completarla |
| ----- | --------- | -------------------------- |
| **1. Presenta tu experiencia** | Nombre, destino de descubrimiento, categoría pública, descripción y destacados. | Información persistida y validada con los mismos criterios que verá el preview. |
| **2. Recorrido y logística** | Duración, itinerario, inclusiones, exclusiones, encuentro, recogida y requisitos del participante. | Duración coherente y logística suficiente para entender qué ocurrirá. |
| **3. Fotos** | Carga, portada, orden, recorte y descripciones pertinentes. | Se cumple el mínimo vigente y no quedan archivos pendientes de carga. |
| **4. Opción, precio y condiciones** | Participantes, horario, idioma, modalidad, precio, monedas, condiciones y preguntas. | Una opción comercial queda configurada de forma consistente. |
| **5. Fechas y cupos** | Fechas concretas o repetición explícita, capacidad por fecha y excepciones. | Existe disponibilidad conforme a la modalidad y al contrato vigente. |
| **6. Revisar y publicar** | Ficha real, resumen comercial, preparación, habilitación y acción final. | El servidor confirma todos los requisitos aplicables. |

### Etapa 4 — Subpasos

Subpasos breves, sin una sola página con todos los formularios abiertos:

1. Grupo y horario  
2. Precio  
3. Condiciones  

### Mínimos de contenido

Los mínimos actuales (**cinco fotos** y **tres actividades del itinerario**) deben anunciarse en sus formularios correspondientes. Si se flexibilizan por tipo de experiencia, debe ser una decisión explícita y reflejarse en todos los validadores.

### Condiciones y calendario

Condiciones van **antes** del calendario. Antes de elegir fechas se explica la regla relativa (por ejemplo, “hasta 24 horas antes”). Después de configurar una fecha, la revisión final muestra un ejemplo con día, hora y zona reales. No debe aparecer un error por no haber completado todavía una etapa posterior.

### Revisión final — Tres estados

| Estado | Significado |
| ------ | ----------- |
| **Ficha preparada** | Contenido y configuración completos. |
| **Negocio habilitado** | Requisitos aplicables aprobados. |
| **Oferta disponible** | Fechas, precio y cupo permiten recibir reservas o solicitudes. |

Permite comunicar, por ejemplo: “La ficha está preparada; tu documentación sigue en revisión”.

### Comportamiento al guardar una salida (dentro del recorrido)

| Entrada | Comportamiento esperado |
| ------- | ------------------------ |
| Paso del recorrido principal | Guardar y continuar al siguiente requisito. |
| Ajuste temporal desde condiciones | Guardar y volver a la tarifa de origen. |
| Edición cotidiana | Guardar y permanecer o volver al listado contextualizado. |

### Finalización comercial

La finalización debe devolver un resultado verificable: **configuración completada**, **pendiente concreto** o **fallo recuperable**. No un éxito general cuando una parte necesaria falló.

### Separación de acciones de persistencia

- Guardar el **perfil** modifica horario, idioma, modalidad y máximo de participantes por grupo (`TourSlotProfile` y su límite en `VariantCapacity`). Conserva todas las fechas, cupos y reservas de `DailyInventory`.
- El cupo predeterminado de `VariantInventoryConfig` se inicializa al crear la opción. En una edición sólo cambia al marcar **«Usar este máximo como cupo predeterminado para nuevas fechas»**; se conservan horizonte y fecha de creación. La acción no abre fechas ni modifica las ya programadas.
- **Abrir fechas** modifica las fechas seleccionadas.  
- **Cambiar capacidad** propone un alcance explícito.  
- Las **reservas existentes** y **excepciones manuales** requieren tratamiento propio.

### Diagnóstico de preparación (requisitos independientes)

El diagnóstico debe comprobar por separado, entre otros:

- Perfil  
- Precio  
- Condiciones  
- Fechas  
- Cupo  
- Activación comercial  

No confundir “tener configuración” con “poder vender”. Precio y disponibilidad no deben depender de un único contador que mezcle perfil, capacidad y existencia de tarifa sin acreditar precio válido ni fecha reservable.

### Contexto comercial visible

La **opción** (variante/salida) y **tarifa** seleccionadas deben ser visibles y conservarse en catálogo, guía, preview y servidor. Si falta selección y existen varias opciones, debe pedirse elegir una; no escoger silenciosamente la primera.

### Progreso

- La **posición** puede mostrarse como “Etapa X de 6”.  
- El **porcentaje** expresa exclusivamente requisitos preparados, con el **mismo cálculo** en catálogo, guía y preview.  
- Un identificador explícito de recorrido de **tours** debe prevalecer sobre parámetros genéricos de flujo de creación (por ejemplo `flow=create` de alojamiento).

### Reanudación y persistencia

- Recuperación mediante **sessionStorage** y **sesión persistida de preparación** (conservar ambos patrones donde apliquen).  
- La sesión de preparación debe distinguir **producto** además de proveedor, usuario y playbook.  
- Los borradores locales al salir no sustituyen guardado en servidor.  
- Creaciones y activaciones deben ser **recuperables e idempotentes** (evitar duplicar variantes tras respuesta perdida).

### Requisitos visibles desde el inicio

Separar contenido y habilitación del negocio, pero el proveedor debe conocer **ambos** desde el principio. La pantalla final no debe revelar exigencias que el recorrido omitió explicar (por ejemplo, revisión editorial).

## Playbook 2 — Habilitar mi actividad de tours

Recorrido **independiente** de la preparación de la ficha, conectado cuando se abre desde un tour.

### Áreas (trabajo paralelo)

| Área | Qué debe resolver |
| ---- | ----------------- |
| **Identidad** | Titular y representación cuando corresponda; reutilización de evidencia válida. |
| **Actividad y licencias** | Papel operativo, actividades, territorio y credenciales aplicables. |
| **Seguridad y permisos** | Evidencias determinadas por actividad, alcance y política aprobada. |
| **Fiscal** | Identidad fiscal del vendedor y estado de revisión. |

### Reglas

- En el modelo inicial de **cobro directo**, no añadir una tarea de liquidación de Fastt como requisito artificial.  
- **“En revisión”** no significa **“Listo”**. **“No evaluable”** debe explicar qué falta para determinar el requisito.  
- Si falta una decisión de Fastt, el pendiente pertenece a Fastt: no pedir al proveedor documentos indeterminados.  
- Abierto desde un tour: conservar **experiencia**, **pestaña** y **retorno**.  
- Proveedores mixtos: reutilizar evidencia solo cuando el alcance es válido; el progreso de alojamiento permanece independiente.

## Playbook 3 — Añadir una opción al tour

**Entrada:** “Añadir opción” desde el tour o sus salidas.

| Paso | Contenido |
| ---- | --------- |
| **1. Configurar la opción** | Nombre, horario, idioma, modalidad, capacidad y diferencias respecto al tour. |
| **2. Precio y condiciones** | Reutilizar explícitamente una configuración compatible o crear otra. |
| **3. Fechas y cupos** | Seleccionar qué fechas se habilitan. |
| **4. Revisar y activar** | Comprobar el resultado y mostrar exactamente qué recibirá el viajero. |

- Debe permitir **“Usar como base una opción existente”**, mostrando qué se copiará.  
- No copiar reservas, aprobaciones documentales ni excepciones de calendario sin decisión explícita.

### Vocabulario

| Término | Definición |
| ------- | ---------- |
| **Opción** | Combinación reutilizable de horario, idioma y modalidad. |
| **Salida programada** | Esa opción en una fecha concreta. |

Agregar otra fecha a la **misma opción** se resuelve en **calendario**, sin duplicar la experiencia ni crear otra variante.

### Modalidad privada

Describir el resultado como **recepción de solicitudes**. La aceptación con nota no constituye por sí sola una reserva confirmada ni una cotización económica estructurada.

## Playbook 4 — Resolver pendientes de venta

Recorrido **dinámico** en tres momentos:

1. **Identificar:** qué falla, en qué opción o fecha, y quién debe actuar.  
2. **Corregir:** abrir el formulario correspondiente con el campo o sección enfocados.  
3. **Comprobar:** reevaluar y confirmar si la causa quedó resuelta.

| Pendiente | Destino correcto |
| --------- | ---------------- |
| No hay fechas futuras | Calendario de la opción afectada. |
| Tarifa sin precio válido | Precio de esa tarifa. |
| Política incompatible | Editor de esa condición. |
| Salida configurada pero sin activar | Revisión y activación comercial. |
| Evidencia vencida | Documento y alcance que requieren renovación. |
| Política Fastt pendiente | Estado de espera y atención interna; sin formulario documental ficticio. |
| Todos los cupos vendidos | Informar agotamiento; ofrecer ampliar o abrir fechas si corresponde. |

No todo pendiente es un error: **agotamiento**, **pausa voluntaria** y **revisión interna** necesitan estados distintos.

## Operación diaria (fuera de playbooks largos)

Cambiar un precio, cerrar una fecha, revisar un manifiesto o registrar asistencia requiere **contexto visible**, **alcance del cambio** y **resultado verificable**, con acceso directo a calendario, reservas y operación del día.

No construir en esta fase un quinto playbook de **“cerrar venta privada”** sobre el formulario de notas existente; requiere cotización con importe, moneda, vigencia, condiciones, aceptación y enlace al flujo de reserva (proyecto posterior con contrato propio).

## Interfaz compartida de los playbooks guiados

### Barra de progreso y encabezado

- Encabezado persistente con **nombre del tour** y, cuando corresponda, **opción** y **tarifa**.  
- **Etapa actual** separada del **porcentaje preparado**.  
- Escritorio: índice compacto de las seis etapas (playbook 1) con estados.  
- Móvil: desplegable “Ver preparación”.  
- **Una acción principal** por pantalla.  
- **“Guardar y continuar”** solo avanza tras confirmar persistencia en servidor.  
- **“Guardar y salir”** solo si realmente guarda en servidor.  
- Estados **cambios pendientes**, **guardando**, **guardado** y **error** visibles sin llenar la pantalla de avisos.  
- Errores junto al campo y foco en el primer problema.  
- Color acompañado siempre de **texto o icono**.  
- Transiciones breves, interrumpibles y compatibles con movimiento reducido.

### Desvíos y retorno

Los desvíos anuncian su retorno (por ejemplo, “Editar punto de encuentro y volver a condiciones”). Al terminar, recuperan la **misma tarifa** y **contexto**.

### Preview

Conservar la **presentación pública compartida**; evitar navegación administrativa duplicada dentro de la ficha incrustada. La simulación comercial es de **lectura** y queda diferenciada de una reserva.

## Construcción técnica compartida

- **Una definición canónica** del recorrido de tours; identificadores antiguos como entradas compatibles.  
- **Contexto compartido:** proveedor, producto, opción, tarifa, etapa, modalidad y retorno.  
- **Diagnóstico único** con requisitos independientes, estado, causa, responsable y enlace exacto de corrección.  
- Separar evaluación de **preparación**, **autorización para publicar** y **disponibilidad para reservar**.  
- **Reutilizar** componentes de edición existentes dentro de la guía.  
- **Formularios compartidos** entre entradas del mismo playbook (creación y continuación).  
- Persistir reanudación **por producto y recorrido**.  
- Cargar contexto **una vez por petición**; evitar recalcular agregados completos desde página, layout y preview por separado.  
- Conectar reservas y políticas existentes; no introducir un motor paralelo de reglas.

## Contrato de políticas comerciales (tours)

La activación comercial debe respetar el **contrato de tours** (por ejemplo, cancelación y pago obligatorias donde aplique), sin exigir categorías de política propias de alojamiento (como check-in hotelero) que el vertical no admite.
