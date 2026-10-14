# Negocios y experiencias: catálogo de encaje

Status: active  
Document type: canonical  
Owner: Product / Experiences  
Last verified: 2026-10-13  
Scope: ayudar a Producto, onboarding y proveedores a clasificar una oferta y detectar ampliaciones necesarias  
Source of truth: contratos de clasificación y formato del código; taxonomía vigente enlazada abajo  
Related code/tests: `src/shared/domain/experience-classification.ts`, `src/shared/domain/experience-format.ts`, `tests/unit/experience-classification.test.ts`  
Review trigger: cambio de actividades, tipos de negocio, formatos, playbooks o políticas aplicables

## Cómo utilizar este catálogo

Este documento cubre todas las categorías definidas actualmente en el código y las semillas de
actividades. Los ejemplos de negocios son orientativos, no una lista exhaustiva de empresas ni una
certificación comercial. La disponibilidad real depende de las categorías activas y las políticas
aplicables de cada entorno. No se ha auditado aquí la base de producción.

El proveedor configura su negocio; el viajero elige y reserva una experiencia. Un mismo negocio
puede ofrecer varias experiencias, y una experiencia puede tener varias opciones y horarios.

- **Negocio:** quién ofrece la actividad. Se declara en Perfil; puede tener varios tipos.
- **Actividad principal:** qué hará el participante. Se elige una; determina su familia.
- **Formato:** cómo se desarrolla. Se elige uno por experiencia.
- **Temáticas adicionales:** temas opcionales admitidos por la compatibilidad editorial de la actividad; no sustituyen la actividad.
- **Opción:** una alternativa comercial de la experiencia. La tarifa contiene precio y condiciones.
- **Fecha y horario:** una ocurrencia reservable, con su inventario. No es un negocio nuevo.

El negocio no predetermina el formato. Una bodega puede organizar una visita guiada, una degustación
o un taller. Se clasifican según lo que realmente hará el cliente. No se generan automáticamente
las 10 × 31 × 4 combinaciones: muchas serían incoherentes.

## Qué negocios pueden entrar

Los códigos identifican las diez selecciones de Perfil. Los ejemplos amplían su interpretación;
no agregan valores técnicos ni requisitos documentales.

| Selección de negocio | Ejemplos de proveedor | Ofertas posibles | Formatos orientativos |
| --- | --- | --- | --- |
| Operador o guía (`operator`) | Guías independientes, agencias receptivas, operadores de visitas | Recorrido urbano; visita patrimonial; senderismo | Visita guiada |
| Estudio o taller creativo (`creative_studio`) | Ceramistas, pintores, tejedores, joyeros, floristas | Crear una taza; tejer una pieza; diseñar un arreglo floral | Taller o clase |
| Escuela o academia (`school`) | Academias de danza, música, cocina, fotografía o tecnología | Clase puntual de baile, canto, cocina o robótica | Clase o taller |
| Negocio gastronómico (`food_business`) | Restaurantes, cafeterías, tostadores, panaderías, chocolaterías, bodegas | Cata de café; pan artesanal; cocina regional | Degustación, clase o taller |
| Productor o finca (`producer`) | Fincas, huertos, productores agrícolas y alimentarios | Visita a finca; jardinería; degustación de productos | Visita guiada, taller o degustación |
| Centro cultural (`cultural_center`) | Museos, centros culturales, espacios patrimoniales | Visita a museo; recorrido patrimonial; taller artístico | Visita guiada, taller o clase |
| Estudio de bienestar (`wellness_studio`) | Estudios de yoga y movimiento no clínico | Sesión puntual de yoga o estiramiento | Clase o taller |
| Operador deportivo (`sports_operator`) | Instructores y centros de ciclismo, escalada, agua o nieve | Iniciación a escalada; práctica de ciclismo | Clase, taller o visita guiada según actividad |
| Centro de divulgación (`science_center`) | Observatorios, centros de ciencia, laboratorios educativos, makerspaces | Observación astronómica; robótica; fabricación digital | Visita guiada, taller o clase |
| Otro negocio de actividades (`other`) | Organizadores cuyo negocio no coincide con los anteriores | Una actividad existente y un formato que describan fielmente la oferta | No crea una categoría ni concede permisos |

Un hotel, restaurante o comercio puede ofrecer experiencias además de su actividad habitual. Si
ofrece alojamiento, conserva esa línea y su verificación; la experiencia se clasifica por su
actividad real. No hace falta inventar un tipo de negocio por cada establecimiento.

## Las nueve familias y sus 31 actividades iniciales

Esta lista refleja las semillas de `2026-10-12_experience_activity_classification.sql`.
La aplicación consulta las categorías activas de la base; no debe copiar este catálogo al cliente
como lista fija. Una actividad ausente se solicita para revisión, sin elegir otra por aproximación.

| Familia | Actividades iniciales |
| --- | --- |
| Cultura y patrimonio | Recorrido urbano; Visita patrimonial; Visita a museo |
| Arte y artesanía | Cerámica; Pintura; Tejido; Joyería; Arte floral |
| Gastronomía y bebidas | Cocina; Panadería; Café; Chocolate; Degustación de productos |
| Música y danza | Danza; Instrumento musical; Canto |
| Fotografía y creación audiovisual | Fotografía; Producción audiovisual |
| Naturaleza y vida rural | Senderismo; Observación de naturaleza; Visita a finca; Jardinería |
| Deporte y aventura | Ciclismo; Escalada; Actividades acuáticas; Actividades de nieve |
| Bienestar y movimiento | Yoga; Movimiento y estiramiento |
| Ciencia y tecnología | Astronomía; Robótica; Fabricación digital |

## Cuatro formatos, un recorrido común

| Formato | Cuándo elegirlo | Programa |
| --- | --- | --- |
| Visita o recorrido guiado (`guided_tour`) | Conocer un lugar con acompañamiento. | Itinerario: mínimo 3 momentos. |
| Taller (`workshop`) | Crear, elaborar o practicar algo. | Programa: mínimo 1 momento. |
| Clase (`class`) | Aprender conocimientos o técnicas. | Programa: mínimo 1 momento. |
| Degustación (`tasting`) | Probar productos con una presentación. | Programa: mínimo 1 momento. |

Una clase de cocina enseña técnicas; un taller puede centrarse en elaborar una pieza o un producto;
una degustación tiene como eje probar productos; una visita muestra un lugar mediante acompañamiento.
La elección debe describir la promesa principal, aunque existan actividades secundarias.

La creación comienza con tarjetas de actividad, organizadas por familia y con búsqueda. Esa selección
no crea un producto ni modifica el negocio de Perfil. Presentación la precarga y permite cambiarla
sin perder los demás campos. La familia principal es automática; temas adicionales sólo aparecen
cuando existe una relación editorial admitida y se seleccionan expresamente.

Preparación conserva cinco etapas:

1. **Presentación:** nombre, actividad principal, formato, destino, descripción y temáticas.
2. **Itinerario y logística / Programa y detalles:** duración, momentos e inclusiones, con ejemplos
   del formato. Un programa válido no depende de haber completado la ubicación.
3. **Ubicación y encuentro / Lugar e indicaciones:** lugar exacto e instrucciones.
4. **Fotos:** actividad, entorno y resultado representativo; se conserva el mínimo vigente.
5. **Participantes:** quién puede reservar, con edades cuando correspondan.

Después se configura o reanuda una opción: perfil, horario, precio, condiciones y fechas según
modalidad. La revisión de publicación concentra los pendientes. Compartida y privada no son
formatos: la privada sigue su circuito de solicitudes, sin confirmar reservas automáticamente.

La actividad contextualiza la ficha; no debe suponerse que cada una de las 31 actividades ya tiene
un formulario especializado propio. Los campos y ejemplos comunes se adaptan principalmente al
formato y a características declaradas. La verificación utiliza el contrato comercial aplicable;
una etiqueta de instructor no reemplaza credenciales de guía ni crea equivalencias documentales.

## Ejemplos completos de clasificación

| Proveedor | Experiencia | Actividad → familia | Formato | Alternativa comercial |
| --- | --- | --- | --- | --- |
| Estudio creativo | Crea tu primera taza | Cerámica → Arte y artesanía | Taller | Grupo compartido a las 10:00; otra opción privada |
| Cafetería | Introducción al café de especialidad | Café → Gastronomía y bebidas | Degustación | Horario de tarde y tarifa correspondiente |
| Academia | Primera clase de salsa | Danza → Música y danza | Clase | Nivel inicial, horario y cupos |
| Museo | Descubre la colección con un guía | Visita a museo → Cultura y patrimonio | Visita o recorrido guiado | Idioma y horario de la visita |
| Finca | Aprende a cuidar un huerto | Jardinería → Naturaleza y vida rural | Taller | Grupo compartido en fechas programadas |
| Observatorio | Una noche mirando el cielo | Astronomía → Ciencia y tecnología | Visita o recorrido guiado | Fecha y horario nocturno |
| Estudio de yoga | Iniciación al movimiento consciente | Yoga → Bienestar y movimiento | Clase | Sesión puntual compartida |

Los ejemplos no autorizan comercialmente esas ofertas. Un segundo horario puede reutilizar datos
comunes mediante el flujo existente, sin copiar reservas, inventario ni autorizaciones.

## Qué requiere ampliar el modelo

| Oferta propuesta | Encaje actual y decisión |
| --- | --- |
| Concierto, festival, teatro o entrada libre a un recinto | Los cuatro formatos no describen por sí solos una entrada a evento. Definir acceso, fechas y operación antes de incorporarla. |
| Curso de varias semanas, membresía o abono | Una clase puntual encaja; inscripción a múltiples sesiones y derechos recurrentes requieren otro contrato. |
| Alquiler de bicicleta, equipo o espacio | No convertir un alquiler en clase. Requiere recursos, devolución, disponibilidad y responsabilidades propias. |
| Transporte como servicio independiente | No confundir transporte incluido en una experiencia con vender un traslado. |
| Atención clínica, terapia o tratamiento | No clasificar automáticamente como bienestar. Requiere alcance y habilitación específicos. |
| Alojamiento o paquete de varios servicios | Utilizar su línea y contrato; no disimularlo como experiencia. |
| Actividad nueva sin selección disponible | Revisar taxonomía y requisitos. “Otro negocio” no evita la selección de una actividad válida. |

## Regla para admitir una nueva oferta

Primero comprobar si representa una actividad acotada con un formato actual, participantes y
una forma de programarla compatible. Después identificar qué requisitos de contenido y operación
necesita y si hay una política comercial aprobada que cubra la combinación. Si falta un contrato,
se conserva el bloqueo correspondiente: preparar no significa estar autorizado para vender.

Priorizar ampliaciones que reutilicen esos contratos. Si cambian qué compra el viajero —una
entrada, un abono, un alquiler—, analizar el nuevo modelo antes de añadir una etiqueta.

## Fuentes y mapa editable

- [Taxonomía de datos](../../engineering/tour-vertical-table-taxonomy.md).
- [Preparación y publicación](./tour-preparation-publication.md).
- [Mapa editable Excalidraw](./assets/experience-business-map.excalidraw).
- [Mapa visual SVG](./assets/experience-business-map.svg).

El mapa es una representación de este catálogo. Actualizar ambos cuando cambie el contrato;
no usarlo como evidencia de habilitación comercial ni como nueva fuente de reglas de negocio.
