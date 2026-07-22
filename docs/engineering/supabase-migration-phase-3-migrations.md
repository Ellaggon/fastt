# Supabase Migration - Phase 3 Migrations

Fecha: 2026-07-22

## Objetivo

Crear una migración inicial Postgres limpia que represente el estado final actual del proyecto y preparar scripts de transformación de datos desde Turso hacia Supabase.

No se reutilizan las 62 migraciones SQLite/Turso existentes. Esas migraciones quedan como historia operativa, no como fuente de verdad para Supabase.

## Entregables

- `db/postgres/0001_initial_schema.sql`
  - Migración baseline Postgres generada desde el schema Drizzle de Fase 2.
  - 79 tablas.
  - FKs, índices, claves únicas, checks, índices parciales y triggers de integridad.

- `scripts/db/generate-postgres-initial-migration.ts`
  - Generador reproducible de la migración inicial.
  - Fuente de verdad: `src/shared/infrastructure/db/schema/tables.ts`.

- `scripts/db/turso-to-supabase/export-turso.ts`
  - Exporta Turso/libSQL a JSONL por tabla.
  - Requiere `ASTRO_DB_REMOTE_URL` y `ASTRO_DB_APP_TOKEN`.

- `scripts/db/turso-to-supabase/transform-for-postgres.ts`
  - Convierte tipos SQLite/Turso al contrato Postgres.
  - Normaliza `jsonb`, booleanos, `date`, `timestamptz`, enteros y `numeric`.

- `scripts/db/turso-to-supabase/load-supabase.ts`
  - Carga JSONL transformado a Supabase usando `DIRECT_URL`.
  - Soporta truncado explícito con `FASTT_SUPABASE_TRUNCATE=1`.

## Comandos

Regenerar la migración inicial:

```bash
pnpm db:pg:generate-initial
```

Exportar desde Turso:

```bash
ASTRO_DB_REMOTE_URL="libsql://..." \
ASTRO_DB_APP_TOKEN="..." \
FASTT_TURSO_EXPORT_DIR="tmp/turso-export" \
pnpm db:migrate:turso:export
```

Transformar para Postgres:

```bash
FASTT_TURSO_EXPORT_DIR="tmp/turso-export" \
FASTT_POSTGRES_IMPORT_DIR="tmp/postgres-import" \
pnpm db:migrate:turso:transform
```

Aplicar schema inicial en Supabase:

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f db/postgres/0001_initial_schema.sql
```

Cargar datos transformados:

```bash
DIRECT_URL="postgresql://..." \
FASTT_POSTGRES_IMPORT_DIR="tmp/postgres-import" \
FASTT_SUPABASE_TRUNCATE=1 \
pnpm db:migrate:supabase:load
```

## Orden recomendado de migración

1. Congelar cambios de schema Turso.
2. Ejecutar export Turso.
3. Ejecutar transformación local.
4. Crear base Supabase temporal.
5. Aplicar `db/postgres/0001_initial_schema.sql`.
6. Cargar datos transformados.
7. Validar conteos por tabla contra manifests.
8. Ejecutar smoke tests de endpoints críticos.
9. Medir latencia desde Latinoamérica contra pooler Supabase.
10. Repetir en ventana final con base Supabase definitiva.

## Archivos de auditoría generados por scripts

- `tmp/turso-export/manifest.json`
  - Conteos, columnas y archivos exportados desde Turso.

- `tmp/postgres-import/manifest.json`
  - Conteos transformados y warnings de nullability.

- `tmp/postgres-import/load-result.json`
  - Conteos cargados en Supabase.

## Validaciones pendientes con credenciales

Estas validaciones requieren una base Postgres/Supabase real:

- ejecutar `0001_initial_schema.sql` con `psql`;
- cargar un export real de Turso;
- comparar conteos fuente/destino;
- probar constraints negativos de políticas, booking e inventario;
- correr endpoints críticos contra `SUPABASE_DB_POOLER_URL`;
- medir p95/p99 de carga de información desde Bolivia/LatAm.

## Criterio de aceptación

La Fase 3 se considera lista para ensayo cuando:

- la migración inicial se genera sin errores desde el schema;
- TypeScript compila;
- los scripts export/transform/load compilan;
- el SQL se aplica correctamente en una base Supabase temporal;
- los manifests fuente/destino no muestran pérdida de filas;
- los endpoints críticos pasan smoke test contra Supabase.
