# Arquitectura de seguridad e inteligencia documental de FASTT

**Estado:** implementada en modo sombra; activación obligatoria pendiente de proveedor especializado  
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

Principio central: **`unavailable` no significa `clean`**. Mientras el feature flag obligatorio esté desactivado, la ausencia de antivirus/OCR genera una advertencia para permitir la transición. Al activar el control, antivirus sin resultado limpio bloquea apertura y aprobación.

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

Bloquean cuando `DOCUMENT_PROCESSING_ENFORCED=true`:

- inspección inexistente;
- antivirus pendiente, no disponible o con error.

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
DOCUMENT_PROCESSING_ENFORCED=false
```

El endpoint diario `/api/cron/document-processing` usa el `CRON_SECRET` ya existente. Para operación controlada:

```bash
# Validación local de formato/hash, sin egress a terceros
pnpm run ops:process-provider-documents -- --local-only --limit=25

# Usa el gateway configurado
pnpm run ops:process-provider-documents -- --limit=25
```

No activar `DOCUMENT_PROCESSING_ENFORCED=true` hasta que el backlog sea cero, el proveedor esté certificado y las métricas confirmen estabilidad.

## 8. Plan de activación

### Etapa A — sombra técnica (implementada)

- migración y backfill;
- inspección local, SHA-256 y tipo real;
- cola durable, lease, retry, dead-letter y reconciliación de huérfanos;
- gates de preview/aprobación y estado visible en Casework;
- flag obligatorio apagado.

### Etapa B — integración especializada

- desplegar gateway privado;
- integrar ClamAV y OCR/extracción;
- configurar secretos solo en Vercel Production/Preview correspondiente;
- procesar fixtures sintéticos y después el backlog real autorizado;
- alertas por `infected`, `failed`, `dead_letter` y antigüedad de cola.

### Etapa C — certificación

- archivo limpio PDF/JPEG/PNG;
- MIME falsificado y PDF truncado;
- EICAR únicamente en entorno aislado de prueba;
- PDF con JavaScript/Launch/EmbeddedFile;
- imagen borrosa, rotada y con reflejo;
- conjunto dorado en español para nombre legal, NIT, fechas y número documental;
- fallo/timeout del gateway y replay idempotente;
- comprobar que preview y aprobación quedan bloqueados por servidor.

### Etapa D — enforcement

- backlog sin pendientes fuera de SLA;
- tasa de error y falsos positivos aceptada;
- aprobación Legal/Security/Ops;
- activar `DOCUMENT_PROCESSING_ENFORCED=true` gradualmente;
- revisar métricas durante 48–72 horas antes de generalizar.

## 9. Criterio de cierre

El gap técnico queda **arquitectónicamente resuelto y en modo sombra**. El cierre operacional completo exige proveedor real, contrato de privacidad, certificación y enforcement. Hasta entonces FASTT muestra honestamente “no disponible” y mantiene revisión manual; nunca afirma que un documento está limpio o auténtico sin evidencia.

## 10. Trabajo manual pendiente

1. Elegir región/proveedor y firmar DPA/condiciones de tratamiento.
2. Desplegar el gateway privado y configurar sus credenciales en Vercel; no compartir el token en el repositorio.
3. Crear el set de fixtures sintéticos y obtener autorización antes de procesar documentos reales con un tercero.
4. Ejecutar la certificación de la Etapa C y revisar falsos positivos con Ops/Legal.
5. Activar `DOCUMENT_PROCESSING_ENFORCED=true` solo al superar el gate.
6. Los tres documentos legacy cuyo origen ya no existe deben volver a cargarse o marcarse formalmente como evidencia no disponible; no pueden analizarse ni aprobarse técnicamente.

## 11. Referencias técnicas primarias

- [Cloudflare R2 — Event notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/): opción futura para disparar procesamiento en tiempo casi real; la cola de base permanece como fuente de verdad.
- [Google Cloud — Document AI overview](https://cloud.google.com/document-ai/docs/overview) y [processor list](https://docs.cloud.google.com/document-ai/docs/processors-list): OCR, extracción, idiomas y análisis de calidad.
- [AWS — Textract AnalyzeDocument](https://docs.aws.amazon.com/textract/latest/APIReference/API_AnalyzeDocument.html): adaptador alternativo y límites de procesamiento.
- [ClamAV — clamd protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html) y [scanning](https://docs.clamav.net/manual/Usage/Scanning.html): integración `INSTREAM`, actualización de firmas y advertencia de que el socket TCP no lleva autenticación propia.
