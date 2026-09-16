# Activación controlada de la política comercial BO v1

La matriz BO v1 sigue siendo un borrador hasta que **Políticas** y **Finanzas** aprueben cada combinación de titular, jurisdicción, actividad y modelo de cobro. Este documento no sustituye esa aprobación.

## Decisión de producto implementada

- Las combinaciones se guardan versionadas por rol de jurisdicción (`holder`, `product`, `tax`, `payout`), titular, país, vertical y modelo de cobro.
- Sólo una versión `published`, vigente y firmada con `approvedBy`, `approvedAt` y `approvalReference` puede habilitar una capacidad.
- El diagnóstico está disponible en `GET /api/onboarding/commercial-policy?productId=...` y continúa en modo sombra por defecto.
- La aplicación de publicación y confirmación se habilita únicamente con `FASTT_ENFORCE_COMMERCIAL_POLICY=true`. Sin esa variable, las autorizaciones existentes siguen siendo la fuente de control.

## Aprobación requerida

Por cada una de las combinaciones BO v1, Políticas y Finanzas deben registrar:

1. Evidencia aceptada, obligatoriedad, propietario de revisión y acción correctiva.
2. Capacidades afectadas: publicar, reservar, cobrar, pagar e integrar.
3. Fecha de inicio, fecha de término si aplica, responsable que aprueba y referencia del expediente.
4. Criterio de revisión para cambios de titular, país, actividad y modelo de cobro.

La referencia no es opcional. El SIN distingue requisitos de registro según persona natural y jurídica, y asocia la actividad declarada con el registro tributario; por ello Fastt no infiere reglas regulatorias desde una etiqueta de producto. Las fuentes operativas son las guías vigentes del SIN y deben revisarse antes de publicar una versión: [persona natural](https://siatinfo.impuestos.gob.bo/index.php/requisitos-para-la-inscripcion/requisitos-para-obtener-el-nit-para-personas), [persona jurídica](https://siatanexo.impuestos.gob.bo/index.php/requisitos-para-la-inscripcion/procedimientos-y-requisitos-para-obtener-el-nit-para-personas-juridicas) y [actividades económicas](https://siatinfo.impuestos.gob.bo/index.php/actividades-economicas).

## Secuencia de activación

1. Aplicar las migraciones de `ProviderHolderProfile` y contrato comercial a la base que atiende el entorno objetivo.
2. Cargar las versiones aprobadas y verificar el diagnóstico de una muestra de proveedores sin activar el flag.
3. Activar el flag en un entorno de pruebas y certificar publicar y confirmar reserva para cada combinación aprobada.
4. Activar por cohorte; si el diagnóstico difiere de la autorización actual, desactivar el flag y conservar el registro de diagnóstico para corrección.
