# Supabase Migration - Phase 2 Postgres Schema

Fecha: 2026-07-21

## Objetivo

Convertir el contrato actual de `db/config.ts` a una capa Postgres profesional, lista para Supabase, sin modificar todavía el comportamiento runtime sobre Astro DB/Turso.

Esta fase produce el schema destino para la migración. No ejecuta migraciones contra Supabase y no requiere credenciales.

## Entregables

- `src/shared/infrastructure/db/schema/tables.ts`
  - 79 tablas exportadas, alineadas con el registro de dominios.
  - Tipos Postgres explícitos mediante Drizzle.
  - `jsonb` para snapshots, metadatos, payloads y estructuras flexibles.
  - `date` para fechas comerciales locales `YYYY-MM-DD`.
  - `timestamp with time zone` para instantes operativos/auditoría.
  - Claves primarias, FKs, índices compuestos y claves únicas.

- `src/shared/infrastructure/db/schema/postgres-integrity.sql`
  - Triggers Postgres equivalentes para integridad de políticas.
  - Trigger genérico para `updatedAt`.
  - Checks de rangos de fechas, importes no negativos, ocupación, inventario y estadías.
  - Índices parciales Postgres donde el modelo Turso dependía de lógica de aplicación.

## Decisiones de modelado

### IDs

Se conservan IDs `text` para compatibilidad con datos existentes y rutas actuales. No se fuerza `uuid` en esta fase para evitar reescrituras destructivas durante la migración.

### Dinero y porcentajes

Los importes pasan de `column.number()` a `numeric(14, 2)` para evitar errores de punto flotante. Porcentajes y ratios usan `numeric(7, 4)` cuando el dominio lo requiere.

### JSON

Todos los campos `column.json()` migran a `jsonb`. Esto permite consultas, índices futuros y validaciones parciales sobre payloads sin perder flexibilidad.

### Fechas locales vs instantes

Las fechas de disponibilidad, estadía, búsqueda y políticas que representan días comerciales locales se modelan como `date`.

Los eventos reales de sistema, auditoría, expiración, revisión, confirmación y sincronización se modelan como `timestamp with time zone`.

### Integridad avanzada

Las reglas que en SQLite estaban como triggers o se sostenían en la aplicación se mueven a SQL nativo Postgres:

- categorías válidas de políticas;
- status válido de políticas;
- versión positiva;
- categoría de assignment igual a la categoría del grupo;
- prevención de solapamiento de assignments activos por scope/categoría/canal;
- rango positivo de booking, room detail y hold;
- un solo rate plan default activo por variante;
- contadores de inventario no negativos;
- importes contractuales no negativos.

## Riesgos controlados

- Las tablas financieras conservan referencias de booking/provider como `text` cuando el schema Turso actual no tenía FK estricta. Esto evita bloquear importaciones históricas por registros financieros que funcionan como snapshots/auditoría.
- Algunos valores tipo enum permanecen como `text` con checks SQL solo en dominios críticos. La normalización completa a enums Postgres se reserva para una fase posterior si el equipo decide cerrar contratos de dominio más fuerte.
- El SQL de integridad está separado del schema Drizzle porque Drizzle no expresa todos los triggers/checks parciales con la claridad necesaria para esta migración.

## Validación realizada

- Cobertura de tablas: `registry=79`, `exports=79`, `missing=[]`, `extra=[]`.
- TypeScript: `tsc --noEmit` pasó correctamente después de la conversión.

## Próximo paso recomendado

Fase 3 debe generar migraciones Postgres versionadas y probarlas en una base Supabase temporal con:

1. schema limpio;
2. carga de muestra;
3. replay de queries críticas;
4. validación de triggers/constraints con casos negativos;
5. comparación de latencia contra Turso desde Latinoamérica.
