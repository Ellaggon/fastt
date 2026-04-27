# fast-store (fastt)

Aplicacion SSR en Astro para una plataforma tipo OTA (tours/hoteles) con panel de administracion/proveedores, API para busqueda de ofertas y manejo de inventario/tarifas.

## Stack

- Astro 5 (SSR), Tailwind, React islands
- Astro DB (`astro:db`) con backend libsql/Turso (via `ASTRO_DB_REMOTE_URL` y `ASTRO_DB_APP_TOKEN`)
- Auth: base Supabase-ready (validacion por token via cookies/Authorization; dev bypass configurable)
- Storage: Cloudflare R2 (S3 compatible) para imagenes (URLs firmadas)

## Estructura del proyecto

- `src/pages`: UI (home/tours/hotels/dashboard/products)
- `src/pages/api`: endpoints (search offers, rate plans, policies, upload signed URLs, etc.)
- `src/modules`: modular monolith (domain/application/infrastructure por bounded context)
- `src/container`: composition root (DI manual)
- `db/`: schema y seed de Astro DB

## Requisitos

- Node recomendado `v22.12.0` (ver `.nvmrc`)
- Variables de entorno (ver `.env.example`). No commitear `.env` (ya esta en `.gitignore`).

## Desarrollo

```sh
npm install
npm run dev
```

Servidor local: `http://localhost:4321`

## Tests y calidad

```sh
npm test
npm run lint
npm run check
```
