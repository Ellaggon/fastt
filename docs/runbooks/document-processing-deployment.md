# Despliegue del procesamiento documental

Status: active
Document type: runbook
Owner: Platform / Security
Last verified: 2026-10-31
Scope: preparación, activación y certificación de gateway y dispatcher
Source of truth: services/document-analysis, services/document-dispatcher y endpoints documentales
Related code/tests: src/lib/provider-document-storage.ts, tests/unit/document-direct-upload.test.ts, tests/integration/document-gateway-live.test.ts
Review trigger: cambio de hosting, protocolo, credenciales, límites o retención

## Antes de desplegar

Este procedimiento no autoriza contratación ni producción. Elegir y aprobar región,
coste, residencia y responsables antes de aplicar
`services/document-analysis/render.yaml`. Es una plantilla de dos servicios de pago:
gateway Docker persistente y dispatcher pequeño. No ejecutar un Blueprint contra
producción como prueba. No enviar documentos reales durante la certificación.

Mantener Vercel para aplicación, Supabase para registros/cola y R2 privado para
originales. Separar completamente Preview y Production. Nunca conectar Preview a
documentos, base o gateway productivos.

## Carga directa

El formulario calcula SHA-256, solicita PUT firmado por cinco minutos y envía el
archivo directamente a R2. Se firman tipo, tamaño y creación condicional. La firma
no demuestra que el archivo sea seguro: confirmación descarga con límite, calcula
el hash real y contrasta HEAD. El servidor deriva la clave desde proveedor de sesión
e idempotencia, nunca desde una URL enviada por el navegador. El registro conserva
las validaciones actuales de alcance, reemplazo, permisos y auditoría transaccional.
No hay segundo PUT del archivo al confirmar. Sin JavaScript queda el formulario
multipart; archivos grandes requieren la carga directa en Vercel.

Configurar CORS del bucket privado: sólo orígenes exactos autorizados, método PUT y
cabeceras de `services/document-analysis/r2-cors.development.json`. En producción
reemplazar localhost por el dominio productivo exacto; no usar `*` ni habilitar
dominios públicos. CORS no reemplaza la firma. El token de objetos puede carecer de
permisos de configuración: usar el panel autorizado, no ampliar sus permisos.

```bash
pnpm run certify:documents:upload:dev
# Con localhost:4321 abierto; visitar la URL temporal impresa y pulsar Probar carga.
pnpm run certify:documents:upload:dev -- --browser
```

La certificación sube sólo PDF sintético mayor de 5 MB, comprueba integridad y bloqueo
de sobrescritura, y elimina su objeto. `--browser` genera una página temporal que se
retira al terminar; comprobar el resultado visible en Brave. No prueba permisos del
formulario autenticado: verificarlos aparte. No registrar URLs firmadas, tokens,
contenido OCR ni nombres de archivos.

## Gateway y dispatcher

En Render configurar manualmente región aprobada y secretos. El gateway recibe
token exclusivo, `DOCUMENT_ANALYSIS_SOURCE_ORIGIN` y
`DOCUMENT_ANALYSIS_SOURCE_PATH_PREFIX` del bucket productivo. No recibe claves R2,
base de datos ni token del dispatcher. El disco `/var/lib/clamav` conserva firmas:
inicio corrige propietario y baja a usuario clamav. `/readyz` expone sólo readiness;
`/health` y análisis siguen autenticados. Firmas de más de 48 horas fallan cerrado.

El dispatcher recibe origen HTTPS exacto de Vercel y token exclusivo
`DOCUMENT_PROCESSING_WORKER_TOKEN`, también configurado en Vercel. No recibe el
`CRON_SECRET` global. Ejecuta llamadas secuenciales: pausa 60 segundos tras completar
cada una, con backoff hasta cinco minutos ante fallos. No promete un trabajo por
minuto ni habilita escalado automático. Mide backlog antes de ampliar capacidad.

En Vercel Production configurar:

```ini
DOCUMENT_ANALYSIS_GATEWAY_URL=https://gateway.example/v1/documents/analyze
DOCUMENT_ANALYSIS_GATEWAY_TOKEN=<token exclusivo del gateway>
DOCUMENT_ANALYSIS_LOCAL_DEVELOPMENT=false
DOCUMENT_PROCESSING_WORKER_TOKEN=<token exclusivo del dispatcher>
```

Verificar también `R2_DOCUMENTS_*` y `CRON_SECRET`, sin compartirlos con Preview.
Redesplegar tras cambiar variables. El endpoint procesa un documento por llamada,
solicita duración máxima 60 segundos y conserva leases/reintentos. Confirmar que el
plan efectivo admite esa duración; no confundir configuración con garantía de plan.
El cron diario queda como recuperación, no como procesamiento oportuno. Conciliación
de objetos va en otro cron diario y es sólo lectura. Buckets grandes requieren el
CLI de auditoría si exceden el tiempo de Function; nunca tratar timeout como auditoría
completa. No se borra evidencia como compensación.

## Certificación y operación

Ejecutar pruebas unitarias de carga/worker, tests del dispatcher y tests existentes
de inspección contra PostgreSQL aislado. En staging desplegado verificar el recorrido
autenticado: PDF limpio y mayor de 4,5 MB, JPEG/PNG, EICAR, corrupción, MIME/hash
incorrectos, reintentos y concurrencia. Confirmar acceso anónimo denegado, aislamiento
entre proveedores, firmas caducadas, reinicios con recuperación de leases y ausencia
de PII en logs. Un documento sigue pendiente de revisión humana tras análisis limpio.

Configurar alertas del hosting y del destino de logs: readiness fallida, firmas
obsoletas, `document_worker_unavailable`, resultados `failed`/`retry` persistentes y
cola creciente. Validar entrega de alerta, no sólo su definición. Probar reinicio y
renovación de firmas durante operación sostenida. Registrar entorno y resultados
antes de habilitar tráfico real; certificación local no equivale a productiva.

Para detener procesamiento, parar dispatcher; el cron diario aún existe: deshabilitar
su disparo si se necesita pausa total. No quitar el gate técnico ni aprobar documentos
para desbloquear la cola. Mantener archivos privados e historial. Extracción avanzada
no está implementada; antivirus/OCR no certifican autenticidad. Revisión humana sigue
siendo necesaria. Respaldos independientes y conservación se rigen por el contrato
documental, no por el disco de firmas antivirus.

## Referencias

- [R2: URLs firmadas](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
- [R2: CORS](https://developers.cloudflare.com/r2/buckets/cors/).
- [Render: health checks](https://render.com/docs/health-checks).
- [Render: discos persistentes](https://render.com/docs/disks).
