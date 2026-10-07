# Playbooks del proveedor para tours

Status: active  
Document type: canonical  
Owner: Tours / Provider Experience  
Last verified: 2026-10-05
Scope: definición ideal de los recorridos guiados (playbooks) del proveedor de tours, sus etapas, diagnóstico compartido, navegación y reglas de interfaz  
Source of truth: este documento; implementación en `src/lib/playbook/`, layouts de playbook y superficies enlazadas del proveedor  
Related code/tests: `src/lib/playbook/`, `src/layouts/PlaybookLayout.astro`, `src/pages/product/`, `src/pages/catalog/tours.astro`, pruebas de wizard comercial de tours  
Review trigger: cambio de etapas, playbooks, requisitos de preparación, verificación o activación comercial de tours  
Supersedes: `docs/domains/tours/provider-workflow.md` (retirado: recuento histórico de pantallas; reemplazado por preparación y revisión con diagnóstico compartido)

## Base reutilizable

- **Preparar tour** y **Publicar tour**: dos playbooks con navegación y pantallas de entrada propias dentro de un único flujo. Comparten datos, formularios y validación, no indicadores simultáneos.
- **Verificación**: independiente, conectada con la experiencia.
- **Añadir o editar salida**: opción comercial completa con persistencia y enlaces existentes.
- **Corregir pendientes**: reparación según diagnóstico compartido.
- **Calendario y operación diaria**: acceso directo sin repetir creación.
- **Solicitudes privadas**: gestión de solicitudes; cotización y cierre de venta quedan fuera del alcance actual.


## Cuatro flujos de trabajo

| Flujo                                  | Finalidad                                                         | Tipo de navegación                                             |
| -------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| **1. Preparar y publicar un tour**     | Construir una primera oferta coherente.                           | Dos playbooks conectados: Preparar tour → Publicar tour.       |
| **2. Habilitar mi actividad de tours** | Resolver identidad y requisitos aplicables al proveedor.          | Áreas paralelas con estados.                                   |
| **3. Añadir una opción al tour**       | Incorporar otro horario, idioma o modalidad vendible.             | Recorrido corto de cuatro pasos.                               |
| **4. Resolver pendientes de venta**    | Corregir causas concretas de bloqueo o pérdida de disponibilidad. | Pasos dinámicos según diagnóstico.                             |

## Flujo 1 — Crear y publicar un tour

La [especificación de Preparar tour y Publicar tour](./tour-preparation-publication.md)
define dos playbooks conectados dentro de un flujo: A construye el borrador en nueve etapas;
B evalúa lo guardado, muestra sólo pendientes, reutiliza formularios precargados y confirma
la publicación. Sus indicadores y navegación nunca se muestran simultáneamente.

Es el contrato objetivo reformulado; el código en curso aún debe adaptarse y verificarse.
El reporte incluye ambos flujos, pantallas, retornos, casos límite y criterios de aceptación.
El [diagrama editable](./diagrams/01-preparar-publicar-tour.excalidraw) representa el mismo contrato.

### Separación de acciones de persistencia

- Guardar el **perfil** modifica horario, idioma, modalidad y máximo de participantes por grupo (`TourSlotProfile` y su límite en `VariantCapacity`). Conserva todas las fechas, cupos y reservas de `DailyInventory`.
- El cupo predeterminado de `VariantInventoryConfig` se inicializa al crear la opción. En una edición sólo cambia al marcar **«Usar este máximo como cupo predeterminado para nuevas fechas»**; se conservan horizonte y fecha de creación. La acción no abre fechas ni modifica las ya programadas.
- **Abrir fechas** modifica las fechas seleccionadas.  
- **Cambiar capacidad** propone un alcance explícito.  
- Las **reservas existentes** y **excepciones manuales** requieren tratamiento propio.

### Diagnóstico de preparación (requisitos independientes)

Contrato B1: `src/lib/tours/tourDiagnosticContract.ts`; referencias ejecutables: `tests/unit/tour-diagnostic-contract.test.ts`.

| Eje | Requisitos | Alcance |
| --- | --- | --- |
| Preparación | `presentation`, `logistics`, `photos`, `participants`, `activities` | Producto: contenido, itinerario/ubicación/inclusiones, fotos, participantes y actividades. |
| Preparación | `option_profile`, `group_capacity`, `price`, `conditions`, `calendar_configuration` | Opción/tarifa: perfil, límite de grupo, importe/moneda, condiciones compatibles y calendario configurado. |
| Autorización | `provider_authorization`, `experience_authorization` | Negocio y experiencia, alcance y vigencia. |
| Activación | `option_activation`, `rate_activation` | Estado comercial persistido. |
| Operación | `current_availability` | Fecha/grupo actuales: agotamiento, pausa y ausencia de fechas son causas distintas. |

Estados: `ready` exige evidencia; `pending`, acción pendiente; `blocked`, impedimento conocido; `not_evaluable`, contexto o lectura insuficientes; `not_applicable`, causa y referencia explícitas. Los pendientes identifican responsable (proveedor/Fastt), causa y acción.

Preparación = listas / diez, redondeado. Lo desconocido queda en el denominador; v1 no exime preparación por modalidad privada. Autorización, activación, operación, navegación y preview derivado no suman. Agotamiento o revisión pueden coexistir con 100% preparado.

En privadas, `current_availability` es `not_applicable`: una solicitud no retiene inventario compartido. Con los demás requisitos cumplidos se muestran solicitudes privadas habilitadas. En compartidas, el diagnóstico distingue fechas futuras ausentes, fechas sin cupo habilitado y cupos agotados; la desactivación comercial pertenece al eje de activación.

Capacidades: preparar, activar, publicar, reservar y recibir solicitud; decisiones del servidor con fuente y causas, nunca permiso por porcentaje. Compartida requiere cotización y hold. Privada recibe solicitud sin cupo ni cotización; aceptarla no confirma venta. La solicitud privada verifica autorización comercial y evidencia vigente antes de persistir; no reserva inventario ni genera cotización.

### Contexto comercial visible

`loadTourCommercialContext.ts` y `resolveTourCommercialContext.ts` validan pertenencia proveedor/producto/opción/tarifa. Prioridad: URL explícita, sesión del mismo usuario/producto/línea, oferta única. URL inválida se rechaza; sesión obsoleta se descarta. Lectura fallida conserva `recoveryIntent` sin permisos: reintentar los mismos IDs, sin sustituir oferta. Selector, enlaces y comandos conservan retorno, playbook y selección validada. Pruebas: `tests/unit/tour-commercial-context*.test.ts`.

`buildTourDiagnostic.ts` reutiliza publicación, autorización y preparación en lectura (`persist: false`). `tourActivationDecision` conserva causas, responsable, acción y retorno; activar no exige activación previa ni ficha editorial completa. El comando mantiene autorización, reevaluación de lifecycle y transacción; reintentos recuperan el estado persistido. Guardar fechas refresca diagnóstico y URL. Calendario configurado y cupo actual son independientes; errores son `not_evaluable`. Autorización y activación no reducen preparación.

`loadCompleteToPublishState` comparte una promesa GET por petición, proveedor, producto e intención comercial; página y layout no repiten lecturas. Navegación no cambia la clave. Fallos sólo se comparten dentro de esa petición. Mutaciones, peticiones nuevas y evaluaciones sin petición consultan de nuevo; no reutilizan cotizaciones ni permisos previos.

`tourDiagnosticPresentation.ts` proyecta motivos y acciones con selección y retorno en catálogo, dashboard, guía, preview y APIs. Una lectura fallida ofrece reintento. Pruebas: `tests/unit/tour-preparation-diagnostic.test.ts` y `tests/unit/product-tour-selection-api.test.ts`.

El negocio es `Provider`; cada tour es `Product` + `Tour`; sus opciones son `Variant` +
`TourSlotProfile`. Tarifas y fechas no crean otros tours. Resumen presenta actividad del día
local, solicitudes privadas y como máximo la última preparación válida; Mis tours concentra
el catálogo, con una fila por producto, búsqueda y filtros editoriales paginados. La identidad
comercial aparece en el shell, sin repetirla en cada ficha.

El catálogo separa borrador/publicado de preparación y habilitación actuales. Sus filtros
cuentan estados editoriales; las acciones y pendientes proceden del diagnóstico de la oferta,
nunca de `Product.publicationState=ready`. Una selección ambigua requiere elegir oferta.
Agotamiento no reduce preparación. Sólo se evalúa la página visible; Resumen no vuelve a
evaluar todo el catálogo. Referencias: `src/lib/catalog/providerTourCatalog.ts`,
`src/components/dashboard/TourBusinessOverview.astro`, `src/lib/tours/tourCatalogPresentation.ts`
y `tests/integration/provider-tour-catalog.test.ts`.

### Persistencia compartida

Sesiones v2 por proveedor/usuario/producto/playbook: validación, lock y upsert atómicos,
selección validada y rechazo de navegación atrasada. La separación A/B debe mantener estas
garantías y registrar intención de reanudación; los datos locales no sustituyen el servidor.
Referencia: `tests/integration/preparation-session-persistence.test.ts` y
[operación PostgreSQL](../../engineering/supabase-migration.md#sesiones-de-preparación-por-producto).
Creaciones y activaciones recuperan el mismo resultado tras reintentos.

## Playbook 2 — Habilitar mi actividad de tours

Recorrido **independiente** de la preparación de la ficha, conectado cuando se abre desde un tour.

### Áreas (trabajo paralelo)

| Área                      | Qué debe resolver                                                               |
| ------------------------- | ------------------------------------------------------------------------------- |
| **Identidad**             | Titular y representación cuando corresponda; reutilización de evidencia válida. |
| **Actividad y licencias** | Papel operativo, actividades, territorio y credenciales aplicables.             |
| **Seguridad y permisos**  | Evidencias determinadas por actividad, alcance y política aprobada.             |
| **Fiscal**                | Identidad fiscal del vendedor y estado de revisión.                             |

### Reglas

- En el modelo inicial de **cobro directo**, no añadir una tarea de liquidación de Fastt como requisito artificial.  
- **“En revisión”** no significa **“Listo”**. **“No evaluable”** debe explicar qué falta para determinar el requisito.  
- Si falta una decisión de Fastt, el pendiente pertenece a Fastt: no pedir al proveedor documentos indeterminados.  
- Abierto desde un tour: conservar **experiencia**, **pestaña** y **retorno**.  
- Proveedores mixtos: reutilizar evidencia solo cuando el alcance es válido; el progreso de alojamiento permanece independiente.

## Playbook 3 — Añadir una opción al tour

**Entrada:** “Añadir opción” desde el tour o sus salidas.

| Paso                        | Contenido                                                                     |
| --------------------------- | ----------------------------------------------------------------------------- |
| **1. Configurar la opción** | Nombre, horario, idioma, modalidad, capacidad y diferencias respecto al tour. |
| **2. Precio y condiciones** | Reutilizar explícitamente una configuración compatible o crear otra.          |
| **3. Fechas y cupos**       | Seleccionar qué fechas se habilitan.                                          |
| **4. Revisar y activar**    | Comprobar el resultado y mostrar exactamente qué recibirá el viajero.         |

- Debe permitir **“Usar como base una opción existente”**, mostrando qué se copiará.  
- No copiar reservas, aprobaciones documentales ni excepciones de calendario sin decisión explícita.

### Vocabulario

| Término               | Definición                                               |
| --------------------- | -------------------------------------------------------- |
| **Opción**            | Combinación reutilizable de horario, idioma y modalidad. |
| **Salida programada** | Esa opción en una fecha concreta.                        |

Agregar otra fecha a la **misma opción** se resuelve en **calendario**, sin duplicar la experiencia ni crear otra variante.

### Modalidad privada

Describir el resultado como **recepción de solicitudes**. La aceptación con nota no constituye por sí sola una reserva confirmada ni una cotización económica estructurada.

## Playbook 4 — Resolver pendientes de venta

Recorrido **dinámico** en tres momentos:

1. **Identificar:** qué falla, en qué opción o fecha, y quién debe actuar.  
2. **Corregir:** abrir el formulario correspondiente con el campo o sección enfocados.  
3. **Comprobar:** reevaluar y confirmar si la causa quedó resuelta.

| Pendiente                           | Destino correcto                                                         |
| ----------------------------------- | ------------------------------------------------------------------------ |
| No hay fechas futuras               | Calendario de la opción afectada.                                        |
| Tarifa sin precio válido            | Precio de esa tarifa.                                                    |
| Política incompatible               | Editor de esa condición.                                                 |
| Salida configurada pero sin activar | Revisión y activación comercial.                                         |
| Evidencia vencida                   | Documento y alcance que requieren renovación.                            |
| Política Fastt pendiente            | Estado de espera y atención interna; sin formulario documental ficticio. |
| Todos los cupos vendidos            | Informar agotamiento; ofrecer ampliar o abrir fechas si corresponde.     |

No todo pendiente es un error: **agotamiento**, **pausa voluntaria** y **revisión interna** necesitan estados distintos.

## Operación diaria (fuera de playbooks largos)

Cambiar un precio, cerrar una fecha, revisar un manifiesto o registrar asistencia requiere **contexto visible**, **alcance del cambio** y **resultado verificable**, con acceso directo a calendario, reservas y operación del día.

No construir en esta fase otro playbook de **“cerrar venta privada”** sobre el formulario de notas existente; requiere cotización con importe, moneda, vigencia, condiciones, aceptación y enlace al flujo de reserva (proyecto posterior con contrato propio).

## Interfaz compartida de los playbooks guiados

### Barra de progreso y encabezado

- Encabezado persistente con **nombre del tour** y, cuando corresponda, **opción** y **tarifa**.  
- **Preparar tour:** sólo etapa actual; índice bajo demanda.
- **Publicar tour:** sólo pendientes accionables; cumplidos plegados.
- Nunca mostrar ambos índices o porcentajes competidores en una misma pantalla.
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

- **Un flujo canónico con dos playbooks** para crear/publicar; entradas antiguas compatibles.
- **Contexto compartido:** proveedor, producto, opción, tarifa, playbook, ubicación, modalidad y retorno.
- Separar evaluación de **preparación**, **autorización para publicar** y **disponibilidad para reservar**.  
- **Reutilizar** componentes de edición existentes dentro de la guía.  
- **Formularios compartidos** entre entradas del mismo playbook (creación y continuación).  
- Cargar contexto **una vez por petición**; evitar recalcular agregados completos desde página, layout y preview por separado.  
- Conectar reservas y políticas existentes; no introducir un motor paralelo de reglas.

## Contrato de políticas comerciales (tours)

La activación comercial debe respetar el **contrato de tours** (por ejemplo, cancelación y pago obligatorias donde aplique), sin exigir categorías de política propias de alojamiento (como check-in hotelero) que el vertical no admite.
