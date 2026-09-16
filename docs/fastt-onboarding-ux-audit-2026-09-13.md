# Fastt: auditoría y estrategia del recorrido inicial del proveedor

**Fecha:** 13 de septiembre de 2026  
**Alcance:** registro, primera configuración, creación de tours y alojamientos, verificación, publicación, navegación y transición a la operación.  
**Entregable:** diagnóstico y propuesta de producto con plan de implementación. Las pantallas y rutas nuevas descritas aquí son propuestas, no funcionalidades implementadas.

## 1. Decisión principal

Fastt debe recibir a una persona que quiere ofrecer un servicio con un recorrido orientado a **preparar su primera oferta**, y reservar la interfaz administrativa para cuando tenga algo que administrar.

La primera pantalla debería decir **“¿Qué quieres ofrecer en Fastt?”**, con opciones de alojamiento y tour, ejemplos y una explicación breve de lo que viene después. No debería comenzar con “Perfil del proveedor”, un aviso de bloqueo y enlaces a tarifas, fiscalidad e integraciones.

La recomendación es usar tres interfaces complementarias:

1. **Bienvenida y configuración inicial:** sin sidebar operativo; una decisión principal por pantalla.
2. **Preparación del primer servicio:** navegación de pasos propia del recorrido, guardado y salida segura, vista previa y requisitos visibles.
3. **Operación:** sidebar estable, adaptado al tipo de servicio, al contexto seleccionado y a los permisos del usuario.

El resultado buscado es que el usuario siempre pueda responder: **qué estoy creando, qué quedó guardado, qué falta, por qué falta y cuál es mi siguiente acción**.

El éxito del onboarding no debe medirse por haber guardado una razón social. Debe medirse por conseguir una primera oferta realmente reservable, sin perder el trabajo ni descubrir requisitos importantes al final.

## 2. Método y límites de la revisión

Se revisaron el contenido de la pantalla aportada por el usuario, las rutas y componentes del repositorio, los recorridos guiados de alojamiento y tours, las validaciones de publicación, la habilitación del proveedor y documentación pública oficial de Airbnb y Expedia Group.

**Confirmado en código** significa que el comportamiento aparece en la implementación inspeccionada. No equivale a haber completado ese recorrido con una cuenta real. **Observado por el usuario** corresponde a la pantalla transcrita. **Propuesta** es una decisión recomendada que aún debe implementarse y validarse.

La inspección visual mediante Brave no pudo completarse porque faltaban permisos de control del equipo. No se utilizaron Chrome ni automatización de Chrome. No se crearon cuentas, proveedores, productos, reservas ni documentos de verificación durante esta auditoría. No se inspeccionaron datos privados de la cuenta. Tampoco se ejecutaron pruebas que escriban en la base de datos.

Por eso este reporte no certifica contraste visual, comportamiento móvil, tiempos reales de carga ni el recorrido autenticado completo. Sí permite identificar problemas concretos de flujo y contratos entre interfaz y servidor. La validación visual y funcional está incluida en el plan de acción.

Las referencias competitivas documentan recorridos públicos; no son una reproducción de sesiones autenticadas de Airbnb o Expedia. Sus formularios y requisitos pueden variar por país, tipo de anfitrión y actividad. Sus exigencias no se adoptan como obligaciones legales de Fastt.

## 3. Cómo funciona hoy Fastt

### 3.1. Desde el registro hasta el proveedor

El recorrido predeterminado encontrado es:

```text
Registro / inicio de sesión
  → confirmación de correo cuando corresponda
  → /dashboard, salvo un returnTo específico
  → si la cuenta no tiene proveedor: /provider/settings/profile
  → nombre comercial + razón social
  → guardar identidad
  → vuelve al mismo perfil con confirmación
  → se abre el perfil operativo y se ofrece ir a verificación
```

Esto explica el comportamiento reportado: `/dashboard` redirige al perfil cuando no existe proveedor. Además, `/product/create` hace la misma redirección. La elección del tipo de servicio existe, pero no es accesible como primer paso de creación para una cuenta sin proveedor.

La página de perfil combina una tarea inicial con una superficie de mantenimiento: título administrativo, dos accesos a “Resumen” según la composición de acciones y subnavegación, pestaña Equipo, un aviso de prerrequisito, formulario de identidad y otro bloque que anuncia que la operación está bloqueada.

El problema no es que se necesiten datos del negocio. Es que se solicitan sin haber establecido la intención, sin distinguir persona y empresa, y sin mostrar un resultado próximo que justifique el esfuerzo.

### 3.2. Desde el proveedor hasta el primer servicio

Fastt ya contiene piezas importantes:

| Capacidad existente                   | Evidencia                                          | Qué conviene conservar                                         |
| ------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Estado vacío del dashboard            | “Añade tu primer servicio” y enlace a creación     | La invitación a crear; debe aparecer antes y tener continuidad |
| Selector de tipo de servicio          | `/product/create` pregunta “¿Qué quieres ofrecer?” | La clasificación explícita por intención                       |
| Registro de verticales                | `productVerticalRegistry.ts`                       | Etiquetas, rutas y requisitos centralizados                    |
| Recorrido de alojamiento              | `launch-accommodation.ts`                          | Secuencia y vínculos al catálogo, habitaciones y venta         |
| Recorrido de tours                    | `launch-tour.ts`                                   | Semántica propia de participantes, salidas y cupos             |
| Progreso y recuperación de pendientes | Evaluadores de playbook y preparación              | Derivar avance desde datos reales                              |
| Borradores de formularios             | `playbookFormDraft.ts` utiliza `sessionStorage`    | Protección local complementaria mientras se edita              |
| Vista previa y requisitos de producto | `evaluate-complete-to-publish-progress.ts`         | Validación antes de publicar                                   |
| Habilitación del proveedor            | `provider-governance.ts`                           | Separación de publicar, reservas, pagos e integraciones        |
| Invitaciones y roles                  | Flujo de invitación y permisos del proveedor       | No obligar a miembros invitados a crear otro negocio           |
| Telemetría de configuración           | `provider-settings-funnel.ts`                      | Extenderla hacia activación, sin duplicar instrumentación      |

No hace falta construir un segundo catálogo ni sustituir todo el backoffice. Hace falta una capa coherente que conecte esas capacidades desde la primera sesión.

### 3.3. Secuencias actuales de creación

**Alojamiento hotelero:** crear → descripción → ubicación → fotos → detalles → primera habitación → primera tarifa → condiciones → disponibilidad → reglas para huéspedes → vista previa/publicar.

**Tour:** crear → descripción → punto de encuentro → fotos → itinerario y detalles → modalidades → primera salida → precio → condiciones y preguntas → disponibilidad → vista previa/publicar.

Ambas definiciones tienen once pasos para estos casos. La existencia de once pantallas no es por sí sola un defecto: el problema es cuánto debe entender el usuario en cada una, si repite datos, si conserva contexto y si puede retomar. Hoy ambas usan `PlaybookLayout`, que a su vez utiliza `WorkspaceLayout`; por tanto el recorrido guiado sigue rodeado por la navegación operativa.

### 3.4. Cómo se construye hoy el sidebar

El menú se deriva de `enterpriseNavigation`, el modo de divulgación y los tipos de productos existentes. Tours y Alojamiento aparecen cuando el proveedor ya tiene productos de esos tipos. El modo básico oculta determinadas herramientas avanzadas, pero no representa explícitamente una cuenta sin proveedor o un negocio aún en configuración.

Esto produce una asimetría: **se oculta el objeto que el usuario necesita crear y se conservan herramientas que dependen de ese objeto**, como tarifas, calendario, reservas o finanzas.

Hay una discrepancia que debe verificarse en ejecución: el código actual contiene “Inicio → Resumen”, mientras que la transcripción aportada no lo incluye. No atribuyo esa ausencia a una causa específica sin inspeccionar el render autenticado. Sí está confirmado el filtrado de servicios por productos existentes y la falta de un estado inicial específico en ese filtro.

## 4. Qué aprender de Airbnb y Expedia

### 4.1. Airbnb: distinguir cuenta, anuncio y activación

Airbnb documenta la creación del anuncio como una tarea propia del anfitrión. Su ayuda explica que un alojamiento puede quedar pendiente hasta completar la verificación de identidad antes de activarse para reservas. Es una referencia útil para separar “terminé de preparar mi anuncio” de “ya puedo recibir reservas”. [Fuente oficial: crear un anuncio](https://www.airbnb.com/help/article/1336).

Para experiencias, Airbnb documenta la elección del tipo de experiencia, la preparación del anuncio, el envío a revisión y posibles solicitudes de cambios. También distingue la revisión de calidad de la verificación de identidad y de los documentos que pueden exigirse según la actividad o ubicación. Fastt debe tomar la claridad de esas etapas, sin asumir que cada tour necesita el mismo proceso editorial. [Fuente oficial: registrarse para ofrecer una experiencia](https://www.airbnb.com/help/article/3888).

Su guía para anfitriones profesionales separa perfil del negocio, información requerida, cobros, anuncios y conexión opcional de software. La lección es ofrecer profundidad según el caso; una integración no tiene por qué ser una tarea inicial universal. [Fuente oficial: guía de inicio profesional](https://www.airbnb.com/resources/hosting-homes/a/your-professional-hosting-quick-start-checklist-210).

### 4.2. Expedia: partir del alojamiento y preparar inventario vendible

Expedia explica que el alta hotelera comienza con dirección, tipo de propiedad, cantidad de espacios reservables y contacto. Luego contempla verificación de cuenta y condiciones comerciales, y prepara habitaciones, servicios, precios, fotos, políticas y fechas disponibles. También indica que los datos se guardan automáticamente para retomar. La lección para Fastt es que inventario, precio y disponibilidad forman parte de preparar una oferta comercial completa. [Fuente oficial: alta de hoteles](https://partner.expediagroup.com/en-us/industries/hotels).

Expedia Group presenta una vía diferenciada para alquiler vacacional a través de Vrbo. Para Fastt esto refuerza una distinción de producto: una vivienda completa no debe obligar al propietario a entender un modelo hotelero de tipos de habitación y unidades. [Fuente oficial: alquileres vacacionales](https://partner.expediagroup.com/en-us/industries/vacation-rentals).

La página pública de actividades de Expedia muestra una solicitud comercial que revisa su equipo, con información del negocio, lugares y tipo de actividades. No demuestra un wizard autoservicio equivalente al hotelero. Por tanto, no conviene afirmar que Expedia resuelve hoteles y tours con un mismo recorrido ni copiar su formulario comercial como experiencia inicial de Fastt. [Fuente oficial: alta de actividades](https://partner.expediagroup.com/en-us/join-us/activities).

### 4.3. Aplicación recomendada en Fastt

| Patrón                             | Decisión para Fastt                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| Entrada por intención              | Preguntar qué ofrecer antes de mostrar configuración administrativa                 |
| Separación entre cuenta y anuncio  | Una cuenta accede a uno o más negocios; cada negocio administra ofertas             |
| Preparación progresiva             | Agrupar tareas en etapas comprensibles, conservando subpasos específicos            |
| Borrador y continuidad             | Guardado persistente y reanudación por cuenta, negocio y oferta                     |
| Publicación distinta de activación | Mostrar exactamente qué está completo y qué capacidad sigue bloqueada               |
| Vías por tipo de inventario        | Tour, hotel y vivienda completa necesitan vocabulario y unidades de venta distintos |
| Herramientas profesionales         | Mostrar importación o conexión cuando el usuario declara que ya usa un sistema      |

Estas son recomendaciones de diseño derivadas de la comparación; no son afirmaciones de que las interfaces competidoras utilicen exactamente los layouts propuestos aquí.

## 5. Gaps de Fastt y prioridad

Las prioridades indican orden de intervención. **P0:** interrumpe la activación o da una señal engañosa sobre ella. **P1:** fricción o incoherencia importante. **P2:** profundidad, escala y optimización. No son una clasificación de incidentes de producción.

| ID  | Gap y evidencia                                                                                                          | Consecuencia                                                                          | Acción                                                                           | Prioridad        |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------- |
| G01 | Cuenta sin proveedor redirigida desde dashboard y creación a Settings/Profile                                            | El primer contacto es administrativo y no pregunta intención                          | Crear un punto de entrada de onboarding y resolver destino por contexto          | P0               |
| G02 | Filtro del menú basado en productos existentes; no tiene etapa de onboarding                                             | Desaparecen los servicios mientras permanecen herramientas dependientes               | Añadir estado de ciclo de vida y un shell inicial propio                         | P0               |
| G03 | Guardar identidad vuelve al perfil y prioriza verificación                                                               | Falta un siguiente paso inequívoco hacia la primera oferta                            | “Guardar y continuar” con destino contextual                                     | P0               |
| G04 | La preparación de producto y la habilitación del proveedor se evalúan por separado                                       | La ficha puede estar lista y publicar terminar bloqueado por cuenta                   | Agregar un resumen común de activación que consuma ambas evaluaciones            | P0               |
| G05 | `supportEmail` opcional en formulario/esquema; `operationsComplete` lo exige                                             | Se puede guardar correctamente y seguir incompleto sin explicación suficiente         | Definir contacto efectivo o exigirlo explícitamente; coherencia de UI y servidor | P0               |
| G06 | Datos operativos colapsados; selector limitado a tres zonas y tres monedas                                               | Defaults o valores existentes pueden no corresponder al negocio                       | Pedir confirmación contextual y ofrecer catálogo válido del mercado soportado    | P1               |
| G07 | Razón social exigida sin preguntar persona/empresa                                                                       | Un operador individual puede no saber qué responder                                   | Capturar tipo de titular y adaptar campos y requisitos                           | P1               |
| G08 | Set KYC básico fijo en `requiredKycDocumentTypes`                                                                        | No modela por sí solo diferencias entre persona, empresa, país y actividad            | Matriz de aplicabilidad versionada, con política definida por responsables       | P1               |
| G09 | Wizard dentro del shell operativo                                                                                        | Distracción y cambios de contexto durante una tarea inicial                           | Shell de preparación con navegación de pasos                                     | P1               |
| G10 | Existencia de borrador local en `sessionStorage`, sin evidencia de sesión inicial persistente integral                   | La protección local no garantiza continuidad entre dispositivos                       | Sesión persistente y reanudación derivada de datos guardados                     | P1               |
| G11 | Errores HTML de identidad redirigen con código genérico                                                                  | Se pierde precisión de campos y no se rehidrata el intento rechazado                  | Mensajes junto al campo y preservación del borrador no sensible                  | P1               |
| G12 | Persisten textos/rutas de habitaciones en cards del dashboard y mensaje “Alojamiento publicado” en la vista previa común | Un operador de tours encuentra vocabulario o destinos de hotel                        | Resolver copy y navegación por vertical en todas las superficies                 | P1               |
| G13 | `rental` figura como `planned`; hotel usa `hotel_room`                                                                   | No se puede prometer vivienda completa como capacidad ya disponible                   | Delimitar MVP hotelero y desarrollar el modelo de vivienda antes de ofrecerlo    | P1 / alcance     |
| G14 | Telemetría centrada en configuración y bloqueos                                                                          | No demuestra conversión desde registro hasta primera oferta reservable                | Instrumentar funnel de activación con cohortes                                   | P1               |
| G15 | Callback y creación exponen lenguaje como Supabase, discovery, tokens o respuestas técnicas                              | El usuario recibe detalles de implementación en lugar de instrucciones                | Copy de producto y diagnóstico técnico fuera del mensaje principal               | P1               |
| G16 | La función de registro hace comprobación previa, inserción de proveedor y enlace en operaciones separadas                | Existe un riesgo a verificar de altas parciales o duplicadas ante concurrencia/fallos | Transacción, identidad autenticada estable y pruebas de repetición/concurrencia  | P1 técnico       |
| G17 | Progreso de verificación usa una anchura visual que puede superar el porcentaje anunciado por ARIA                       | Diferencia entre progreso percibido y anunciado                                       | Distinguir posición del paso y requisitos completados, con valores coherentes    | P1 accesibilidad |

**Precisión sobre G04:** `loadCompleteToPublishState` calcula requisitos de producto; `/api/product/publish` además ejecuta `assertProviderCapability(..., "publish")`. El cliente de vista previa maneja errores de validación de producto, pero para el bloqueo de proveedor puede acabar mostrando `provider_configuration_blocked` sin convertir sus detalles en acciones. Es un problema de integración de estados, no evidencia de que se pueda saltar la validación del servidor.

**Precisión sobre G12:** el dashboard contiene algunas bifurcaciones correctas para tours, como “Abrir salidas”. Sin embargo, el bloque “Habitaciones recientes” y su enlace a detalle de habitación se construyen sobre las variantes sin esa misma distinción. Debe verificarse con un tour real; no hay que rehacer lo que ya está correctamente especializado.

**Precisión sobre G16:** el repositorio intenta idempotencia mediante el vínculo usuario-proveedor. Eso es una base existente, pero la lectura del método no demuestra atomicidad del alta completa. No se afirma que haya ocurrido una duplicación en la cuenta del usuario.

## 6. Modelo de producto que debe entender la interfaz

### 6.1. Separar cuatro conceptos

| Concepto              | Qué representa                                | Ejemplo                                                | Dónde se edita                                    |
| --------------------- | --------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| Cuenta personal       | Persona que inicia sesión                     | Ana, propietaria o miembro del equipo                  | Menú de cuenta                                    |
| Negocio/proveedor     | Organización o titular que opera y cobra      | Andina Experiencias                                    | Configuración del negocio                         |
| Oferta/anuncio        | Servicio que ve el viajero                    | Tour gastronómico o Hotel Mirador                      | Mis tours / Mis alojamientos                      |
| Inventario reservable | Unidad con capacidad, precio y disponibilidad | Salida del sábado; habitación doble; vivienda completa | Salidas / Habitaciones / Calendario según el caso |

“Perfil de tours” debería desambiguarse: puede ser la presentación pública del operador o la ficha de un tour. No debe existir una única página que mezcle biografía del negocio, itinerario, cuenta bancaria y cupos.

La marca del negocio tampoco tiene por qué coincidir con el título de cada oferta. Una operadora puede vender cinco tours con nombres distintos, y una empresa puede administrar varios alojamientos.

### 6.2. Tres ejes de estado

No conviene crear un único porcentaje que mezcle identidad, fotografías, cuenta bancaria y reservas.

| Eje                      | Estados de interfaz recomendados                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Preparación de oferta    | Sin iniciar · Borrador · Ficha completa · Cambios pendientes                                  |
| Habilitación del negocio | Datos pendientes · En revisión · Requiere corrección · Habilitado para una capacidad concreta |
| Comercialización         | Sin publicar · Publicado · Reservable · Sin disponibilidad · Pausado                          |

Estos nombres son una propuesta de presentación y agregación. No implican sustituir automáticamente los estados persistidos de Fastt por un solo enum nuevo.

Ejemplo: **“Tu tour está completo. Falta aprobar el registro fiscal del negocio para publicarlo.”** Otro: **“Tu alojamiento está publicado, pero no tiene noches disponibles para reservar.”** Cada mensaje corresponde a una causa distinta y debe llevar a una acción distinta.

### 6.3. No alterar silenciosamente las reglas actuales

La evaluación inspeccionada exige para publicar y aceptar reservas: identidad comercial, operación completa, cuenta aprobada, registro fiscal verificado y equipo válido, además de permisos aplicables. Los documentos mínimos y una cuenta de cobro verificada tienen un papel específico en pagos; las integraciones tienen sus propios requisitos.

Por tanto, mejorar el onboarding no significa quitar controles del servidor ni exigir indiscriminadamente una cuenta bancaria antes de permitir redactar un tour. El momento de pedir datos puede mejorar sin cambiar qué capacidades están bloqueadas.

Si Fastt quiere permitir preparar ofertas sin razón social definitiva, debe permitir explícitamente un borrador de negocio y ajustar el contrato de creación. Hoy el esquema de identidad exige ambos nombres. No es correcto ocultar el campo obligatorio, rellenarlo con datos inventados o eliminar una validación sólo en frontend.

## 7. Recorrido inicial propuesto

### 7.1. Resolver la intención antes de redirigir

| Contexto de entrada                                        | Destino recomendado                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Persona que se registra para reservar o consultar un viaje | Retorno al contexto de viajero                                                         |
| Persona que elige “Ofrecer un servicio” y no tiene negocio | Bienvenida de proveedor                                                                |
| Invitado a un negocio existente                            | Aceptar invitación, confirmar negocio y entrar según su rol                            |
| Propietario con borrador inicial                           | Resumen de preparación con “Continuar”                                                 |
| Propietario con servicios operativos                       | Inicio operativo                                                                       |
| Usuario con varios negocios                                | Contexto solicitado o selector explícito si no hay uno inequívoco                      |
| Usuario que abre un enlace a un paso                       | Ese paso si tiene acceso; si falta un prerrequisito, resolverlo conservando el destino |

No toda cuenta nueva debe convertirse en proveedor. Fastt tiene superficies públicas y de viajes; un cambio global del registro debe preservar `returnTo`, invitaciones, recuperación de contraseña y el contexto de viajero.

### 7.2. Pantalla inicial: “¿Qué quieres ofrecer?”

**Composición:** logo Fastt arriba a la izquierda; Ayuda y menú de cuenta arriba a la derecha; cuerpo centrado; título y dos tarjetas grandes; pie con una sola acción de continuación.

**Texto propuesto:**

> Prepara tu primer servicio en Fastt. Puedes avanzar por partes y volver después. Tu oferta se publicará cuando completes los requisitos y confirmes la publicación.

Tarjetas:

- **Alojamiento:** hotel, hostal u otro alojamiento admitido. La selección posterior debe respetar qué modelos ya soporta Fastt.
- **Tour o actividad:** experiencias con participantes, horarios y cupos.

Debajo: “Podrás añadir otros servicios más adelante”. Si el negocio es mixto, preguntar cuál quiere preparar primero, sin crear dos recorridos obligatorios simultáneamente.

Paquetes y traslados están activos en el registro de verticales actual. No deben eliminarse arbitrariamente: pueden mantenerse en una opción secundaria “Otro servicio”, enlazada a sus recorridos existentes, mientras se concentra el rediseño en tours y alojamiento. La decisión de limitar oferta por madurez debe ser explícita.

**Sin sidebar, sin porcentajes de negocio vacío y sin tarjetas de reservas en cero.**

### 7.3. Pantalla: “Cuéntanos sobre tu negocio”

Solicitar país de operación y si ofrece como persona o empresa. Pedir nombre con el que quiere presentarse y contacto de operación. Mostrar al lado de cada dato si será público o de uso interno.

Para persona, explicar qué nombre legal corresponde según la política aplicable. Para empresa, pedir nombre comercial y razón social con un ejemplo breve. Los documentos y números fiscales se solicitan en la sección que explica su finalidad y requisitos.

El primer lanzamiento puede conservar los dos campos hoy obligatorios, pero con contexto y siguiente paso claro. La separación real de razón social diferida requiere un cambio de contrato y se aborda después.

Zona horaria: sugerir desde la ubicación del servicio y pedir confirmación; la zona del dispositivo sólo sirve como pista. Moneda: ofrecer opciones realmente soportadas por precios y pagos, sin deducir automáticamente que moneda del país, moneda de venta y moneda de liquidación son idénticas. Los valores existentes deben seguir representables al editar.

La interfaz actual ofrece America/Santiago, America/New_York y Europe/Madrid, y USD, EUR y CLP. Es insuficiente como selector general para un producto con referencias de operación boliviana; no debe añadirse BOB o cualquier moneda sólo visualmente sin comprobar soporte comercial.

**CTA:** “Guardar y continuar”. Confirmación breve: “Datos del negocio guardados”. Siguiente pantalla: preparación de la oferta elegida. No llevar automáticamente a un resumen administrativo.

### 7.4. Pantalla: “Prepara tu primer tour/alojamiento”

Presentar un mapa de cuatro etapas:

1. Describe tu servicio.
2. Define cómo se reserva.
3. Completa los requisitos del negocio.
4. Revisa y activa tu oferta.

Cada etapa puede contener subpasos; no se promete que todo se complete en cuatro formularios. No mostrar un tiempo de finalización inventado. Si se incorpora una estimación, debe basarse en mediciones por vertical y excluir la espera de revisión externa.

En esta pantalla sí cabe una navegación lateral corta de preparación, con etapas completadas y pendientes. No es el sidebar operativo. Mostrar el borrador elegido y permitir volver a este resumen desde cualquier paso.

La verificación debe anunciarse desde aquí, con documentos aplicables y capacidad que habilita. Puede iniciarse antes o durante la preparación si hay tiempos de revisión, pero la espera no debe impedir seguir editando lo que no depende de una aprobación.

## 8. Cómo debe verse cada pantalla de alojamiento

### 8.1. Separar hotel y vivienda completa

**Hotel/hostal:** alojamiento → tipos de habitación → unidades/cantidad → tarifas → inventario por fecha.

**Vivienda completa:** vivienda → distribución y capacidad → unidad reservable completa → precio por noche → calendario. Los dormitorios describen el espacio y no son necesariamente unidades vendidas por separado.

Fastt tiene el modelo hotelero activo y `rental` planificado. El MVP debe afirmar con claridad qué alojamientos admite. Si se incorpora vivienda completa, primero hay que validar su modelo de inventario, precio, búsqueda, reserva y prevención de venta simultánea incompatible. No basta con renombrar “habitación” como “casa”.

### 8.2. Secuencia y composición

Todas las pantallas comparten encabezado con el nombre del borrador, navegación de etapas, estado de guardado y pie consistente con Anterior, Guardar y salir, y Guardar y continuar.

| Pantalla                    | Contenido y aspecto                                                                                                                                                             | Acción y resultado                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A1. Tipo y nombre           | Tarjetas de tipos admitidos; nombre del alojamiento; destino. Ejemplos claros. Sin mostrar `hotel` ni códigos de lugar como texto principal                                     | Crear borrador, conservar selección y pasar a ubicación               |
| A2. Ubicación               | Dirección desglosada, ciudad/país, pin ajustable e indicaciones. Explicación de qué ubicación ve el público y qué dirección recibe el huésped según política real               | Guardar ubicación validada y confirmar zona horaria                   |
| A3. Espacios y capacidad    | En hotel: “Crea tu primer tipo de habitación”, camas, huéspedes máximos y cuántas unidades de ese tipo existen. En vivienda futura: dormitorios, camas, baños y capacidad total | Crear inventario inicial sin obligar a cargar todo el establecimiento |
| A4. Servicios y descripción | Selección de comodidades agrupadas; descripción breve; accesibilidad como características concretas. Evitar una lista masiva sin búsqueda                                       | Dejar una ficha comprensible para el viajero                          |
| A5. Fotografías             | Galería con portada, orden, eliminación recuperable cuando exista, progreso de carga y errores por foto. Distinguir fotos del alojamiento y de cada tipo de habitación          | Cumplir los mínimos reales y conservar cargas completadas             |
| A6. Precio inicial          | Una tarifa base con moneda y unidad explícita: por noche y por habitación o vivienda. Ocupación incluida, impuestos/cargos y total de ejemplo                                   | Crear la primera tarifa con precio interpretable                      |
| A7. Disponibilidad          | Calendario y rango de fechas, noches abiertas, unidades disponibles, estancia mínima y anticipación donde apliquen. Mostrar explícitamente fechas cerradas                      | Abrir inventario real; precio cargado no equivale a noche disponible  |
| A8. Condiciones             | Cancelación, pago, no presentación y horarios de llegada/salida; reglas de convivencia en un bloque diferenciado. Mostrar resumen legible                                       | Guardar condiciones seleccionadas sin duplicar sus fuentes de datos   |
| A9. Requisitos del negocio  | Checklist por aplicabilidad, reutilizando lo completado. Estado por documento/capacidad y acceso a corregir                                                                     | Completar o enviar requisitos sin repetir datos                       |
| A10. Revisión               | Vista de huésped más panel de preparación, habilitación y disponibilidad. Ejemplo verificable de estancia/precio                                                                | Publicar si corresponde, o resolver el bloqueo concreto               |

Esta secuencia reorganiza las pantallas existentes por modelo mental. No implica introducir diez pantallas nuevas obligatorias: A4 y A5 pueden subdividirse, y A6–A8 deben reutilizar los motores comerciales existentes bajo una presentación inicial más sencilla.

### 8.3. Detalles decisivos del alojamiento

La pregunta “¿Cuántas habitaciones tienes?” es ambigua. Debe distinguir **tipos** y **unidades**: “Doble estándar, 2 huéspedes, 6 unidades”. Una tarifa debe asociarse al inventario correcto. Las habitaciones inactivas o incompletas no deben impedir publicar las unidades que sí cumplen si el contrato comercial de Fastt permite publicación parcial.

En precios, separar importe base, cargos incluidos, cargos adicionales y cobro en el alojamiento cuando esa modalidad exista. El resumen debe venir del mismo cálculo que usa la reserva; no de una calculadora paralela de onboarding. No inventar comisiones o importes netos que el contrato del proveedor no permita obtener.

La opción “Ya utilizo un channel manager” puede abrir una ruta alternativa asistida. Debe explicar qué se puede importar realmente y qué queda bajo control externo. Para un propietario sin sistema, la configuración manual continúa sin penalización.

### 8.4. Página del alojamiento después de publicarlo

Encabezado: nombre, estado comercial, ubicación, selector de alojamiento si hay varios y “Ver anuncio”. Debajo: aviso de acción pendiente sólo si existe.

Secciones locales: Resumen, Ficha y fotos, Habitaciones, Tarifas y disponibilidad, Condiciones. Para vivienda completa, sustituir Habitaciones por Espacios y capacidad, manteniendo claro que no se venden dormitorios por separado.

El resumen prioriza próximas llegadas, noches abiertas y problemas que afectan reservas. Un alojamiento sin reservas debe mostrar “Tu alojamiento está listo para recibir reservas” con revisión de disponibilidad y enlace al anuncio; no una pared de métricas vacías.

## 9. Cómo debe verse cada pantalla de tours

### 9.1. Modelo que debe quedar claro

Un **tour** describe la experiencia; una **salida** especifica cuándo ocurre; un **tipo de participante/ticket** define quién reserva y cómo se cobra; el **cupo** limita la capacidad compartida según el contrato del producto.

Ejemplo: “Caminata al mirador” → sábado, 09:00, español, 12 cupos → adulto y niño. Adulto y niño no deben crear inventarios independientes si consumen el mismo cupo. Tampoco “tour privado” debe presentarse como soportado con precio por grupo si la implementación sólo admite otro contrato.

### 9.2. Secuencia y composición

| Pantalla                        | Contenido y aspecto                                                                                                                                 | Acción y resultado                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| T1. Tipo, nombre y destino      | Categoría entendible y título orientativo. Tipo de actividad y destino. Tarjetas con ejemplos cuando aporten claridad                               | Crear borrador del tour                                        |
| T2. Experiencia e itinerario    | Duración, descripción, paradas/actividades reordenables, inclusiones y exclusiones. Indicar mínimos reales antes de que el usuario termine          | Explicar qué vivirá el participante                            |
| T3. Encuentro y logística       | Pin, punto de encuentro, instrucciones, anticipación de llegada y recogida sólo cuando se soporte. Distinguir destino de búsqueda y lugar de inicio | Evitar direcciones ambiguas                                    |
| T4. Participantes y requisitos  | Tipos de participante, edades, dificultad, idiomas, condiciones de participación y accesibilidad. Requisitos específicos según actividad            | Definir quién puede reservar sin pedir información innecesaria |
| T5. Fotografías                 | Portada y fotos de la experiencia, instrucciones de calidad y número mínimo basado en validación actual. Cargas con estado por archivo              | Preparar la representación pública                             |
| T6. Primera salida y precio     | Fecha futura, hora, zona, idioma, capacidad y precio por tipo de participante. Resumen “sábado, 09:00, 12 cupos, precio por adulto”                 | Crear una primera combinación vendible coherente               |
| T7. Repetición y disponibilidad | Repetir por días/rango cuando se soporte, excepciones, cierre de reservas y vista de salidas resultantes antes de confirmar                         | Evitar crear manualmente cada fecha o duplicar salidas         |
| T8. Condiciones y preguntas     | Cancelación, confirmación, clima/no presentación según capacidad disponible, y preguntas que necesita el operador                                   | Configurar condiciones visibles antes del pago                 |
| T9. Requisitos del operador     | Identidad y fiscalidad reutilizadas; licencias/seguros exigibles según política aplicable, con estado y motivo                                      | Habilitar capacidades sin pedir documentos ajenos al caso      |
| T10. Revisión                   | Vista del viajero con itinerario, encuentro, participantes, próxima salida, precio, condiciones y bloqueos separados                                | Publicar o continuar la corrección indicada                    |

Fastt ya implementa muchas de estas piezas. T6 propone reunir visualmente primera salida y precio, aunque internamente sigan existiendo variantes, tarifas y calendario. El usuario debe completar una tarea comercial; no aprender esas entidades para poder comenzar.

Si alguna función de la propuesta no está soportada —recurrencia, modalidad privada, recogidas o condiciones específicas— se incorpora como trabajo de producto con validación integral. No se debe dibujar un control que prometa una reserva que el backend no puede cumplir.

### 9.3. Página del tour después de publicarlo

Encabezado con nombre, estado y “Ver anuncio”. Secciones locales: Resumen, Ficha e itinerario, Fotos, Participantes y precios, Salidas y cupos, Condiciones.

El resumen debe mostrar próxima salida, participantes confirmados, cupos restantes y acciones operativas. “Operación de hoy” o “Participantes de hoy” comunica mejor que “Cola day-of”. Esta herramienta aparece para tours y roles que la utilicen; no es una entrada general de una cuenta recién creada.

Sin salidas futuras: aviso principal “Añade una salida para volver a recibir reservas”, aunque la ficha siga publicada. Sin reservas: estado tranquilo con fecha/próxima salida y enlace al anuncio. Con requisitos rechazados: motivo y CTA específico, conservando las salidas que puedan seguir operando según las restricciones aplicables.

## 10. Arquitectura del sidebar

### 10.1. Cuándo existe

| Situación                                    | Navegación recomendada                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| Cuenta creada, intención todavía no definida | Sin sidebar; bienvenida y menú de cuenta                                     |
| Identidad mínima del negocio                 | Sin sidebar; Anterior y Guardar y continuar                                  |
| Primer servicio en preparación               | Navegación de etapas, sin secciones operativas ajenas                        |
| Usuario sale del recorrido con un borrador   | Shell reducido: Inicio, borrador/listado de servicios, Configuración y Ayuda |
| Oferta operativa                             | Sidebar estable de la vertical                                               |
| Negocio mixto                                | Selector de contexto y navegación que conserve el alcance seleccionado       |
| Miembro invitado                             | Navegación por permisos y tareas; no wizard de propietario                   |

No conviene llenar el menú inicial con elementos deshabilitados. Lo que aún no es útil se explica en el resumen de preparación. Lo que el usuario no puede usar por permisos se controla en servidor y se comunica apropiadamente si abre una URL directa.

### 10.2. Sidebar operativo de alojamiento

```text
[Nombre del negocio ▾]

Inicio
Mis alojamientos
Calendario
Reservas
Finanzas

Configuración
Ayuda

[Añadir servicio]
```

Dentro de Mis alojamientos se selecciona el alojamiento y aparecen sus secciones locales. Habitaciones no debe quedar simultáneamente como concepto global ambiguo y subpágina local sin indicar qué establecimiento se está editando.

Calendario reúne acceso a precio y disponibilidad con pestañas comprensibles. Las herramientas avanzadas, como múltiples tarifas y operaciones masivas, se muestran según capacidad y experiencia. No es necesario borrar sus rutas actuales para simplificar la entrada.

### 10.3. Sidebar operativo de tours

```text
[Nombre del negocio ▾]

Inicio
Mis tours
Salidas y cupos
Reservas
Operación de hoy
Finanzas

Configuración
Ayuda

[Añadir servicio]
```

Precios simples se editan dentro del tour o la salida. Si el operador maneja tarifas avanzadas, puede acceder a la superficie profesional correspondiente con contexto preservado.

### 10.4. Negocio mixto y múltiples propiedades

Selector: “Todo el negocio / Alojamientos / Tours”. Dentro de Alojamientos, un segundo nivel selecciona la propiedad cuando es necesario. El usuario siempre debe saber si la operación afecta a un tour, una propiedad o todo el negocio.

En “Todo el negocio”, Inicio puede agregar métricas y pendientes, mientras Calendario solicita el ámbito si una vista unificada no está soportada. No se debe presentar una tabla que mezcle noches de alojamiento con cupos de salida sin una semántica diseñada.

La visibilidad se decide por **etapa + verticales existentes o elegidas + permisos + capacidad de la función + contexto actual**. La intención elegida permite mostrar el borrador de Tours antes de que exista un producto persistido; no autoriza funciones inexistentes.

El menú no debe reorganizarse cada vez que llega la primera reserva o cambia una métrica. La transición grande ocurre al pasar de preparación a operación; dentro de operación, orden y ubicación permanecen estables. Una tarea pendiente se indica con un aviso o contador contextual.

### 10.5. Configuración y móvil

Configuración agrupa Datos del negocio, Equipo y permisos, Verificación, Fiscalidad, Cobros e Integraciones. Durante la preparación, sus requisitos se abren desde la checklist y devuelven al punto de origen. En operación profesional, Integraciones puede tener un acceso más visible si se usa con frecuencia.

En móvil, bienvenida y formularios van en una columna con acciones accesibles. Las etapas se resumen en “Etapa 2 de 4 · Cómo se reserva” y un panel desplegable. En operación, usar menú accesible y accesos breves a Inicio, Calendario/Salidas y Reservas si se valida su utilidad. No mantener dos barras fijas que tapen el formulario o el teclado.

## 11. Wireframes de referencia

Son esquemas funcionales de contenido y jerarquía, no capturas de Fastt ni diseños visuales terminados.

### 11.1. Primera sesión

```text
Fastt                                           Ayuda   Mi cuenta

                 ¿Qué quieres ofrecer en Fastt?
          Prepara tu primer servicio y continúa a tu ritmo.

       ┌─────────────────────┐  ┌─────────────────────┐
       │ Alojamiento         │  │ Tour o actividad    │
       │ Hoteles y hostales  │  │ Experiencias con    │
       │ admitidos en Fastt  │  │ horarios y cupos    │
       └─────────────────────┘  └─────────────────────┘

                 Podrás añadir otros servicios después.
                                               [Continuar]
```

### 11.2. Preparación de tour

```text
Fastt · Caminata al mirador                 Guardado   Ayuda

PREPARA TU TOUR                Primera salida y precio
✓ Describe tu servicio        Define cuándo podrán reservar.
● Cómo se reserva
○ Requisitos del negocio      Fecha       Hora       Zona horaria
○ Revisión                    [          ][        ][            ]

                              Cupos totales [12]
                              Adulto        [precio] [moneda]
                              Niño          [precio] [moneda]

                              Sábado · 09:00 · 12 cupos
                              Precio por participante

[Anterior]             [Guardar y salir] [Guardar y continuar]
```

### 11.3. Revisión con bloqueo de cuenta

```text
Revisa tu alojamiento

┌────────────────────────────────┐  ┌─────────────────────────┐
│ Vista previa para huéspedes    │  │ Ficha completa       ✓  │
│ Fotos · descripción · espacios │  │ Disponibilidad lista ✓  │
│ Precio de ejemplo · políticas  │  │ Cuenta: en revisión     │
│                                │  │                         │
│ [Editar sección]               │  │ Falta aprobar tu        │
│                                │  │ registro fiscal.        │
└────────────────────────────────┘  │ [Ver estado]            │
                                    └─────────────────────────┘

Puedes seguir editando tu alojamiento mientras revisamos los datos.
```

No mostrar “Publicar” como acción ejecutable si se conoce un bloqueo que la vuelve imposible. Mostrar el motivo y el próximo paso. Si la revisión no requiere acción del usuario, no pedirle que vuelva a enviar lo mismo.

## 12. Reglas transversales de interacción

### 12.1. Guardado y reanudación

Cada paso tiene un único CTA principal. “Guardar y continuar” debe persistir y avanzar como una operación coherente. Evitar un botón Guardar dentro del formulario y otro Continuar que permita irse sin haber guardado.

Estados visibles: Guardando, Guardado, No se pudo guardar y Conflicto de edición. “Guardar y salir” no puede ser sólo un enlace: debe esperar confirmación de persistencia o explicar que queda trabajo sin guardar.

El servidor conserva datos guardados y referencias del recorrido. Un borrador local puede proteger texto aún no enviado, con alcance por cuenta, negocio y producto, limpieza y caducidad. Documentos de identidad, datos bancarios y secretos no deben copiarse a un mecanismo genérico de almacenamiento local.

Al reabrir, mostrar “Continúa con Fotos” a partir de los datos reales; no confiar únicamente en `?step=images` o en la última página visitada. Si hay varios borradores, permitir elegir. Al editar desde un dispositivo distinto, recuperar lo persistido; no prometer recuperar texto que nunca llegó al servidor.

### 12.2. Errores y validación

Errores junto al campo, resumen accesible cuando hay varios y foco en el primero. Conservar la entrada rechazada que sea apropiado preservar. Evitar mensajes como “validation_error”, “sin ID” o un JSON como explicación principal.

Separar error de red, falta de permisos, sesión expirada, dato inválido y requisito en revisión. Al expirar la sesión, permitir volver al contexto después de autenticarse. No crear otro proveedor por un reintento de guardado.

Si un destino no está disponible en el catálogo, ofrecer una alternativa real de corrección o soporte, sin aceptar una ubicación ficticia. Si el mapa falla, mantener el formulario de dirección utilizable.

### 12.3. Progreso honesto

“Etapa 2 de 4” indica posición. “6 de 9 requisitos completos” indica trabajo validado. Ninguno debe transformarse automáticamente en “puedes vender”.

Un requisito enviado a revisión se presenta como En revisión, no como Aprobado. La verificación puede terminar después de la ficha. Al cambiar una decisión que altera requisitos, explicar el nuevo pendiente y preservar datos compatibles.

### 12.4. Accesibilidad y presentación

Jerarquía con un título principal por pantalla, campos etiquetados y ejemplos cercanos. Navegación por teclado, estado actual de etapa anunciado, errores asociados a campos y guardado anunciado sin interrumpir cada pulsación. No comunicar estado sólo por color.

La paleta oscura actual no es un gap demostrado por la transcripción. Puede mantenerse si los contrastes y componentes son consistentes. La prioridad es reducir densidad y mejorar jerarquía, no cambiar el tema visual por preferencia.

Mantener lectura cómoda del formulario y separar ayudas del contenido requerido. No hacer que un acordeón o un tooltip sea la única manera de descubrir un requisito indispensable.

### 12.5. Finalización y primera reserva

La publicación debe ser una acción explícita. Al terminar, mostrar el estado devuelto por el servidor y un enlace al anuncio cuando exista. Si todavía no es reservable, explicar el requisito concreto. No afirmar que aparece en búsqueda sólo porque el registro cambió a publicado.

La primera reserva es un hito posterior: confirmar que el operador sabe encontrarla, ver participantes/huéspedes, conocer qué hacer y entender el estado del pago. No mantenerlo atrapado en el wizard después de haber activado una oferta.

## 13. Diseño técnico recomendado

### 13.1. Agregar orquestación, conservar fuentes de verdad

Proponer un resolvedor de experiencia inicial que consuma identidad autenticada, membresías, intención, contexto y preparación. Su salida determina destino, shell, siguiente acción y capacidades visibles.

Una sesión persistente de preparación podría guardar: identificador, usuario/negocio, oferta si existe, vertical elegida, versión del recorrido, último paso visitado, estado de pausa y fechas. La completitud se deriva de catálogo y gobernanza; no se duplica en booleanos que puedan quedar obsoletos.

El estado previo a tener proveedor requiere un contenedor autenticado acotado al usuario. Al crear el negocio, debe vincularse de forma transaccional. La creación del proveedor usa la identidad autenticada estable y respeta membresías existentes; el correo puede servir de dato de contacto o compatibilidad, no debe ser una excusa para perder el vínculo.

### 13.2. Contrato de activación agregado

Un resumen de activación propuesto debe devolver:

```text
scope: negocio + producto + usuario/contexto
productPreparation: completo / pendientes y enlaces
providerCapabilities: publicar / reservas / pagos / integraciones
commercialAvailability: hay oferta reservable y motivo si no
permissions: acciones que puede ejecutar este usuario
nextAction: etiqueta + destino + motivo
evaluatedAt / version: referencia para detectar datos desactualizados
```

Debe reutilizar `loadCompleteToPublishState`, la gobernanza del proveedor y las comprobaciones comerciales pertinentes. El endpoint de publicación revalida en servidor aunque el cliente haya recibido un resumen favorable. Si el estado cambia entre revisión y confirmación, devolver errores estructurados y destinos de corrección.

El sidebar consume esa misma experiencia agregada. Su disponibilidad visual no sustituye autorización. Cada endpoint conserva la validación de pertenencia, rol y capacidad.

### 13.3. Rutas propuestas y compatibilidad

| Ruta conceptual propuesta                                | Responsabilidad                                |
| -------------------------------------------------------- | ---------------------------------------------- |
| `/provider/onboarding`                                   | Resolver bienvenida o reanudación              |
| `/provider/onboarding/business`                          | Datos iniciales contextualizados               |
| `/provider/onboarding/overview`                          | Mapa de preparación y borradores               |
| Rutas existentes de producto con contexto de preparación | Editar catálogo sin crear un catálogo paralelo |
| `/provider/settings/*`                                   | Mantenimiento y requisitos del negocio         |
| `/dashboard`                                             | Resumen apropiado a etapa y permisos           |

Las rutas son una propuesta, no destinos disponibles ahora. Antes de adoptar nombres definitivos, ajustar el catálogo de rutas y contratos del repositorio.

Mantener enlaces antiguos y queries de playbook mientras se migra. Una visita a Settings/Profile sin proveedor puede mostrar el shell de inicio o redirigir conservando intención. Una cuenta operativa no debe volver obligatoriamente a onboarding porque aparezca una versión nueva del recorrido.

### 13.4. Matriz de requisitos

Definir requisitos según país, tipo de titular, vertical, actividad y capacidad solicitada. Cada requisito necesita motivo, momento, responsable de revisión, evidencias aceptadas, estado y acción de corrección.

El cambio debe ser aprobado como política de producto/cumplimiento antes de activarse. Este reporte no decide qué documento exige una jurisdicción ni sustituye esa validación. La UI debe consumir la matriz real y no conservar listas divergentes de “documentos obligatorios”.

Reutilizar datos ya verificados cuando el alcance lo permita. Una segunda oferta del mismo negocio no debería pedir de nuevo identidad empresarial sin motivo; una licencia de una actividad o un establecimiento específico no debe heredarse a otro de manera automática.

## 14. Plan de acción

### Fase 0. Acordar contrato y establecer línea base

**Ejecución del 14-09-2026:** [contrato y decisiones](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-0-contract.md), [medición inicial](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-0-baseline.json) y [evaluación de cierre, incluida fase 2](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-0-closeout.md). Contrato contrastado en dominio y certificado contra PostgreSQL aislado: 35 pruebas de la batería declarada aprobaron. Razón social continúa obligatoria en el primer incremento.

**Responsables:** producto, diseño, backend y responsable de políticas del proveedor.

Entregables: mapa de estados; casos soportados de alojamiento; política persona/empresa; requisitos para publicar/reservar/cobrar; estrategia de regreso para viajeros e invitados; escenarios de prueba; medición inicial del funnel si existe volumen suficiente.

**Criterio de salida:** una misma cuenta y producto reciben el mismo diagnóstico de habilitación en el documento de producto y en las reglas del servidor. Decidir expresamente si la razón social sigue siendo obligatoria al crear negocio en el primer incremento.

### Fase 1. Corregir la entrada y los mensajes engañosos

**Ejecución del 14-09-2026:** [cierre y evaluación](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-1-closeout.md). Se incorporó el recorrido reducido para alojamiento/tour, la elección persistida antes de crear negocio, los deep links operativos al onboarding y el diagnóstico conjunto de gobernanza y elegibilidad comercial en vista previa. El recorrido autenticado hotelero quedó certificado contra Fastt Backup.

**Prioridad máxima.** Incorporar bienvenida para intención de proveedor; preservar `returnTo`; crear un shell inicial reducido; conectar identidad con la creación elegida; resolver G04 y G05; traducir errores de bloqueo a acciones.

Aprovechar el selector y los playbooks actuales. En este incremento no es necesario rediseñar todos los formularios ni habilitar vivienda completa.

**Criterios de salida:**

- Cuenta nueva de proveedor identifica la tarea y comienza el servicio elegido sin explorar Settings.
- Guardar identidad lleva al siguiente paso y no crea un bucle administrativo.
- Sin producto no aparecen herramientas operativas irrelevantes como ruta principal.
- Producto completo con proveedor bloqueado muestra la causa antes de intentar publicar.
- Contacto declarado opcional y completitud operativa dejan de contradecirse.
- Viajeros e invitados conservan sus destinos y permisos.

### Fase 2. Unificar preparación y continuidad

**Ejecución del 14-09-2026:** [cierre y evaluación](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-2-closeout.md). El shell guiado ya no usa navegación operativa durante la preparación, los once pasos se agrupan en tres etapas y existe una sesión persistente por usuario, proveedor y playbook para retomar producto, variante y tarifa.

Separar el shell guiado de `WorkspaceLayout`, agrupar los once pasos en etapas, unificar Guardar y continuar, incorporar sesión persistente y preservar contexto de producto/variante/tarifa. Corregir vocabulario y enlaces hoteleros en tours. Añadir tratamiento móvil y accesibilidad.

**Criterio de salida:** completar un borrador de hotel y uno de tour; salir, volver, reautenticarse y retomar sin duplicar entidades ni perder datos persistidos. Validar enlaces profundos y retroceso del navegador.

### Fase 3. Completar los caminos verticales

**Ejecución del 15-09-2026:** [cierre y evidencia comercial](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-3-closeout.md). El sidebar ya usa vocabulario hotelero o de tours según alcance; la salida compartida mantiene un cupo común y la privada se ofrece sólo como cotización. La recurrencia no se promete: cada fecha se abre explícitamente en calendario. Los contratos de búsqueda, hold y confirmación cubren inventario/precio hotelero y salida/cupo de tour. F3-01 quedó certificado contra Fastt Backup y F3-02 se comprobó visualmente en Brave con precio, cupo y condiciones de una salida publicada.

Para hotel: clarificar tipos/unidades, tarifa inicial, inventario y condiciones. Para tours: clarificar participantes, cupo compartido, salida y precio; validar funciones recurrentes y privadas antes de ofrecerlas. Reorganizar el sidebar operativo y los detalles locales.

**Criterio de salida:** primera oferta reservable de cada vertical con una consulta comercial real válida: estancia con precio e inventario para hotel; salida futura con precio y cupo para tour. Validar que la interfaz del viajero refleja lo configurado.

### Fase 4. Requisitos adaptativos y expansión

**Evaluación del 15-09-2026:** [análisis de alcance y fronteras](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-4-assessment.md) y [decisiones basadas en Airbnb y Expedia](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-4-research-decisions-2026-09-15.md). Negocio mixto, herramientas profesionales y corrección documental ya tienen superficies operativas. La matriz adaptativa tiene contrato de producto y arquitectura; faltan anexos jurisdiccionales ratificados y persistencia. Vivienda completa entra en la hoja de ruta con unidad vendible e inventario exclusivos, pero `rental` permanece planeado hasta certificar cotización, reserva y cancelación.

Aplicar matriz por titular/país/actividad; mejorar revisión/corrección; soportar negocio mixto y herramientas profesionales según uso. Desarrollar vivienda completa como iniciativa de dominio si forma parte del alcance aprobado.

**Criterio de salida:** nuevas opciones no se limitan a cambios de etiqueta; crean inventario correcto, se cotizan, se reservan y aplican sus reglas en todos los puntos de entrada.

### Fase 5. Lanzar gradualmente y medir

**Ejecución del 15-09-2026:** [plan y control de rollout](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-5-rollout.md). El onboarding tiene ahora kill switch, etapas de staging/allowlist/porcentaje/general, cohorte estable por usuario y retorno al Perfil legacy sin borrar datos. El control es sólo de experiencia y no modifica autorización ni publicación. No se activaron proveedores reales durante esta ejecución.

Activar para cuentas nuevas mediante flag, validar en entorno de pruebas, pilotar con proveedores reales y ampliar por cohortes. Conservar una vía de retorno al shell anterior sin borrar datos creados. Supervisar errores, abandono, latencia y soporte. No ejecutar experimentos que reduzcan controles de autorización o publicación.

**Estimación orientativa, no compromiso:** fases 0–1, uno o dos ciclos de trabajo; fases 2–3, dos a cuatro ciclos adicionales con un equipo pequeño de producto/diseño e ingeniería. Vivienda completa y nuevas políticas se estiman aparte. Reestimar tras el contrato funcional y la auditoría de persistencia; no hay evidencia suficiente para prometer fechas exactas.

### 14.1. Backlog ejecutable

| Trabajo                              | Archivos/piezas principales                                 | Dependencia                   | Aceptación                                                                |
| ------------------------------------ | ----------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| Resolver entrada por intención y rol | Auth signup/signin/callback, dashboard, invitaciones        | Contrato de destinos          | Casos viajero, propietario e invitado sin redirección incorrecta          |
| Shell inicial                        | WorkspaceLayout, PlaybookLayout, nuevo layout de onboarding | Estado de experiencia         | Sidebar operativo ausente durante bienvenida y preparación inicial        |
| Conectar identidad a oferta          | ProviderRegisterForm, API providers, product/create         | Contexto persistente          | Guardar lleva al tipo elegido y soporta reintento                         |
| Coherencia contacto/operación        | ProviderProfileForm, profile schema, governance             | Decisión de contacto efectivo | Validación, copy y habilitación coinciden                                 |
| Resumen agregado de activación       | Evaluador de producto, governance, preview, publish         | Matriz de estados             | Mismo diagnóstico antes y durante publicación                             |
| Borrador y reanudación               | playbookFormDraft, guardado por paso, sesión de preparación | Modelo de persistencia        | Recuperación entre sesiones/dispositivos de datos guardados               |
| Navegación por etapa y vertical      | backoffice-governance, sidebar, verticalContext             | Contrato del shell            | Matriz de navegación cubierta sin ocultar la vía de creación              |
| Corrección de tours                  | Dashboard y preview compartidos, registro de verticales     | Ninguna relevante             | No muestra rutas de habitación o mensajes de alojamiento en tours         |
| Requisitos por aplicabilidad         | provider-documents, governance, verificación                | Política validada             | Persona/empresa y actividad reciben requisitos correctos                  |
| Medición                             | provider-settings-funnel y eventos de activación            | Definiciones del funnel       | Registro→reservable trazable sin documentos ni datos sensibles en eventos |

## 15. Pruebas y medición

### 15.1. Matriz mínima de aceptación

| Caso                                      | Resultado esperado                                           |
| ----------------------------------------- | ------------------------------------------------------------ |
| Cuenta nueva sin proveedor                | Bienvenida y siguiente paso claros                           |
| Registro con confirmación por correo      | Retoma intención después de confirmar                        |
| Registro desde reserva/viaje              | Conserva contexto de viajero                                 |
| Invitación a negocio existente            | No crea un proveedor adicional                               |
| Negocio sin productos                     | Crear/continuar visible, herramientas operativas secundarias |
| Borrador hotelero y borrador tour         | Vocabulario, campos y destinos propios                       |
| Cierre, sesión expirada, otro dispositivo | Recupera datos persistidos y siguiente pendiente             |
| Fallo de red o doble clic al crear        | No duplica proveedor, producto, variante o salida            |
| Usuario con permisos limitados            | No ejecuta acciones de propietario por URL/API               |
| Producto completo, cuenta pendiente       | Estado claro con acción o espera correcta                    |
| Cuenta habilitada, producto incompleto    | CTA al requisito del producto                                |
| Publicado sin inventario                  | No se presenta como reservable                               |
| Tour con tickets que comparten cupo       | No aumenta capacidad por sumar categorías                    |
| Hotel con varias unidades del mismo tipo  | Cantidad de inventario interpretada correctamente            |
| Proveedor mixto                           | Contexto y navegación no confunden noches con salidas        |
| Móvil y teclado                           | Flujo completado sin controles tapados ni pérdida de foco    |
| Regreso a una cuenta operativa            | No fuerza repetir onboarding                                 |

Reutilizar los tests de lanzamiento, publicación, gobernanza, perfil e invitaciones existentes. Agregar pruebas sobre los contratos nuevos y recorridos que crucen módulos; no basta con verificar que el texto de un botón existe. Las pruebas con navegador deberán usar LibreWolf o Brave, respetando la política del proyecto.

### 15.2. Métricas

| Métrica                   | Definición                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Inicio efectivo           | Porcentaje de altas con intención de proveedor que eligen una vertical                                 |
| Primer borrador           | Porcentaje que guarda su primera oferta, segmentado por vertical                                       |
| Ficha completa            | Porcentaje de borradores que completa requisitos de producto                                           |
| Primera oferta reservable | Porcentaje de altas de proveedor que llega a una oferta habilitada con disponibilidad comercial válida |
| Tiempo de preparación     | Mediana y percentil alto de tiempo activo hasta borrador/ficha completa                                |
| Espera de habilitación    | Tiempo separado en revisión, fuera del esfuerzo de completar formularios                               |
| Recuperación              | Usuarios que retoman y avanzan un borrador después de salir                                            |
| Fricción                  | Fallos de guardado, campos rechazados, bucles y salidas por paso                                       |
| Coherencia de publicación | Intentos rechazados por requisitos que la revisión no había mostrado                                   |
| Primera reserva           | Conversión y tiempo posteriores a activación, interpretados junto a demanda                            |

Eventos propuestos: intención seleccionada, negocio inicial guardado, borrador creado, paso guardado, recorrido retomado, ficha completa, requisito enviado, requisito resuelto, publicación solicitada, publicación bloqueada, oferta reservable y primera reserva. Distinguir eventos de servidor y de interacción; deduplicar reintentos.

Segmentar por vertical, persona/empresa cuando se capture, dispositivo, país soportado, nuevo/existente e invitación. Usar identificadores internos con controles de acceso; no enviar razón social, documentos, cuenta bancaria o respuestas libres a analítica por defecto.

Primero medir línea base. Los objetivos de mejora deben acordarse después; este análisis no demuestra una tasa de abandono actual ni permite atribuir una mejora porcentual al rediseño. Como criterio funcional, sí exigir cero casos conocidos de “listo para publicar” con un bloqueo ya disponible que la UI no muestra.

## 16. Evidencias locales para implementación

Los enlaces siguientes permiten revisar los puntos de entrada y contratos usados en esta auditoría.

| Referencia                  | Archivo                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registro y retorno          | [signup.ts](/Users/ellaggon/Projects/fastt/src/pages/api/auth/signup.ts), [signin.ts](/Users/ellaggon/Projects/fastt/src/pages/api/auth/signin.ts), [callback.astro](/Users/ellaggon/Projects/fastt/src/pages/auth/callback.astro)                                                                                                                                                                                             |
| Dashboard y estado vacío    | [dashboard/index.astro](/Users/ellaggon/Projects/fastt/src/pages/dashboard/index.astro)                                                                                                                                                                                                                                                                                                                                        |
| Perfil inicial reportado    | [profile.astro](/Users/ellaggon/Projects/fastt/src/pages/provider/settings/profile.astro), [ProviderRegisterForm.astro](/Users/ellaggon/Projects/fastt/src/components/provider/ProviderRegisterForm.astro)                                                                                                                                                                                                                     |
| Alta de proveedor           | [API providers](/Users/ellaggon/Projects/fastt/src/pages/api/providers/index.ts), [register-provider-v2.ts](/Users/ellaggon/Projects/fastt/src/modules/catalog/application/use-cases/provider-v2/register-provider-v2.ts), [ProviderV2Repository.ts](/Users/ellaggon/Projects/fastt/src/modules/catalog/infrastructure/repositories/ProviderV2Repository.ts)                                                                   |
| Identidad y operación       | [identity.schema.ts](/Users/ellaggon/Projects/fastt/src/schemas/provider/identity.schema.ts), [profile.schema.ts](/Users/ellaggon/Projects/fastt/src/schemas/provider/profile.schema.ts), [ProviderProfileForm.astro](/Users/ellaggon/Projects/fastt/src/components/provider/ProviderProfileForm.astro)                                                                                                                        |
| Navegación y contexto       | [DashboardSidebar.astro](/Users/ellaggon/Projects/fastt/src/components/dashboard/DashboardSidebar.astro), [backoffice-governance.ts](/Users/ellaggon/Projects/fastt/src/lib/backoffice-governance.ts), [workspaceRequestContext.ts](/Users/ellaggon/Projects/fastt/src/lib/dashboard/workspaceRequestContext.ts)                                                                                                               |
| Shells                      | [WorkspaceLayout.astro](/Users/ellaggon/Projects/fastt/src/layouts/WorkspaceLayout.astro), [PlaybookLayout.astro](/Users/ellaggon/Projects/fastt/src/layouts/PlaybookLayout.astro), [ProviderSettingsLayout.astro](/Users/ellaggon/Projects/fastt/src/layouts/ProviderSettingsLayout.astro)                                                                                                                                    |
| Selector y verticales       | [product/create.astro](/Users/ellaggon/Projects/fastt/src/pages/product/create.astro), [productVerticalRegistry.ts](/Users/ellaggon/Projects/fastt/src/lib/catalog/productVerticalRegistry.ts)                                                                                                                                                                                                                                 |
| Recorridos                  | [launch-accommodation.ts](/Users/ellaggon/Projects/fastt/src/lib/playbook/launch-accommodation.ts), [launch-tour.ts](/Users/ellaggon/Projects/fastt/src/lib/playbook/launch-tour.ts)                                                                                                                                                                                                                                           |
| Borradores                  | [playbookFormDraft.ts](/Users/ellaggon/Projects/fastt/src/lib/forms/playbookFormDraft.ts)                                                                                                                                                                                                                                                                                                                                      |
| Preparación y publicación   | [evaluate-complete-to-publish-progress.ts](/Users/ellaggon/Projects/fastt/src/lib/playbook/evaluate-complete-to-publish-progress.ts), [preview.astro](/Users/ellaggon/Projects/fastt/src/pages/product/[id]/preview.astro), [publish.ts](/Users/ellaggon/Projects/fastt/src/pages/api/product/publish.ts), [canonical-product-publication.ts](/Users/ellaggon/Projects/fastt/src/lib/product/canonical-product-publication.ts) |
| Gobernanza y documentos     | [provider-governance.ts](/Users/ellaggon/Projects/fastt/src/lib/provider-governance.ts), [provider-documents.ts](/Users/ellaggon/Projects/fastt/src/lib/provider-documents.ts)                                                                                                                                                                                                                                                 |
| Continuidad de invitaciones | [invitations/accept.astro](/Users/ellaggon/Projects/fastt/src/pages/provider/invitations/accept.astro)                                                                                                                                                                                                                                                                                                                         |
| Telemetría                  | [provider-settings-funnel.ts](/Users/ellaggon/Projects/fastt/src/lib/provider-settings-funnel.ts)                                                                                                                                                                                                                                                                                                                              |

La primera entrega recomendada es concreta: **bienvenida por intención, navegación inicial reducida, continuidad desde identidad hacia la oferta y un diagnóstico de activación consistente**. Esa entrega permite aprovechar los recorridos ya construidos y probar con usuarios si Fastt logra llevarlos desde “creé mi cuenta” hasta “puedo recibir mi primera reserva”.
