# Preparación de tours: evidencia de paridad y sesiones

Status: certified-local-production-sessions-http-negative-pending
Document type: certification
Owner: Engineering / responsable de Fastt
Last verified: 2026-10-01
Scope: diagnóstico, navegación, persistencia y revisión desplegada de sesiones v2
Source of truth: pruebas ejecutadas, PostgreSQL y recorridos autenticados en Brave/Codex
Related code/tests: tests/unit/tour-preparation-diagnostic.test.ts, tests/integration/preparation-session-persistence.test.ts, tests/integration/tour-slot-profile-persistence.test.ts, tests/integration/tour-checkin-repair.test.ts, tests/render/tour-preparation-progress.test.ts
Review trigger: cambio de diagnóstico, sesión, navegación o revisión desplegada
Supersedes: `docs/certifications/tours/preparation-sessions-v2-2026-10-01.md` (evidencia consolidada aquí)

## Alcance certificado

El recorrido local autenticado en escritorio y móvil coincide con el diagnóstico del servidor.
La persistencia de sesiones por producto está certificada en producción. Las últimas correcciones
de navegación, progreso y diálogo sólo están verificadas localmente; no atribuirlas al despliegue.
Estos resultados no autorizan venta: condiciones incompatibles y habilitaciones pendientes
continúan bloqueando la oferta.

## Pruebas y recorrido local

| Comprobación | Resultado al 01-10-2026 |
| --- | --- |
| Contrato, contexto, sesiones, diagnóstico y publicación | 129 pruebas, 14 archivos |
| Render de progreso, sesión y condiciones | 15 pruebas, 3 archivos |
| PostgreSQL aislado: sesiones, perfil e inventario, reparación | 12 pruebas, 3 archivos |
| Check / build / documentación | Aprobados; check con 0 errores y 3 advertencias existentes |

Los siete casos de paridad en `tour-preparation-diagnostic.test.ts` comparan catálogo, guía,
preview y errores del servidor para precio, condiciones, fechas vacías, cupos agotados,
fallos comercial/de autorización y selección ambigua. Los fallos son simulados; no se
interrumpió la base operativa. PostgreSQL aislado (`FASTT_DATA_ENV=test`,
`vitest.integration.config.ts`, límites de 90000 ms) comprueba independencia, escrituras
antiguas/ajenas, inserción y actualización del perfil sin alterar inventario, y reparación
idempotente con auditoría y snapshots preservados.

| Oferta usada | Opción | Tarifa | Preparación local |
| --- | --- | --- | --- |
| `df7746a8-f728-4254-925e-a1e5a510ee7f` | `32691ff6-6ca7-4c71-84f9-439455a95c22` | `d31281f5-9363-493f-9815-f805dca63675` | 9/10, 90% |
| `5ab05897-140f-4e11-be46-29371e18c89d` | `2c34e436-8b25-41d8-85b6-862760ce2954` | `4dc760dd-21e2-4dd4-98c4-3655a1721ea2` | 3/10, 30% |

La consulta operativa de sólo lectura coincide en códigos, mensajes, acciones y decisión
con la proyección del servidor; no equivale a probar HTTP de publicación. En Brave autenticado:

- Dashboard, guía y preview mantienen los pendientes y las selecciones de ambas ofertas.
- Etapas 4 y 6 de seis no cambian el porcentaje. Pestañas de tarifa y retorno desde la ficha
  pública conservan producto, opción, tarifa y, cuando aplica, playbook/etapa/flujo.
- A 390 × 844 no hay desbordamiento en tarifa y preview. Enter abre/cierra las etapas;
  texto, anchura y `aria-valuenow` coinciden en 90% y 30%. Se inspeccionó el árbol accesible,
  sin una sesión con lector de pantalla real. El viewport se restableció.
- El diálogo de reparación muestra alcance, canal y vigencia. Tab alcanza confirmación;
  Escape y Cerrar devuelven foco incluso durante la consulta, cancelada con `AbortController`.
  No se confirmó una retirada real ni se publicó o reservó durante el recorrido local.

## Sesiones v2 desplegadas

Proyecto Vercel `fastt` (`prj_6OZB9AZ2kDk2C6LJtkL7vBNVTwsB`), dominio
`https://fastt-five.vercel.app`. Deployment inicial `dpl_E7iQqhFhdJJTeCaNSzB2xyXxXjEo`,
revisión `d5ac1774b9296bd574deed362a510d001ec0b110`. El correctivo
`dpl_Bur1Gc2zxTiM1jTTw5hoHR4LbWv6` (`https://fastt-lamio0iae-ellaggons-projects.vercel.app`)
se promovió el 01-10-2026: corrige el escritor deshabilitado por `lightweight` y conserva
la compatibilidad efectiva. `VERCEL=1 pnpm run build` y tres pruebas de render aprobaron.
Fue desplegado desde artefacto preconstruido sin commit/push; preservar el código antes
de un despliegue automático para evitar regresión.

Checksums operativos de `2026-09-30_preparation_sessions_per_product.sql` y
`2026-10-01_preparation_session_writer_fence.sql` coinciden; trigger v2 e índice presentes.
En Codex autenticado se alternaron las dos ofertas: sesiones finales Precio y Condiciones,
respectivamente, ambas v2. Recarga y catálogo mantienen selección; `DailyInventory` completo
permanece idéntico. El segundo tour es un borrador controlado con salida desactivada.
UPDATE operativo sin marcador v2 rechaza con `23514` sin modificar sesiones. HTTP sin
sesión devuelve 401. La petición HTTP obsoleta autenticada sólo está probada en base aislada.

## Pendientes y recuperación

- Revalidar las últimas correcciones locales en producción tras desplegarlas.
- Comprobar HTTP 409 de escritor antiguo autenticado en el dominio operativo sin mutar datos.
- Toda reversión debe conservar v2, clave por producto y trigger; una sesión sobrescrita sólo
  se recupera con respaldo. Procedimiento: [operación PostgreSQL](../../engineering/supabase-migration.md#publicar-y-certificar-el-escritor-v2).

Artefactos privados ignorados por Git: `artifacts/backups/preparation-sessions/` contiene
`2026-10-01-before-certification.json`, `2026-10-01-cert-before.json`,
`2026-10-01-cert-after.json`, `2026-10-01-two-tours.jpg`, `b7-server-parity.json`,
`b7-preview-desktop.jpg`, `b7-mobile-certified.jpg` y `repair-dialog-certified-2026-10-01.jpg`.
No publicar sus datos. No se midió TTFB de producción.
