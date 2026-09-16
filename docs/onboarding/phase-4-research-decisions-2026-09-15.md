# Fase 4 — investigación, decisiones y estrategia de implementación

**Fecha de investigación:** 15-09-2026  
**Estado:** decisiones de producto y arquitectura tomadas; anexos jurisdiccionales pendientes de validación de políticas. Ninguna regla nueva está activada en producción.

## 1. Lo que muestran las plataformas

Airbnb pide al anfitrión declarar si opera como persona o negocio; advierte que esa clasificación depende del contexto y no la decide automáticamente por el anfitrión. Su flujo KYC recoge datos de la persona y, cuando corresponde, del negocio y personas responsables. En algunos lugares la verificación del negocio es requisito anterior a publicar; los datos fiscales pueden afectar pagos, calendario o reservas de manera distinta. También distingue la vivienda entera de una habitación privada o compartida según la exclusividad del espacio. Fuentes: [clasificación de anfitrión](https://www.airbnb.com/help/article/1321), [detalles KYC](https://www.airbnb.com/help/article/3800), [impuestos y payouts](https://www.airbnb.com/help/article/510), [tipos de espacio](https://www.airbnb.com/help/article/317).

Expedia Group describe para hoteles un alta que verifica cuenta y términos comerciales, pide datos fiscales/regulatorios cuando la autoridad local los exige y guarda automáticamente habitaciones, tarifas, fotos, cargos, políticas y disponibilidad. Su línea de alquiler vacacional, Vrbo, usa una ficha de propiedad y un calendario con tarifa base, fechas bloqueadas, tasas, cargos, depósitos, condiciones de pago y estancia mínima. El caso de Canadá muestra que Expedia diferencia persona y entidad, información del beneficiario y ubicación de cada propiedad para reportes; también puede requerir datos del gestor y del dueño. Fuentes: [alta hotelera](https://partner.expediagroup.com/en-us/industries/hotels), [calendario de alquiler vacacional](https://partner.expediagroup.com/en-us/resources/blog/vacation-rental-calendar-management-guide), [requisitos de datos en Vrbo](https://help.vrbo.com/articles/About-Canada-s-data-sharing-requirements), [modelo de alquiler vacacional](https://partner.expediagroup.com/en-us/industries/vacation-rentals).

Estas son referencias de diseño y operación, no políticas legales para Fastt. Airbnb y Expedia aplican reglas que varían por país, forma de cobro y actividad. Por tanto, sus documentos no autorizan a Fastt a omitir registro mercantil en Bolivia ni a exigir una licencia específica para tours en todos los países.

## 2. Decisiones tomadas para la matriz adaptativa

### 2.1 Identidad y contexto

1. **Declaración explícita del titular.** Al crear negocio se pregunta “¿A nombre de quién operarás y recibirás los pagos?” con opciones `persona_natural` y `entidad`. `Profesional` es una preferencia de herramientas, no un tipo jurídico. La cuenta que edita puede ser un gestor distinto del titular económico. El usuario confirma la declaración; Fastt no infiere persona/empresa a partir de volumen, correo o nombre comercial.
2. **Campos distintos.** Persona: nombre legal completo del titular. Entidad: nombre legal, identificador de registro cuando su anexo lo requiera, y persona representante/beneficiario cuando se requiera. `displayName` sigue siendo el nombre comercial público. `legalName` actual se conserva para compatibilidad, pero la etiqueta del formulario cambia según el tipo; para persona significa “Nombre legal del titular”. No se copia automáticamente desde `displayName`.
3. **Jurisdicciones separadas.** Se guardan país de residencia/constitución del titular, residencia fiscal, país de la cuenta de pago y país/ubicación de cada producto. Un proveedor mixto puede tener productos en lugares distintos; la regla del producto usa su ubicación, mientras identidad y fiscalidad usan el titular/beneficiario. Si hay varias jurisdicciones relevantes, el evaluador compone requisitos en lugar de escoger una arbitrariamente.
4. **Actividad por producto.** `hotel`, `tour` y, después de su lanzamiento, `whole_home` son actividades independientes. Tours puede incluir subactividad regulada o riesgo de operación (p. ej., transporte, guía, actividad de aventura) como dato declarativo verificado. No se inventa una exigencia de licencia universal por la sola etiqueta `tour`.

### 2.2 Regla por capacidad, evidencia y revisión

5. **Cuatro capacidades independientes:** `publish`, `booking`, `collect_payment` y `payout`; `integrations` conserva su puerta adicional. Una reserva no equivale a autorización para cobrar por Fastt ni a payout habilitado. El modelo de cobro (`property_collect` o `platform_collect`) se registra y participa en la evaluación.
6. **Núcleo conservador hasta publicar anexos.** Los controles actuales siguen vigentes. La nueva declaración puede guardarse en borrador, pero no cambia exigencias documentales por sí sola. Una combinación sin anexo aprobado devuelve `policy_context_unsupported`: el negocio puede preparar producto y aportar información, pero no obtiene nuevas capacidades por fallback. Los productos ya publicados usan el contrato vigente mientras se migra con evaluación explícita y trazabilidad; ninguna migración concede permisos automáticamente.
7. **Evidencia por requisito, no un único listado global.** La política define `requirementKey`, titular al que corresponde, evidencia aceptada (documento o dato fiscal ya verificado), obligatoriedad, fase/capacidad, caducidad y reuso. Por ejemplo, la identificación de la persona representante y el registro de la entidad son requisitos distintos. El `tax_document` puede satisfacerse con el NIT/TIN verificado que Fastt ya registra, sólo cuando el anexo lo permita.
8. **Estados claros:** `missing`, `submitted`, `in_review`, `verified`, `changes_requested`, `rejected`, `expired`, `not_applicable`. `Not applicable` se deriva de la política versionada del servidor, nunca de un toggle del proveedor o de la UI. Rechazo y corrección conservan historial y motivo. Excepciones requieren actor autorizado, razón, ámbito, fecha de expiración y auditoría; nunca son silenciosas.
9. **Reglas de pago distintas.** Verificación del beneficiario y cuenta de pago se exigen para payout. La capacidad de cobrar depende del modelo de cobro, procesador, contrato y evidencia de la jurisdicción aprobada. La falta de datos fiscales puede bloquear payout o activar tratamiento autorizado, pero Fastt no inventa retenciones ni porcentajes. Cualquier retención requiere anexo legal/operativo y cálculo probado.
10. **Cambios de contexto reevalúan.** Cambio de titular, país, actividad, beneficiario o modelo de cobro invalida sólo las comprobaciones afectadas, registra versión anterior/nueva y vuelve a evaluar publicación, reservas y pagos. Las reservas ya confirmadas mantienen su snapshot contractual y pasan a revisión operativa si una nueva política crea un conflicto.

### 2.3 Forma de la matriz v1

| Dimensión | Valor / ejemplo | Fuente de verdad | Efecto |
| --- | --- | --- | --- |
| Titular | Persona, entidad | Declaración del proveedor verificada | Selecciona identidad y representante/registro aplicable. |
| País del titular | ISO 3166-1 alpha-2 | Perfil del titular | Selecciona KYC y posibles datos fiscales. |
| País del producto | ISO 3166-1 alpha-2 + región/localidad cuando proceda | Ubicación canónica del producto | Selecciona permiso de actividad y divulgación de número de registro. |
| Actividad | Hotel, tour, vivienda completa | `Product.productType` y subtipo | Selecciona licencias y documentación de la oferta. |
| Cobro | Propiedad o plataforma; beneficiario | Contrato y cuenta de pago | Selecciona `collect_payment`/`payout`. |
| Versión | Política publicada con vigencia | `CompliancePolicyVersion` | Permite reproducir cualquier decisión histórica. |

El anexo de cada combinación debe especificar: requisito, evidencias aceptables y emisor, obligación por capacidad, estado que satisface, responsable de revisión, plazo, vigencia, tratamiento ante ausencia/rechazo, texto para usuario y referencia normativa/contractual. En caso de conflicto, gana la regla más restrictiva para la capacidad afectada; el evaluador enumera ambas causas y su origen. No se usa un wildcard jurídico de país. La v1 se publica sólo para países/actividades que Fastt haya validado.

**Plantilla de filas de la primera matriz (propuesta funcional; valores normativos a ratificar):**

| Titular / actividad | Evidencia propuesta | Puerta funcional | Revisión |
| --- | --- | --- | --- |
| Persona / hotel o tour | Identidad gubernamental de la persona y nombre legal concordante. | Publicar y reservar sólo tras revisión de identidad según anexo. | Verificación; discrepancia pide corrección. |
| Entidad / hotel o tour | Registro y nombre de la entidad; identidad del representante cuando el anexo lo exija. | Publicar y reservar sólo tras revisión de la entidad y representante según anexo. | Verificación; beneficiario distinto abre revisión. |
| Cualquier titular / cualquier actividad | Identificador fiscal o constancia que el anexo acepte; residencia fiscal y beneficiario. | Payout según modelo de cobro aprobado. | Fiscalidad y pagos; retenciones únicamente con regla autorizada. |
| Hotel / ubicación del producto | Registro o permiso de alojamiento si la localidad lo exige; número público sólo donde deba divulgarse. | Publicación del producto, sin alterar otros productos del mismo proveedor. | Revisión de producto/localidad. |
| Tour / subactividad | Licencia, seguro o autorización sólo si el anexo de esa subactividad y ubicación lo exige. | Publicación/reserva de esa salida o producto. | Operaciones y políticas de actividad. |
| Vivienda completa / ubicación | Exclusividad declarada y registro local cuando aplique. | Publicación de esa vivienda. | Revisión de inmueble y licencia local. |

La tabla decide *qué se evalúa y a qué capacidad afecta*. No afirma que una norma concreta de Bolivia o de otro país requiera esos documentos: cada `required=true`, evidencia admisible y consecuencia legal deben venir del anexo aprobado. Esto evita que “persona” se vuelva un atajo automático frente al registro comercial global actual.

**Decisión de implementación inicial:** extender el `CompliancePolicySet`/`CompliancePolicyVersion` que ya existe para casework, no abrir un sistema de políticas paralelo. Las filas actuales son semilla de Bolivia/alojamiento para gestión de casos; no son por sí solas una aprobación de aplicabilidad persona/entidad ni de nuevos permisos comerciales. Se añaden dimensiones y reglas comerciales explícitas en una migración aditiva y versionada.

## 3. Vivienda completa: decisión de alcance y contrato

**Decisión:** vivienda completa entra en la hoja de ruta de Fase 4 como iniciativa de dominio propia y se lanza sólo cuando la vertical completa esté certificada. El primer tramo admite una vivienda físicamente única por anuncio, con exclusividad total para el grupo reservado; dormitorios y camas son detalles descriptivos, no inventario vendible. Esta decisión usa la distinción entre “entire place” y “room” de Airbnb y el calendario por propiedad de Vrbo. Fuentes: [Airbnb: tipo de espacio](https://www.airbnb.com/help/article/317), [Expedia/Vrbo: calendario, tarifas y reservas](https://partner.expediagroup.com/en-us/resources/blog/vacation-rental-calendar-management-guide).

| Tema | Contrato del primer tramo |
| --- | --- |
| Producto | `rental`/`whole_home` con ubicación, anfitrión/titular, uso exclusivo, reglas, fotos, servicios, capacidad y condiciones. No se publica con un `hotel_room` disfrazado. |
| Unidad vendible | Una variante `whole_home` por inmueble físico; `defaultTotalUnits=1`. Si hay varias viviendas iguales, se crean anuncios/unidades físicos separados. |
| Dormitorios | Cantidad, camas y baños descriptivos. No generan tarifa, hold ni disponibilidad. Venta simultánea por habitación/cama del mismo inmueble queda fuera del primer tramo. |
| Inventario | Una noche se ocupa íntegramente por reserva o hold. El calendario debe aceptar bloqueo de propietario y calendario externo; el mismo inmueble usa un `InventoryResource` físico estable para evitar duplicados entre canales/listings. |
| Precio | Precio nocturno base/por fecha, ocupación admitida, cargos como limpieza/mascotas/huésped extra y tributos aplicables; búsqueda y cotización muestran desglose y total antes de hold. Depósito sólo cuando existe contrato de cobro y devolución explícito. |
| Condiciones | Estancia mínima/máxima, anticipación, check-in/out, reglas de casa, cancelación y no presentación. Snapshot de la política al reservar. |
| Reserva | Hold de la vivienda entera para cada noche; confirmación atómica y idempotente; una segunda reserva superpuesta debe fallar. Cancelación libera noches según estado y aplica la política snapshot, sin cambiar el precio histórico. |
| Migración | Sin conversión automática de hotel a vivienda. Se ofrecen nuevas altas. Si un operador necesita convertir un anuncio existente, se hace herramienta separada con revisión de reservas futuras, calendarios y recursos físicos. |

El contrato de exclusividad exige declarar que el huésped no comparte espacios internos con otros viajeros/anfitrión. Presencia del anfitrión en el terreno, pero fuera de la vivienda, se divulga claramente. “Habitación privada”, “cama compartida” y venta combinada vivienda+habitaciones requieren contratos de inventario nuevos; no son opciones de etiqueta.

## 4. Diseño técnico en Fastt

### Política adaptativa

1. **Migración aditiva.** Añadir `ProviderHolderProfile` (declaración y revisión), actividad/contexto por producto, enlace a beneficiario y cuenta de pago, y dimensión de titular/actividad/capacidad a la política. Guardar `effectiveFrom`, versión, autor de aprobación, fuente y snapshot de evaluación. Índices únicos evitan dos políticas publicadas solapadas para la misma combinación.
2. **Evaluador puro y repositorio.** Resolver contexto → seleccionar versiones publicadas vigentes → componer requisitos → comprobar evidencia → emitir diagnóstico por capacidad con `blockerId`, acción y versión. Falta de política = estado explícito no soportado. Cache sólo para lecturas y se invalida al cambiar perfil, documentos, versión o producto.
3. **Unión con gobernanza.** `evaluateProviderGovernance` usa el diagnóstico; `assertProviderCapability` reevalúa en servidor en publicar, hold/reserva, cobrar/payout e integraciones. El frontend lee la misma respuesta. La evaluación usa ubicación del producto, por lo que una cuenta mixta puede publicar un producto y tener otro bloqueado.
4. **Interfaz.** Inicio: tipo de titular y nombre legal; Settings: residencia, fiscalidad, beneficiario y evidencia aplicable; producto: país, actividad y permiso del anuncio; preview: lista de causas y acciones antes de publicar. Cambios de declaración abren revisión; el usuario ve qué capacidad está afectada.
5. **Transición.** Flag por cohorte sólo después de migración y shadow evaluation. Comparar diagnósticos antiguos/nuevos; revisar diferencias con políticas; pilotar con cuentas nuevas, después existentes, sin relajar autorización. Reversión vuelve a evaluador anterior sin borrar perfiles ni versiones.

### Vivienda completa

1. **Agregado y APIs.** Añadir `Rental`/`WholeHomeProfile`, variante `whole_home`, relación física `InventoryResource`, capacidad y configuración de unidad 1. Añadir validaciones para impedir `hotel_room` y `whole_home` simultáneos sobre el mismo recurso.
2. **Preparación guiada.** Nueva elección “Vivienda completa” lleva a identidad, exclusividad, dormitorios descriptivos, ubicación, fotos, capacidad, precio/cargos, calendario, reglas y preview. El sidebar inicial conserva el shell guiado; el operativo muestra Mis viviendas, Calendario, Precios, Reservas y Reglas.
3. **Cotización y checkout.** Reutilizar núcleo de precios/inventario donde el contrato coincida, pero publicar adaptadores de vivienda para total con cargos, recursos físicos, exclusividad y cancelación. Una tarifa hotelera no sirve como tipo de unidad.
4. **Superficies públicas.** Búsqueda de alojamientos puede mezclar hotel/vivienda sólo después de tener discriminador claro, precio total comparable y filtros por espacio completo. Detalle público muestra privacidad, capacidad, camas/baños, reglas, cargos y calendario.
5. **Certificación.** Crear vivienda de una unidad; buscar fechas futuras; cotizar desglose; hold; confirmar; comprobar que fechas se cierran en todos los canales; cancelar; comprobar liberación correcta y snapshot financiero. Probar simultaneidad de dos holds, calendario externo, noche bloqueada, cargos y retroceso/navegación móvil.

## 5. Puertas de salida y responsables

| Puerta | Entregable verificable | Responsable |
| --- | --- | --- |
| P4-A | Anexo v1 de país/titular/actividad/cobro con fuentes, evidencias y firma; definir quién recauda y a quién se paga. | Políticas del proveedor + finanzas/legal; producto registra el contrato. |
| P4-B | Esquema y evaluador en shadow; mismo diagnóstico en servidor, UI y auditoría para cada fixture. | Backend + QA. |
| P4-C | Revisión/corrección documental y transición de casos existentes, sin permisos concedidos por fallback. | Producto/diseño + operaciones + backend. |
| P4-D | ADR de vivienda con recurso físico, exclusividad y cargos; contrato aceptado en interfaces. | Producto + arquitectura + operaciones. |
| P4-E | Vivienda crea inventario, cotiza, se reserva, cancela y se muestra coherentemente; prueba integrada contra Fastt Backup. | Ingeniería + QA + diseño. |

**Intervención humana mínima que falta:** políticas/finanzas deben ratificar los anexos aplicables y el modelo de cobro por país; no se puede extraer esa autorización de Airbnb o Expedia. El contrato de vivienda y su inclusión en hoja de ruta ya están decididos aquí; su prioridad de lanzamiento puede ajustarse sin alterar el modelo.
