# Migración de geografía del marketplace

## Estado de las fases 2 a 8

El esquema sigue siendo aditivo: `Destination` y `Product.destinationId` se
mantienen como compatibilidad mientras se completa la cobertura de `GeoPlace`.
La fase 7 sí mueve la superficie pública a rutas canónicas, sin modificar el
contrato de reservas, contenido publicado ni integraciones.

La fase 8 queda protegida por una compuerta de retirada. La primera auditoría
estática encontró consumidores todavía activos de `Destination`,
`Product.destinationId` y `LegacyDestinationGeoPlaceMap`; por ello no se ha
creado ni aplicado una migración destructiva. Borrar esas estructuras ahora
rompería la creación de producto, descubrimiento, PDP, viajes, eventos y
fixtures. Este es un resultado intencional de seguridad, no una retirada
completa.

## Modelo canónico

`GeoPlace` es la identidad geográfica canónica. Un lugar tiene nombre y slug
estables, tipo, país ISO, centroide, zona horaria, fuente, estado y una relación
opcional con su padre. Los tipos iniciales son `country`, `admin_area_1`,
`admin_area_2`, `city`, `locality`, `neighborhood`, `poi` y `natural_area`.

`GeoPlaceClosure` representa la relación ancestro-descendiente. Cada lugar debe
tener su propia fila con profundidad 0; las relaciones con antepasados usan una
profundidad positiva. El seed inicial reconstruye únicamente los cierres de sus
propios lugares versionados; no toca los de otros catálogos ni los de productos.

`GeoPlaceAlias` conserva nombres históricos, alternativos y localizados. El
campo normalizado se prepara para autocompletado y coincidencias sin depender de
comparaciones textuales de `Destination.department`.

`GeoPlaceContent` guarda la presentación editorial localizada: título, resumen,
SEO, imagen principal, estado de publicación y orden destacado. No reemplaza el
contenido del producto.

`GeoPlaceExternalId` vincula un lugar a una fuente autoritativa o canal externo,
con unicidad por `source + externalId`.

`ProductGeoPlace` permite varios papeles por producto: `primary_discovery`,
`secondary_discovery`, `service_area` y `meeting_area`. Solo una relación primaria
puede existir por producto. Esto preserva la precisión de un hotel y permite que
un tour pertenezca a una ciudad, cubra otra zona y tenga un punto de encuentro.

## Catálogo inicial de Bolivia

El catálogo versionado `src/data/geography/bolivia-marketplace-catalog.ts` usa
el INE de Bolivia para la división político-administrativa y GeoNames para los
centroides WGS84. Incluye el país, los nueve departamentos, sus nueve capitales
y once ciudades o destinos iniciales de interés comercial. Todos usan ISO `BO`,
nombre canónico en español, slug estable, coordenadas y `America/La_Paz`.

Se carga mediante `pnpm seed:geo:bolivia` una vez que la migración aditiva esté
aplicada sobre una base aislada. Es idempotente: conserva los identificadores y
fechas de creación, actualiza los datos controlados y reconstruye solo las
relaciones de jerarquía del catálogo boliviano.

Esto no pretende representar los más de trescientos municipios. La incorporación
de municipios, localidades, barrios y POIs necesita una fuente administrativa
de granularidad municipal, una revisión de aliases y una priorización basada en
inventario real. Esa ampliación no debe bloquear el uso correcto de este catálogo
inicial ni introducir nombres no verificables.

## Backfill y equivalencias

`LegacyDestinationGeoPlaceMap` conserva una equivalencia por cada destino
legacy, con resultado, método, distancia, confianza y evidencia. Varios destinos
históricos pueden apuntar a un mismo `GeoPlace`; por tanto se deduplican para
descubrimiento sin borrar IDs ni romper reservas o enlaces existentes.

`ProductGeoPlaceBackfill` conserva la decisión para cada producto antes de
crear una relación servible. Una relación primaria existente seleccionada por un
operador se marca como `superseded` y jamás se sustituye. Solo los resultados
`auto_matched` crean `ProductGeoPlace.primary_discovery`; los ambiguos quedan
en `review_required` y los insuficientes en `unmatched`.

El proceso se inicia en modo de solo lectura con `pnpm backfill:geo:bolivia`.
Su aplicación exige `CONFIRM_GEO_BACKFILL=apply pnpm backfill:geo:bolivia --apply`.
Debe ejecutarse únicamente después de aplicar las migraciones sobre una base
aislada y revisar el informe JSON. El script no renombra ni elimina
`Destination` ni cambia `Product.destinationId`.

## Lectura y escritura dual

Mientras persista el contrato legacy, crear un producto conserva su
`Product.destinationId`. Si ese destino ya tiene una equivalencia confirmada o
automática, la misma transacción crea su `ProductGeoPlace.primary_discovery` con
origen `dual_write_legacy_destination`.

El autocompletado consulta primero las equivalencias resueltas y presenta el
nombre, slug y coordenadas de `GeoPlace`, pero devuelve el `Destination.id`
temporal que requieren los formularios actuales. Después agrega destinos legacy
no cubiertos, sin repetir los ya representados por una ubicación canónica.

La búsqueda de hoteles acepta temporalmente un ID o slug legacy y también uno
canónico. Para una ubicación canónica combina los productos relacionados por
`ProductGeoPlace` con el fallback de los productos que aún solo poseen el
`destinationId` equivalente. El fallback se eliminará únicamente cuando la
cobertura y la observabilidad demuestren que no quedan registros relevantes.

## Superficie pública unificada

`MarketplaceListingSurface` es la estructura compartida de `/hotels` y
`/tours`. Mantiene una jerarquía común de búsqueda, destinos populares,
descubrimiento por departamento y enlaces de exploración; cada vertical solo
aporta su vocabulario, enlaces y formulario de búsqueda. Esto elimina las dos
implementaciones visuales divergentes sin unificar artificialmente los filtros
de reservas y tours.

## Rutas públicas canónicas

La portada es el punto de entrada de descubrimiento y las dos verticales
mantienen sus landings en `/hotels` y `/tours`. Las páginas por lugar usan una
única forma canónica:

- `/destinos/:slug/alojamientos`
- `/destinos/:slug/tours`

Las búsquedas usan `/buscar/alojamientos` y `/buscar/tours`. Los formularios
envían `destino` como slug canónico y preservan las fechas y filtros aplicables.
La búsqueda de tours mantiene su motor de salidas y precios: una ruta canónica
no puede convertir una búsqueda con fecha en un listado sin disponibilidad.

Las rutas históricas de departamentos y búsqueda pública devuelven redirecciones
permanentes (`308`) a las nuevas rutas. `La Paz` se resuelve como ciudad en
un enlace de destino y como departamento cuando el origen era un selector de
departamentos; así no se mezclan ambos lugares por compartir nombre.

Durante la transición, las páginas canónicas consultan primero `ProductGeoPlace`
y sus equivalencias aprobadas. Si todavía no existe cobertura, hacen fallback a
`Product.destinationId`. Ese fallback es deliberado y no debe retirarse hasta
que los informes de backfill estén revisados y la migración esté desplegada.

## Estado de cierre

La retirada de `Destination` ya es irreversible: el runtime, los fixtures y el
esquema físico usan exclusivamente `GeoPlace` y `ProductGeoPlace`. El gate
`pnpm run audit:geo:retirement -- --final` exige cero tablas, columnas,
escritores y productos sin geografía primaria. El generador del baseline exige
además que toda tabla Drizzle esté registrada, por lo que una tabla omitida no
puede producir silenciosamente una instalación incompleta.

La ampliación futura de municipios, barrios y POIs debe ser aditiva sobre
`GeoPlace`; no debe reintroducir lecturas duales, tablas de equivalencia ni
campos geográficos directos en `Product`.

## Certificación de superficie pública

La fase 9 certifica rutas canónicas, SEO, accesibilidad, rendimiento y el
contrato comercial de ambas verticales. Las landings y búsquedas públicas
declaran idioma español, descripción y URL canónica; el layout ofrece salto a
contenido principal. La búsqueda canónica de alojamientos se conecta a
`getPublicSearchSurface`, que solo devuelve ofertas con precio y disponibilidad
materializados, y la de tours conserva `getTourSearchSurface`.

En pull requests, `pnpm run perf:html-budget` mide el preview generado por la
propia rama contra una base PostgreSQL efímera y un catálogo comercial
controlado. El mismo proceso ejecuta las pruebas DOM y de accesibilidad sobre
portada, hoteles, tours y las dos landings de La Paz. No depende de una URL
externa ni puede escribir fixtures en una base operativa.

La latencia de red, CDN y región se certifica por separado contra staging. El
TTFB del preview local sigue siendo un presupuesto de renderizado del servidor,
no una afirmación sobre el rendimiento de producción.

La comprobación local repetible es `pnpm test:marketplace:certification`. Antes
de un release se deben ejecutar también `pnpm test:search` y la certificación de
staging. La certificación comercial con `--apply` exige `FASTT_DATA_ENV=test`,
una URL de pruebas con fingerprint verificado y confirmación explícita.
