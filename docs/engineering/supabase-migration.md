# Migración a Supabase/PostgreSQL

Status: active-migration-record  
Document type: index  
Owner: Data / Engineering  
Last verified: 2026-09-22  
Scope: secuencia de migración y estado del cutover  
Source of truth: esquema en `src/shared/infrastructure/db/schema` y migraciones en `db/migrations`
Review trigger: avance, reversión o cierre del cutover a PostgreSQL

| Fase | Documento                                                                      | Uso actual                         |
| ---- | ------------------------------------------------------------------------------ | ---------------------------------- |
| 0    | [Auditoría](./supabase-migration-phase-0-audit.md)                             | Línea base histórica               |
| 1    | [Capa DB](./supabase-migration-phase-1-db-layer.md)                            | Decisiones implementadas           |
| 2    | [Esquema PostgreSQL](./supabase-migration-phase-2-postgres-schema.md)          | Decisiones implementadas           |
| 3    | [Migraciones](./supabase-migration-phase-3-migrations.md)                      | Procedimiento histórico            |
| 4    | [Repositorios críticos](./supabase-migration-phase-4-critical-repositories.md) | Evidencia técnica                  |
| 5    | [Datos](./supabase-migration-phase-5-data.md)                                  | Completa en staging                |
| 6    | [Doble validación](./supabase-migration-phase-6-double-validation.md)          | Parcial; consultar pendientes      |
| 7    | [Cutover](./supabase-migration-phase-7-cutover.md)                             | Parcial; consultar antes de operar |

No aplicar instrucciones antiguas sin contrastarlas con el esquema y scripts actuales. Las fases 6 y 7 contienen trabajo abierto y no deben archivarse todavía.
