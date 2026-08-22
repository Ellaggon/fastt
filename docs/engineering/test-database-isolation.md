# Base de pruebas aislada

Las pruebas que escriben en PostgreSQL solo pueden ejecutarse con una URL explícita
de una base o proyecto Supabase exclusivo para pruebas. Nunca heredan
`DATABASE_URL`, `DIRECT_URL` ni `SUPABASE_DB_POOLER_URL` de la aplicación.

## Configuración local

1. Crea un proyecto Supabase de pruebas o una base PostgreSQL dedicada.
2. Aplica el esquema y las migraciones a esa base, no a la base de operación.
3. Crea `.env.test` a partir de `.env.test.example`.
4. Establece `DATABASE_URL_TEST` y `FASTT_TEST_DATABASE=1`.

Vitest compara la URL de pruebas con las URLs operativas heredadas. Si coinciden,
el proceso falla antes de abrir una conexión. Si falta `DATABASE_URL_TEST`, borra
las URLs operativas del proceso y las suites con PostgreSQL se omiten.

## CI

Los flujos de pruebas reciben exclusivamente el secreto `DATABASE_URL_TEST` junto
con `FASTT_TEST_DATABASE=1`. Los secretos operativos no deben estar disponibles
para esos jobs.

## Clasificación de datos

`Provider.dataClassification` identifica la procedencia de un tenant:

- `production`: datos comerciales que podrán participar en el marketplace.
- `demo`: datos preparados para demostración local u operacional.
- `fixture`: datos controlados por pruebas o certificaciones.

La clasificación es independiente de `accountPurpose`. Por ejemplo, un fixture de
certificación conserva `accountPurpose=integration_certification` y se clasifica
como `fixture`.

La migración de esta fase añade la columna con valor seguro `production` y marca
solamente los dos seeds controlados ya identificables: el fixture de certificación y
la demo financiera. No cambia la visibilidad pública. La fase de catálogo geográfico
auditará y reclasificará los registros restantes antes de que el marketplace empiece
a filtrar por ella.

## Auditoría de solo lectura

Con una URL operativa autorizada, ejecuta:

```bash
pnpm db:audit:marketplace-classification
```

El comando abre una transacción de solo lectura e informa proveedores por
clasificación, productos huérfanos y candidatos de demo o fixture. No reclasifica
ni elimina filas.
