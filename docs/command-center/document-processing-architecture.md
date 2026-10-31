# Arquitectura de seguridad e inteligencia documental de FASTT

Status: active
Document type: canonical
Owner: Platform / Security
Last verified: 2026-10-31
Scope: inspección obligatoria de documentos y condiciones de operación
Source of truth: arquitectura, services/document-analysis y pruebas enlazadas; producción no habilitada
Review trigger: cambio de contrato, controles o procedimiento; revisar evidencia del entorno antes de ejecutar

**Estado:** gateway autoalojado operativo y certificado en desarrollo; producción no habilitada
**Alcance:** documentos de identidad, negocio, fiscalidad y corroboración de pagos  
**Decisión:** el archivo original permanece privado en R2 y toda decisión se apoya en un expediente técnico persistente, reproducible y auditable.

## 1. Dictamen

El gap no se cierra instalando una única biblioteca de OCR. Son cuatro controles distintos:

1. **Antivirus:** responde si el archivo contiene malware conocido.
2. **Validación estructural:** comprueba el tipo real, integridad básica y contenido activo peligroso.
3. **OCR y extracción:** convierte imagen en texto y propone campos; no demuestra autenticidad.
4. **Detección de manipulación:** aporta señales de alteración; nunca debe ser el único fundamento de un rechazo.

FASTT adopta una arquitectura híbrida. El núcleo propio controla almacenamiento, hash, estados, política, colas y decisiones. Un gateway privado y sustituible encapsula motores especializados. Esto evita acoplar Casework a un proveedor, impide que una caída externa detenga todo el sistema y permite escoger región/proveedor por jurisdicción.

## 2. Modelo de amenazas y reglas

| Riesgo                              | Control                                        | Resultado operativo                          |
| ----------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| Extensión o MIME falsificado        | magic bytes + MIME detectado                   | cuarentena y bloqueo                         |
| PDF truncado o con acciones activas | estructura, EOF y señales PDF                  | bloqueo preventivo                           |
| Malware conocido                    | motor antivirus especializado                  | `infected` bloquea apertura y aprobación     |
| OCR incompleto o baja calidad       | estado/confianza y revisión humana             | advertencia; nunca se interpreta como fraude |
| Campos extraídos incorrectamente    | valores con confianza y corroboración          | propuesta, no verdad canónica                |
| Posible alteración                  | señales de tamper                              | bloqueo y revisión reforzada                 |
| Proveedor caído/no configurado      | cola durable y modo sombra                     | nunca se marca como limpio por defecto       |
| Reintento o duplicado               | un job por documento + lease                   | procesamiento idempotente                    |
| Fuga de PII                         | URL R2 efímera, gateway privado y minimización | sin bucket público ni OCR completo en logs   |

Principio central: **`unavailable` no significa `clean`**. La inspección es obligatoria:
sin antivirus limpio no se habilitan apertura ni aprobación. OCR no disponible exige
revisión manual documentada; no demuestra fraude ni autenticidad.

## 3. Flujo implementado

```text
Upload privado a R2
        │
        ▼
ProviderDocument + Inspection + Job (misma transacción)
        │
        ▼
Worker con lease ──► hash SHA-256 + magic bytes + estructura local
        │
        ├── inválido/sospechoso ──► blocked / cuarentena lógica
        │
        └── válido ──► gateway privado
                         ├── antivirus
                         ├── OCR
                         ├── extracción permitida
                         └── señales de manipulación/calidad
                                  │
                                  ▼
                         expediente técnico persistido
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
           Casework/UI                    preview y decisión
           estados/señales                gate de servidor
```

La base conserva una inspección y un trabajo por documento. El worker reconstruye el backlog en cada ejecución para reparar huérfanos, recupera leases vencidos y reintenta con backoff. Los trabajos detenidos porque no existía gateway se reencolan automáticamente cuando aparecen ambas credenciales.

La carga valida alcance y reemplazo antes de R2. Usa `CommandIdempotency` existente,
una identidad estable por proveedor/intento y `PUT If-None-Match: *`: un reintento
reutiliza el objeto sólo si HEAD confirma tamaño, MIME y SHA-256. Registro, auditoría,
inspección, trabajo y respuesta idempotente se confirman juntos. Sólo serialización
y deadlock admiten tres intentos transaccionales; una pérdida de conexión obliga a
consultar el registro antes de afirmar fallo. El formulario conserva la clave del
intento fallido, sin compartirla con formularios hermanos. Refrescos de caché o del
expediente posteriores no convierten un registro confirmado en otro envío.

`pnpm run audit:r2-documents` concilia todas las páginas del bucket documental privado
con referencias de **todos** los estados en PostgreSQL. Distingue referencias válidas,
cargas recientes (24 horas), candidatos huérfanos y objetos sin identidad/edad fiable.
Falla si no puede consultar referencias o completar la paginación. Es sólo lectura:
un candidato no autoriza borrado ni creación de documentos o aprobaciones. Platform
debe contrastarlo con intentos pendientes y retención antes de autorizar una limpieza.
Nunca borrar como compensación inmediata de un COMMIT cuyo resultado sea incierto.
El cron separado `document-storage-reconciliation` ejecuta la conciliación diaria;
devuelve sólo conteos y registra atención si hay candidatos u objetos desconocidos.

## 4. Contrato del gateway

Entrada autenticada por `Bearer`, con `Idempotency-Key`, URL R2 firmada por cinco minutos, hash y controles solicitados. El gateway debe validar tamaño, esquema, host del origen y hash descargado.

Respuesta mínima:

```json
{
  "malware": {
    "status": "clean",
    "engine": "clamav",
    "definitionVersion": "2026-09-05"
  },
  "ocr": {
    "status": "completed",
    "provider": "document-ai",
    "language": "es",
    "confidence": 0.97
  },
  "extraction": {
    "status": "completed",
    "fields": [{ "key": "legal_name", "value": "…", "confidence": 0.96 }]
  },
  "tamper": {
    "status": "clear",
    "signals": []
  },
  "qualitySignals": {
    "blur": 0.04,
    "glare": false
  }
}
```

El contrato está validado con Zod: estados desconocidos, claves arbitrarias, confianza fuera de rango o respuestas sobredimensionadas son rechazados. FASTT no guarda el texto OCR completo por defecto. Solo persiste una lista acotada de campos necesarios; la UI administrativa muestra las claves y cantidades, no sus valores sensibles.

## 5. Estrategia de proveedores recomendada

- **Antivirus:** ClamAV en un servicio privado administrado por FASTT o por infraestructura contratada. `clamd` no debe exponerse públicamente; su protocolo TCP no autentica por sí mismo. El gateway debe usar red privada, timeouts, límite de bytes y firmas actualizadas.
- **OCR/extracción:** Google Document AI es la primera opción para el MVP por OCR multilingüe, soporte de español y señales de calidad. AWS Textract queda como adaptador alternativo si región, coste o contrato lo hacen más conveniente.
- **Manipulación:** combinar estructura local, señales del procesador, metadatos e incoherencias de campos. Para identidad de alto riesgo debe delegarse autenticidad documental a un proveedor KYC especializado; “tamper detection” genérico no sustituye esa validación.
- **Privacidad:** no usar escáneres públicos ni subir evidencia real a servicios de prueba. Antes del go-live se requiere DPA, subprocesadores, residencia, retención, borrado y cláusula de no entrenamiento.

## 6. Estados y política de decisión

Bloquean siempre:

- formato real inválido;
- contenido PDF activo/sospechoso;
- malware `infected`;
- manipulación `suspected`.

También bloquean siempre, sin interruptor de bypass:

- inspección inexistente;
- antivirus pendiente, no disponible o con error.
- procesamiento distinto de `completed` y estructura o integridad pendientes/con error.

Flujo: archivo recibido → comprobación técnica → pendiente de revisión humana →
resultado documental. `ProviderDocument.status=pending` no implica que el análisis
haya terminado. La UI presenta esa fase usando la inspección persistida, cargada por
lote. Preview y aprobación aplican el mismo gate del servidor. Aprobar nunca marca
la inspección como completada. La aprobación vuelve a comprobarla bajo bloqueo
transaccional; el rechazo documental no equivale a un diagnóstico antivirus.

Generan revisión humana, pero no rechazo automático:

- OCR no soportado, incompleto o con error;
- extracción ausente o con baja confianza;
- manipulación inconclusa sin señales materiales.

Todo rechazo material debe citar política y evidencia humana/externa. Un score o una falla de OCR no puede ser el único reason code.

## 7. Operación y despliegue

Variables server-only:

```ini
DOCUMENT_ANALYSIS_GATEWAY_URL=https://gateway-interno.example/v1/documents/analyze
DOCUMENT_ANALYSIS_GATEWAY_TOKEN=<secreto-rotado>
```

El endpoint procesa un documento por llamada; el dispatcher usa token exclusivo y
el cron diario conserva `CRON_SECRET`. Carga directa, CORS y despliegue están en el
[runbook documental](../runbooks/document-processing-deployment.md). Para operación manual:

```bash
# Validación local de formato/hash, sin egress a terceros
pnpm run ops:process-provider-documents -- --local-only --limit=25

# Usa el gateway configurado
pnpm run ops:process-provider-documents -- --limit=25
```

Sin gateway configurado, el worker registra `awaiting_configuration`; no habilita
preview ni aprobación. Los errores transitorios de antivirus/integridad reintentan
con backoff. OCR y extracción fallidos requieren notas de revisión manual, no se
convierten en rechazo automático ni en una afirmación de autenticidad.

## 8. Desarrollo autoalojado

`services/document-analysis/` implementa el protocolo existente con ClamAV, qpdf,
Poppler y Tesseract español/inglés. Docker usa imagen oficial fijada por digest,
usuario sin privilegios, disco de aplicación de sólo lectura, temporales en RAM,
3 GiB máximos y puerto publicado exclusivamente en `127.0.0.1:4319`. FreshClam
actualiza firmas; si superan 48 horas, el servicio falla cerrado. No conserva texto
OCR, archivos temporales ni URLs firmadas en logs. No expone el socket de ClamAV.

```bash
pnpm run gateway:documents:configure:dev
pnpm run gateway:documents:up
pnpm run gateway:documents:test
pnpm run gateway:documents:certify:dev
pnpm run gateway:documents:down
```

Configuración genera secretos locales excluidos de Git (`.env` y
`tmp/document-analysis.env`, modo 0600). HTTP requiere el opt-in
`DOCUMENT_ANALYSIS_LOCAL_DEVELOPMENT=true`; está prohibido en producción/Vercel.
El servicio acepta sólo la URL R2 firmada, origen configurado, identidad del objeto,
hash y tamaño esperados. No sigue redirecciones. La certificación usa el PDF sintético
del repositorio y EICAR, elimina sólo sus objetos temporales tras comprobar hashes y
no aprueba documentos. `tests/integration/document-gateway-live.test.ts` certifica
R2 real → gateway real → PostgreSQL aislado con `FASTT_CERTIFY_LOCAL_GATEWAY=1`.

Límites explícitos: OCR de PDF de una página y JPEG/PNG; documentos de varias páginas
devuelven `not_supported`, no un falso OCR completo. Extracción contractual de campos
no está implementada: devuelve `not_supported` y exige notas humanas. Manipulación
devuelve `inconclusive`; este gateway no certifica autenticidad ni identidad legal.
Objetos históricos fuera del namespace privado canónico requieren revisión/migración
autorizada, nunca ampliar silenciosamente la lista de orígenes.

## 9. Criterio de cierre

Desarrollo está certificado con ClamAV/Tesseract y R2 reales, PDF sintético limpio,
EICAR detectado, PDF inválido y hash incorrecto bloqueados. La prueba del worker usa
PostgreSQL aislado y conserva `ProviderDocument.status=pending`: aptitud técnica no
es aprobación. No equivale a certificación de producción, autenticidad ni extracción.

## 10. Producción pendiente (fuera de desarrollo)

1. Elegir alojamiento, región, presupuesto y responsables. Si hay un tercero que
   procese documentos, aprobar contrato, DPA, residencia y retención antes de egress.
2. Desplegar con HTTPS, secretos separados, monitorización, límites de cola y alertas.
3. Certificar carga/rendimiento, falsos positivos, JPEG/PNG, documentos difíciles,
   caídas, backlog autorizado y operación sostenida 48–72 horas con Security/Ops.
4. Implementar y certificar extracción especializada sólo si se decide incorporarla.
5. Resolver históricos no disponibles sin inventar archivos ni aprobaciones.

## 11. Conservación y recuperación

Los plazos provisionales no autorizan borrados. `documentDeletionPolicy()` los
bloquea; no hay adaptador destructivo. Vencimiento documental y conservación son
distintos; original, expediente y copias requieren plazos y holds aprobados.

`src/lib/documents/recovery-archive.ts` cifra objetos e inventario con AES-256-GCM,
nonce aleatorio y clave externa de 32 bytes. Archivo exclusivo 0600; verifica hash,
tamaño y referencia canónica. No inventa hashes históricos. `databaseCheckpoint`
es correlación del operador, no prueba de backup PostgreSQL.

Recuperación autentica y valida todo antes de escribir, exige autorización actual,
creación condicional y lectura posterior. No sobrescribe diferencias ni cambia
aprobaciones. Fallos parciales admiten reintento, nunca compensación borrando.

```bash
pnpm run certify:documents:recovery
pnpm exec vitest run tests/unit/document-recovery-archive.test.ts
```

El simulacro usa sólo el PDF sintético, elimina temporales y no conecta DB/R2.
No certifica respaldo independiente ni recuperación de PostgreSQL.

Para datos reales faltan destino/residencia autorizados, claves y credenciales
independientes, adaptadores auditados, catálogo durable y barrera de borrados vigente
tras restaurar DB; definir RPO/RTO, calendario, alertas y caducidad. No se habilitó
un comando real ni se contrató almacenamiento.

## 12. Referencias técnicas primarias

- [Cloudflare R2 — Event notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/): opción futura para disparar procesamiento en tiempo casi real; la cola de base permanece como fuente de verdad.
- [Google Cloud — Document AI overview](https://cloud.google.com/document-ai/docs/overview) y [processor list](https://docs.cloud.google.com/document-ai/docs/processors-list): OCR, extracción, idiomas y análisis de calidad.
- [AWS — Textract AnalyzeDocument](https://docs.aws.amazon.com/textract/latest/APIReference/API_AnalyzeDocument.html): adaptador alternativo y límites de procesamiento.
- [ClamAV — clamd protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html) y [scanning](https://docs.clamav.net/manual/Usage/Scanning.html): integración `INSTREAM`, actualización de firmas y advertencia de que el socket TCP no lleva autenticación propia.
