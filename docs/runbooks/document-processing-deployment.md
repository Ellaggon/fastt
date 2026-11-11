# Despliegue del procesamiento documental

Status: active
Document type: runbook
Owner: Platform / Security
Last verified: 2026-11-08
Scope: preparación, activación y certificación de gateway y dispatcher
Source of truth: services/document-analysis, services/document-dispatcher y endpoints documentales
Related code/tests: src/lib/provider-document-storage.ts, tests/unit/document-direct-upload.test.ts, tests/integration/document-gateway-live.test.ts
Review trigger: cambio de hosting, protocolo, credenciales, límites o retención

## Antes de desplegar

### Integrar codigo no activa el servicio

`FASTT_DOCUMENT_PIPELINE_ENABLED` esta apagado por defecto: solo el valor exacto
`true` habilita nuevas cargas, confirmaciones, registro, worker y cron de
reconciliacion. Tener credenciales R2 o gateway no lo habilita. Configurar
`false` en Preview y Production mientras no exista certificacion del entorno.
No se ha cambiado ninguna variable hospedada al introducir este control.

Con el control apagado, la UI informa indisponibilidad y deshabilita u oculta los
formularios de carga; POST y cron autorizado responden 503 sin registrar documentos,
crear backlog ni escanear R2. El fallback multipart tampoco elude el control.
La consulta del historial y los controles de inspeccion, acceso y revision existentes
permanecen intactos. No devolver exito simulado ni aprobar evidencia para compensar
la pausa. La pausa no borra documentos ni trabajos existentes.

Para certificar, habilitar explicitamente solo en el entorno aislado de pruebas
con documentos sinteticos. Tras certificar, registrar evidencia, version,
responsable y autorizacion de activacion antes de habilitar en produccion y
redesplegar. Render es una alternativa, no un requisito ni una contratacion aprobada.
Si la beta exige documentos reales y no hay procesamiento certificado, esa cohorte
no esta lista para apertura comercial aunque el codigo pueda integrarse apagado.

Rollback: volver el control a `false`, redesplegar y pausar dispatcher; comprobar
503 en los endpoints con autorizacion y que no crece la cola por nuevas cargas.
Una peticion o PUT firmado ya iniciados no se revocan con el flag: esperar el
vencimiento de firmas (cinco minutos), drenar peticiones en vuelo y conservar
reconciliacion pendiente para una ventana de mantenimiento autorizada.

Regresiones: `tests/unit/document-activation.test.ts`,
`tests/unit/document-worker-route.test.ts`,
`tests/unit/document-direct-upload-route.test.ts`,
`tests/unit/document-reconciliation-cron.test.ts` y
`tests/render/tour-evidence-form.test.ts`. Las pruebas locales no sustituyen la
certificacion hospedada ni autorizan merge o activacion por si solas.

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

## Recorrido de renovacion y retirada de validacion

Usar archivos sinteticos y una base desechable para el recorrido autenticado completo.
No sembrar expedientes, firmas o decisiones en la base compartida para aparentar certificacion.
Conservar el control de produccion apagado; la certificacion local puede habilitarlo solo
en su proceso hijo. No se despliega ni contrata un servicio por seguir este recorrido.

1. Carga: con el control apagado comprobar 503 sin documento nuevo. En pruebas autorizadas,
   cargar un PDF sintetico y registrar pendiente, sujeto, alcance y huella de integridad.
2. Inspeccion: comprobar PDF limpio/OCR, marcador antivirus inofensivo, PDF corrupto y hash
   incorrecto. Ninguna inspeccion limpia aprueba identidad, autenticidad o habilitacion legal.
3. Revision: usar permiso documental y autenticacion reciente. Con controles tecnicos listos,
   aprobar mediante el flujo autorizado y comprobar actor, fecha y evidencia en auditoria.
4. Recordatorio: evidencia verificada con vencimiento a 30 dias o menos muestra aviso en el
   panel y enlace de renovacion, incluido el dia de vencimiento. No es correo automatico.
   Pendientes, rechazados y sustituidos no generan ese aviso. La ventana es operativa, no ley.
5. Renovacion anticipada: el formulario envia `replacesDocumentId` antes de vencer; mantiene
   tipo y sujeto, exige declarar alcance sin copiarlo por suposicion. El antecedente verificado
   no se sustituye hasta aprobar el reemplazo. Probar envio duplicado y reemplazos concurrentes.
6. Retirada: abrir un expediente documental accionable para la evidencia verificada y proponer
   rechazo con motivo explicito de al menos diez caracteres. Conservar permisos, politica de
   razones y segundo control cuando corresponda. La aplicacion canonica habilita la transicion
   explicita `verified -> rejected`, no reaprobar ni modificar historicos sustituidos.
7. Auditoria: comprobar `provider.document.verification_withdrawn`, actor, motivo, estado
   anterior/posterior y alcances. Una actualizacion concurrente no debe emitir auditoria de exito.
   El Centro de Mando invalida gobernanza/proveedor despues del commit; comprobar denegacion
   de capacidades afectadas y revisar salidas existentes sin alterar snapshots de reservas.

No existe aun acceso especifico de reapertura desde el historial documental; preparar el
expediente por los mecanismos administrativos existentes y verificar su politica/razones.
No afirmar que la retirada esta disponible en todas las pantallas por existir el comando.

Evidencia local del 2026-11-08: gateway Docker con ClamAV real, R2 privado configurado
(no certificado como staging), exclusivamente objetos sinteticos temporales. PDF limpio:
antivirus limpio y OCR completado; marcador antivirus detectado; PDF invalido y hash
incorrecto rechazados. Extraccion avanzada: no soportada. No prueba formulario autenticado,
registro/revision en PostgreSQL, correo, continuidad hospedada ni apertura de la beta.
Las pruebas unitarias de transicion/auditoria usan dobles de DB; no equivalen a ese recorrido.

### Base local desechable para continuar

Base del 2026-11-08: contenedor `fastt-document-certification-postgres`, PostgreSQL 16,
DB `fastt_document_certification`, usuario `certifier`, `127.0.0.1:55439`, datos tmpfs.
Baseline `db/postgres/0001_initial_schema.sql`. Trust solo local: no exponer ni alojar
datos reales. Es desechable, no respaldo ni servicio de beta.

Verificar nombre, puerto y esquema antes de retomar; recrear vacia si falta. Vitest:
`FASTT_DATA_ENV=test`, ambas URLs
`FASTT_TEST_DATABASE_URL` y `FASTT_TEST_DIRECT_URL` apuntando a esta base, y huella
`FASTT_TEST_DATABASE_FINGERPRINT=dbfp_ddef7a8846da2890ef82`. Vaciar las cuatro
variables de conexion operativa; no cargar `.env`. Conservar huellas operativas prohibidas.
No modificar `.env.test`, que puede apuntar a respaldo.

Pasaron paridad de esquema y diecinueve pruebas en PostgreSQL limpio:
`tests/integration/provider-documents.test.ts`, `document-renewal-withdrawal.test.ts`
y `casework-gap-recovery.test.ts` del mismo directorio. Cubren renovacion sin perder
historial, bloqueo sin inspeccion, retirada con motivo/auditoria, permisos (403),
sesion reciente (401), rollback, reintento y segundo control. Identidad, archivo e
inspeccion son fixtures en esas suites; no certifican login ni antivirus reales.
Reiniciar solo esta base entre suites con IDs fijos para evitar auditorias acumuladas.

Brave, 2026-11-08: login Supabase real compartido y MFA del titular; datos locales.
Roles temporales autorizados, revision limitada al proveedor sintetico y luego revocados.
Retirada desde expediente fixture: `verified -> rejected`, caso resuelto, nuevas
decisiones bloqueadas y `provider.document.verification_withdrawn` con actor/motivo
confirmado en PostgreSQL. Politica historica de alojamiento usada solo como fixture:
no acredita cobertura Tours. No se activaron cargas reales.

Renovacion parcial adicional en Brave: aviso a quince dias, enlace de renovacion,
alcance declarado y envio del PDF sintetico del repositorio mediante selector nativo.
La extension no permitio `setFiles`; no se ampliaron sus permisos. Se uso S3rver 3.7.1
solo como simulador temporal en `127.0.0.1:59039`, sin claves R2 operativas; no certifica
compatibilidad completa con R2 ni sus precondiciones. El envio devolvio exito y PostgreSQL
confirmo reemplazo `pending` con `replacesDocumentId` correcto y antecedente `verified`.
Se resolvio la conexion del procesador con un puente HTTPS local: certificados confiados
solo por los procesos de certificacion mediante `NODE_EXTRA_CA_CERTS`, sin instalarlos en
macOS ni desactivar TLS. El puente restringe origen/ruta y conserva la firma S3 al reenviar
al simulador. Contenedor separado, firmas ClamAV existentes en lectura y origen HTTPS fijo.
El worker completo un trabajo sin reintentos: malware `clean`, OCR `completed`, extraccion
`not_supported`. No equivale a autenticar una licencia ni certificar R2 hospedado.
Con permisos temporales autorizados, MFA vencido detuvo la aprobacion; tras confirmarlo,
Brave aprobo el fixture conocido con nota tecnica. SQL confirmo reemplazo `verified`,
antecedente `superseded` y auditoria con actor; UI mostro historial sin aviso anterior y
caso resuelto. Sin revelado protegido ni autenticidad documental certificada.
Se revocaron los permisos temporales al finalizar. Regresion posterior detecto y corrigio
que gobernanza KYC ignoraba vencimientos: ahora lee `expiresAt` y excluye vencidos.
Prueba PostgreSQL: bloqueo/recuperacion de pagos e integraciones; publicar/reservar conserva
sus controles independientes. Prueba del motor Tours: evidencia exigida vencida, retirada,
sustituida o ajena bloquea publicar/reservar; renovacion vigente recupera solo lo aplicable.
Brave local 2026-11-09: revision estructurada de seguro/ruta con sesion real y MFA;
dos PDF sinteticos reinspeccionados (antivirus/OCR), sin extraccion avanzada. Vacio y
permiso vencido bloqueados; dos sitios restaurados y luego decision aplicada por caso.
SQL confirmo actor, notas JSON y auditoria pending/verified. Sin revelado protegido,
poliza/permiso autenticos ni firmas; accesos revocados y servicios temporales detenidos.
No certifica endpoints de publicacion/reserva ni activa cobertura. Pendiente: reapertura
desde historial y certificacion hospedada. La primera puerta comercial sigue en borrador.
Para retirar solo este recurso: `docker rm -f fastt-document-certification-postgres`.
No usar limpieza global de Docker ni eliminar el procesador documental por este paso.

Pruebas: `document-renewal-notice`, `document-review-transition`,
`document-verification-withdrawal`, `provider-document-review-evidence`,
`case-command-recovery`, `case-second-control-evidence` y `provider-document-renewal`.

## Referencias externas

- [R2: URLs firmadas](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
- [R2: CORS](https://developers.cloudflare.com/r2/buckets/cors/).
- [Render: health checks](https://render.com/docs/health-checks).
- [Render: discos persistentes](https://render.com/docs/disks).
