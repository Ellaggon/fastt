# PostgreSQL: contrato y operación

Status: active
Document type: runbook
Owner: Data / Engineering
Last verified: 2026-09-28
Scope: persistencia PostgreSQL, migraciones y validación de entornos
Source of truth: src/shared/infrastructure/db/schema y db/migrations
Related code/tests: src/shared/infrastructure/db/env.ts, src/shared/infrastructure/db/data-environment.ts, scripts/db/apply-single-migration.ts, tests/postgres/phase6-postgres-validation.test.ts
Review trigger: cambio de motor, esquema, aislamiento o procedimiento de despliegue
Supersedes: supabase-migration-phase-0-audit.md a supabase-migration-phase-7-cutover.md; turso-migration-freeze.md

## Fuente vigente

Supabase PostgreSQL es la persistencia operativa. El esquema Drizzle está en
`src/shared/infrastructure/db/schema/tables.ts`; `registry.ts` organiza sus dominios y
`compat.ts` expone la capa compartida. El baseline para bases nuevas es
`db/postgres/0001_initial_schema.sql`; una base existente recibe migraciones incrementales.

Se conservan IDs de texto por compatibilidad. Dinero usa `numeric` y requiere conversión
explícita en los límites de lectura/escritura; `jsonb` conserva estructuras y snapshots.
Las fechas comerciales son `date` y los instantes de auditoría son `timestamptz`.
Constraints y triggers complementan las validaciones de aplicación.

## Conexión y aislamiento

El runtime prioriza `SUPABASE_DB_POOLER_URL` sobre `DATABASE_URL`. Las operaciones de
migración requieren `DIRECT_URL`. Las credenciales permanecen en secretos locales o de CI.
Para pruebas seguir [aislamiento de datos](./marketplace-data-isolation.md): una URL operativa
no puede sustituir la base aislada cuando falle la conexión de tests.

## Cambiar esquema

1. Revisar el esquema actual y preparar una migración incremental aditiva cuando sea posible.
2. Actualizar el baseline de bases nuevas y los contratos afectados.
3. Inspeccionar SQL con `pnpm run db:migrate:apply-one -- --file db/migrations/ARCHIVO.sql --dry-run`.
4. Aplicar primero en el entorno aislado, con `FASTT_DATA_ENV=test` y el mismo comando sin `--dry-run`.
5. Ejecutar pruebas pertinentes; comprobar concurrencia, idempotencia y persistencia cuando cambien.
6. Verificar destino, respaldo y plan de reversión antes de aplicar en el entorno operativo.

El ejecutor usa un lock y registra checksum; una migración aplicada no se reescribe.
El baseline no se reaplica sobre una base con datos. Las validaciones útiles son
`pnpm run db:pg:verify-initial`, `pnpm run test:postgres` y `pnpm run build`, además de
las suites del dominio modificado. Un build no certifica el esquema desplegado.

## Despliegue y recuperación

Comprobar desde el runtime desplegado autenticación, búsqueda, precio, hold y confirmación
sobre fixtures autorizadas; observar errores, latencia y saturación de conexiones.
Ante fallo, revertir a código compatible con el esquema actual o aplicar una migración
correctiva revisada. Restaurar un respaldo requiere reconciliar escrituras posteriores.
Cambiar variables a Turso no constituye una reversión válida del código actual.

## Evidencia histórica y límites

Los informes de julio registraron una carga de 79 tablas y 3.596 filas en staging, con
conteos/checksums coincidentes y cuatro pruebas PostgreSQL aprobadas. No certificaron
por sí solos el despliegue remoto, la latencia de producción ni toda la suite global.
Esos valores son históricos: medir otra vez para evaluar el entorno actual. Los informes
por fase y los comandos de importación retirados se consultan en Git si una investigación
requiere reconstruir aquella migración.

## Sesiones de preparación por producto

Aplicar en orden `2026-09-30_preparation_sessions_per_product.sql` y
`2026-10-01_preparation_session_writer_fence.sql`, después de respaldar las filas.
Comparar sus IDs, contenido y fechas tras migrar; sólo se añade `writeVersion`.
El cliente y la transacción usan v2. Código anterior no puede escribir, ni siquiera
sobre una fila v2: coordinar el despliegue de la aplicación. Para revertir código,
conservar este protocolo y la clave por producto; el índice anterior perdería
compatibilidad al existir varios tours. No reconstruir sesiones sobrescritas ni
asignar automáticamente un producto a las filas históricas sin él.
