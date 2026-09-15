# Recuperación de F0-01: base PostgreSQL aislada de tests

Fecha: 14 de septiembre de 2026.

## Estado: resuelto el 14 de septiembre de 2026

Se reanudó **Fastt Backup**, el proyecto aislado existente. Una vez que Supabase reportó estado `Healthy`, la batería `tests/integration/onboarding-phase0-contract.test.ts` aprobó sus nueve pruebas. No se cambió la URL, el fingerprint ni se usó la base de desarrollo.

## Diagnóstico original

La suite `tests/integration/onboarding-phase0-contract.test.ts` carga únicamente `.env.test` y valida el fingerprint antes de abrir conexión. Con red disponible, el pooler de Supabase respondió que el tenant/usuario configurado no existe. El proyecto de desarrollo local tiene una identidad distinta y no es una alternativa válida para pruebas.

## Recuperación requerida

Un responsable con acceso a Supabase debe crear o recuperar un proyecto dedicado, vacío y no comercial para Fastt. No debe contener proveedores, reservas ni credenciales de producción. Aplicar el esquema canónico y las migraciones requeridas antes de certificar.

Configurar sólo estas claves en el secreto local/CI de pruebas, sin copiar la URL a documentación ni a código versionado:

```dotenv
FASTT_DATA_ENV=test
FASTT_TEST_DATABASE_URL=postgresql://…
FASTT_TEST_DIRECT_URL=postgresql://…
FASTT_TEST_DATABASE_FINGERPRINT=dbfp_…
FASTT_PRODUCTION_DATABASE_FINGERPRINTS=dbfp_produccion_1,dbfp_produccion_2
```

El fingerprint se obtiene de la URL de prueba con `databaseFingerprint` en `src/shared/infrastructure/db/data-environment.ts`; la protección rechaza la ejecución si coincide con uno de producción.

## Certificación después de recuperar el tenant

1. Aplicar [el esquema inicial](../../db/postgres/0001_initial_schema.sql) y las migraciones pendientes al proyecto de test.
2. Ejecutar `FASTT_DATA_ENV=test pnpm exec vitest run tests/integration/onboarding-phase0-contract.test.ts`.
3. La salida esperada es 9 pruebas aprobadas: ocho escenarios P00–P07 contra PostgreSQL y una validación de nombres comerciales/legales.
4. Ejecutar el recorrido autenticado de fase 1 cuando el fixture de sesión esté disponible; debe cubrir bienvenida, identidad, contacto operativo, creación por vertical y bloqueo de publicación.

La prueba crea fixtures aislados con el prefijo `onboarding_p0_`; no modifica datos de negocio preexistentes.
