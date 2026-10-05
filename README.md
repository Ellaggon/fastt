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
Astro 6.1.9 incorpora mediante `patches/astro@6.1.9.patch` la [corrección oficial de recarga SSR](https://github.com/withastro/astro/pull/17685): el identificador interno necesita el prefijo `virtual:` para que Vite no le añada `.js`.
Retirar el parche y su entrada `pnpm.patchedDependencies` al actualizar a una versión que incluya esa corrección (verificada en 7.2.3; 6.4.8 aún no la incluye), regenerar el lockfile y comprobar una recarga SSR completa. La migración a Astro 7 requiere revisar adaptadores y Vite 8.

## Documentación

Empieza en [`docs/README.md`](docs/README.md). Las instrucciones específicas para agentes están en [`AGENTS.md`](AGENTS.md).

## Tests y calidad

```sh
npm test
npm run lint
npm run check
```
