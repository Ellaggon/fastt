# fast-store (fastt)

Aplicacion SSR en Astro para una plataforma tipo OTA (tours/hoteles) con panel de administracion/proveedores, API para busqueda de ofertas y manejo de inventario/tarifas.

## Stack

- Astro 6 (SSR), Tailwind, React islands
- PostgreSQL administrado por Supabase, accedido con Drizzle y `postgres`
- Auth: Supabase (validacion por token via cookies/Authorization; dev bypass configurable)
- Storage: Cloudflare R2 (S3 compatible) para imagenes (URLs firmadas)

## Estructura del proyecto

- `src/pages`: UI (home/tours/hotels/dashboard/products)
- `src/pages/api`: endpoints (search offers, rate plans, policies, upload signed URLs, etc.)
- `src/modules`: modular monolith (domain/application/infrastructure por bounded context)
- `src/container`: composition root (DI manual)
- `src/shared/infrastructure/db/schema`: fuente canonica del esquema PostgreSQL
- `db/migrations`: migraciones incrementales para Supabase
- `db/postgres/0001_initial_schema.sql`: baseline limpio para bases nuevas

## Requisitos

- Node recomendado `v22.12.0` (ver `.nvmrc`)
- Variables de entorno (ver `.env.example`). No commitear `.env` (ya esta en `.gitignore`).

## Desarrollo

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Servidor local: `http://localhost:4321`

Usar pnpm (versión declarada en `packageManager`) para respetar el lockfile y los parches de dependencias.

### Evaluacion de compilacion Netlify

En una copia limpia, sin `.env` ni credenciales operativas:

```sh
pnpm install --frozen-lockfile
NETLIFY=true FASTT_DOCUMENT_PIPELINE_ENABLED=false pnpm run build
```

El adaptador Netlify conserva el servicio de imagenes passthrough existente;
no activa Image CDN. Vercel sigue seleccionado por `VERCEL=1` y el build local
sin flags conserva el adaptador Node. No definir ambos hosts simultaneamente.
`netlify.toml` solo configura compilacion y deja documentos apagados; no replica
los cron ni secretos de Vercel. Una compilacion correcta no certifica sesiones,
Netlify Blobs, conexiones de datos, permisos, reservas o rendimiento hospedado.
No ejecutar `netlify deploy` ni copiar credenciales de produccion para esta prueba.

Una evaluacion posterior puede compartir la base beta solo con autorizacion expresa.
Configurar `FASTT_DATA_ENV=production` si ese es el plano compartido y
`FASTT_HOSTING_EVALUATION_READ_ONLY=true` en el runtime de Netlify. Este control
bloquea comandos HTTP y cron, salvo inicio/cierre de sesion; no es un rol SQL de
solo lectura y no impide las materializaciones internas que ocurran durante GET.
No usar esa modalidad para pruebas destructivas ni asumir aislamiento entre hosts.
El escaner de Netlify excluye solo `FASTT_DATA_ENV`: su valor es una etiqueta
publica, no una credencial, y produce falsos positivos si se importa como secreto.
El escaneo de las conexiones, claves y demas variables permanece habilitado.

Astro 6.1.9 incorpora mediante `patches/astro@6.1.9.patch` la [corrección oficial de recarga SSR](https://github.com/withastro/astro/pull/17685): el identificador interno necesita el prefijo `virtual:` para que Vite no le añada `.js`.
Retirar el parche y su entrada `pnpm.patchedDependencies` al actualizar a una versión que incluya esa corrección (verificada en 7.2.3; 6.4.8 aún no la incluye), regenerar el lockfile y comprobar una recarga SSR completa. La migración a Astro 7 requiere revisar adaptadores y Vite 8.

## Documentación

Empieza en [`docs/README.md`](docs/README.md). Las instrucciones específicas para agentes están en [`AGENTS.md`](AGENTS.md).

## Tests y calidad

Inventario de servicios, sin llamadas de red ni valores de credenciales:

Mapa canonico de servicios actuales y futuros, estado por entorno y decisiones de
hosting: [Servicios de Fastt](docs/domains/platform/service-landscape.md).

```sh
pnpm ops:services:inventory
pnpm test:services:inventory
pnpm ops:services:inventory --billing artifacts/service-billing.private.json
```

La evidencia de facturacion es un array JSON local, excluido de Git bajo `artifacts/`.
Cada recurso declara `service`, `resource` (alias), `environment`, `plan`, `owner`,
`currency` (ISO de tres letras), `monthlyFixed`, `variableAccrued`, `periodStart`,
`periodEnd`, `verifiedAt`, `renewal`, `quotaUsed`, `quotaLimit` y `source` (etiqueta).
Fechas: `YYYY-MM-DD`; costos/cuotas desconocidos y renovacion no aplicable: `null`.
No incluir tokens, URLs, datos de pago, identificadores de cuenta ni exportaciones crudas.
Usar los IDs de servicio del reporte y entornos development/test/staging/production/shared.
Opcionalmente, registrar `consumers` como un array de objetos con `component`,
`environment` y `source` (etiquetas no sensibles). Declarar el enlace solo tras
comparar el recurso del panel con la configuracion efectiva del consumidor.
La fecha `verifiedAt` aplica tambien a esos enlaces. Usar una lista vacia cuando
no se haya comprobado el vinculo. No deducirlo por el nombre del proveedor.
Registrar una factura compartida una sola vez, no por cada consumidor. Revisar semanalmente
y antes de activar integraciones, planes o funciones publicas. Evidencia mayor de siete dias
no entra en costos confirmados; monedas y periodos se mantienen separados. Alertas al 70%
de cuota y renovaciones dentro de catorce dias no son limites de gasto. El comando no
consulta paneles, certifica despliegues, cancela servicios ni extrapola consumo mensual.

```sh
npm test
npm run lint
npm run check
```
