# Aislamiento de datos del marketplace

## Contrato de entorno

Todo proceso que conecte con datos Fastt declara `FASTT_DATA_ENV` como
`development`, `test`, `staging` o `production`. El valor explícito siempre gana.

Si falta, el runtime clasifica el plano de datos con señales del host:

- `VERCEL_ENV=production|preview|development` → `production`, `staging`, `development`
- `NODE_ENV=development` o un proceso local sin `NODE_ENV` → `development`

Vitest y un Node `production` sin `VERCEL_ENV` siguen exigiendo el valor explícito.
Vitest solo acepta `FASTT_DATA_ENV=test`. Además, Vitest nunca usa
`DATABASE_URL`, `DIRECT_URL` ni `SUPABASE_DB_POOLER_URL` heredados del shell o
de `.env`. Una suite con PostgreSQL debe configurar exclusivamente:

```dotenv
FASTT_DATA_ENV=test
FASTT_TEST_DATABASE_URL=postgresql://.../fastt_test
FASTT_TEST_DIRECT_URL=postgresql://.../fastt_test
FASTT_TEST_DATABASE_FINGERPRINT=dbfp_...
FASTT_PRODUCTION_DATABASE_FINGERPRINTS=dbfp_production_a,dbfp_production_b
```

El fingerprint usa protocolo, usuario de conexión, host, puerto y nombre de
base; nunca incluye contraseña ni parámetros. El usuario permite distinguir
proyectos de Supabase que comparten pooler regional. El fingerprint de prueba
debe coincidir con su URL y no puede coincidir con ninguno de producción.

## Clasificación de catálogo

`Product`, `ProductCategory` y `ProductContent` tienen `dataClass`:

- `production`: dato apto para ser considerado por la superficie pública.
- `demo`: dato de demostración, excluido de visitantes.
- `fixture`: dato de prueba, excluido de visitantes.
- `sandbox`: dato experimental, excluido de visitantes.

La clase no publica un producto. Para mostrarse al huésped, el producto también
debe superar sus condiciones comerciales: estado publicado, disponibilidad y
precio donde corresponda.

## Migración y saneamiento

La migración `2026-08-26_marketplace_data_isolation.sql` es aditiva y no borra
filas. Durante el saneamiento registra categorías UUID y duplicadas en una
tabla temporal de auditoría, inactiva las que no pertenecen a una taxonomía
controlada y conserva enlaces para investigación histórica. La evidencia
operativa se revisa antes de ejecutar la retirada final
`2026-09-11_retire_historical_backfill_artifacts.sql`, que retira esos
artefactos de backfill de la base runtime. La retirada valida que no queden
etiquetas sin mapear, mueve los enlaces de categorías duplicadas hacia su
categoría canónica y elimina las categorías fixture obsoletas.

Antes de desplegarla:

1. Configurar una base `fastt_test` aislada y sus fingerprints.
2. Aplicar la migración allí con `FASTT_DATA_ENV=test pnpm db:migrate:apply-one --file db/migrations/2026-08-26_marketplace_data_isolation.sql`.
3. Revisar la auditoría de saneamiento y los enlaces reasignados antes de la
   reconciliación final.
4. Confirmar que categorías, búsqueda, hold y solicitudes privadas no devuelven
   registros `demo`, `fixture` ni `sandbox`.
5. Repetir el proceso en staging antes de producción.
