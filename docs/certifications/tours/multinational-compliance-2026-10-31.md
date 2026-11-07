# Certificación técnica multinacional de cumplimiento

Status: partial
Document type: certification
Owner: Engineering / Compliance
Last verified: 2026-10-31
Scope: configuración BO/CL sintética, conservación de datos y retiro de carga genérica de Tours
Source of truth: src/scripts/certify-compliance-multinational.ts
Related code/tests: tests/postgres/multinational-compliance.test.ts; tests/postgres/compliance-migration-integrity.test.ts; tests/ui/compliance-document-archive.test.ts
Review trigger: cambio de evaluador, esquema, migración geográfica, carga documental o activación de país

## Entorno y reproducción

Ejecución sobre el árbol de trabajo local, sin commit ni despliegue. PostgreSQL 17 desechable,
base `fastt_multinational_test`, fingerprint `dbfp_602ca3b68848e07d68de`. Se instaló el baseline,
se sembró geografía mediante `seed-bolivia-geo-places.ts` y se aplicó dentro de una transacción
`db/migrations/2026-10-29_operating_geography.sql`. Ningún fixture se instaló en desarrollo remoto.

Configurar FASTT_TEST_DATABASE_URL y FASTT_TEST_DIRECT_URL para la base aislada,
FASTT_TEST_DATABASE_FINGERPRINT y FASTT_PRODUCTION_DATABASE_FINGERPRINTS. Ejecutar
`pnpm run certify:compliance:multinational`. El comando exige aislamiento y falla ante pruebas
omitidas. La preparación y ejecución también están integradas en Architecture Guardrails.

## Resultados observados

- 75 pruebas aprobadas, sin omitidas: contratos históricos, alternativas, composición,
  sustituciones, límites temporales, aislamiento de lecturas y constraints PostgreSQL.
- BO y CL usan la misma persistencia, parser y evaluador. Se comprueban admisión explícita,
  evidencia versionada, rechazo sin evidencia y rechazo fuera del país configurado.
- Los fixtures de políticas y firmas son sintéticos y se revierten por transacción.
- Repetir la migración geográfica sobre referencias canónicas conserva las huellas de contratos,
  documentos e historial. Una modificación de revisión con igual recuento es detectada por hash.
- Inventario de desarrollo solo lectura: 12 documentos sin definición versionada; seis requieren
  revisión de alcance, dos no conceden autorización y cuatro están pendientes de revisión.
  No se infirió clasificación, equivalencia legal ni aprobación.
- Comparación de 11 tablas protegidas de desarrollo: ninguna huella ni recuento cambió.
- Astro: 0 errores, 7 warnings y 277 hints. ESLint de archivos revisados y guardrail UI aprobados.
- Brave autenticado: archivo de Tours sin formulario genérico; acceso a experiencias disponible.
  Comprobación visual a 320/390/768/1280 px sin desbordamiento horizontal. Se restauró el viewport.

## Límites y decisión

Esto no certifica normativa chilena ni habilita Chile. La matriz de Bolivia sigue en borrador:
requiere revisión de fuentes y aprobación de las áreas responsables, no firmas sintéticas.
No se modificaron documentos, decisiones, acuerdos, reservas ni aprobaciones existentes.
Las huellas de registros no prueban por sí mismas integridad o recuperación de objetos R2.
No se certificó un ciclo nuevo de envío y aprobación humana mediante formularios de Brave.
Producción y autorización regulatoria quedan fuera de esta certificación técnica parcial.

Se conserva el lector de contratos históricos y sus aliases territoriales. El archivo de Tours
permanece como consulta; los requisitos de experiencia son el destino de nuevas cargas.
No se retiran formularios de alojamiento ni se publican requisitos desde esta certificación.
