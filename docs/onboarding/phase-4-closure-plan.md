# Plan de cierre de Fase 4 — requisitos adaptativos y expansión

**Estado:** contrato e incremento inicial implementados en Fastt Backup; el detalle certificado está en [evaluación de Fase 4](./phase-4-assessment.md). Quedan aprobación jurisdiccional y flujo vendible de vivienda. No activa excepciones ni `rental`.

## Qué está listo y qué falta

Fastt ya conserva el proveedor, sus documentos, estados de revisión, configuración fiscal, cuentas de pago y los bloqueos por capacidad. El evaluador de gobernanza vigente sigue siendo la fuente de verdad para publicar, aceptar reservas, pagos e integraciones. El contexto declarativo y el contrato versionado ya se persisten en Fastt Backup; el diagnóstico comercial está disponible en modo shadow. Falta una política comercial aprobada y conectar su resultado con cada puerta de autorización.

`ProviderHolderProfile` ya guarda tipo de titular y países; la ubicación canónica aporta país del producto. Subactividades reguladas todavía necesitan contexto por producto. Los tres documentos globales actuales (`government_id`, `business_registration`, `tax_document`) se aplican igual a todos los casos. Cambiar esa regla sin matriz aprobada permitiría o bloquearía publicación, reservas y cobros sin una decisión de negocio verificable.

`WholeHome` y `WholeHomeUnit` ya establecen exclusividad, datos descriptivos, recurso físico y capacidad uno; la unicidad física pasó una prueba integrada. `rental` todavía no tiene alta guiada, precio, disponibilidad, cotización, hold, reserva, cancelación ni superficies públicas propias. Se mantiene fuera de creación pública hasta certificar el recorrido.

## Decisión manual requerida: política adaptativa

La persona responsable de políticas debe aprobar una matriz versionada. Cada fila representa una combinación de `tipo de titular + jurisdicción + actividad`, no una excepción de interfaz.

| Campo | Decisión que debe aprobarse |
| --- | --- |
| Versión, vigencia y propietario | Identificador, fecha de inicio, responsable y condición de reemplazo de la política. |
| Titular | Persona natural, empresa, organización u otros tipos admitidos. |
| Jurisdicción | País de constitución o residencia y país/países donde se ofrece la actividad; definir cuál prevalece si difieren. |
| Actividad | Hotel, tour y las actividades adicionales realmente admitidas. |
| Evidencia | Documento aceptado, emisor, campos mínimos, caducidad, reutilización y si admite revisión manual. |
| Obligación | Requerido, opcional, no aplicable o requerido sólo antes de publicar, reservar, cobrar o integrar. |
| Decisión ante ausencia/rechazo | Bloquear, permitir borrador, escalar a revisión o permitir con límite explícito. |
| Cobro y pagos | Requisitos para aceptar reservas y para habilitar cobros/payouts; no deben inferirse de publicación. |
| Revisión | Equipo responsable, SLA, razones de rechazo y quién puede conceder una excepción auditada. |

La primera versión puede limitarse a los países, titulares y actividades que Fastt decide soportar. Los casos no incluidos deben recibir `unsupported_policy_context`, conservar borradores y no publicar ni cobrar; no se les asigna una regla por defecto.

## Implementación restante tras la aprobación

1. Ratificar el [anexo BO v1 propuesto](./phase-4-policy-annex-bo-draft.md), completar subactividades y modelos de cobro, y publicar versiones comerciales firmadas sin solapamientos.
2. Unir `/api/onboarding/commercial-policy` y `evaluateProviderGovernance` al mismo diagnóstico en `publish`, `booking`, `collect_payment`, `payout` e `integrations`; la política ausente bloquea y nunca concede permisos por fallback.
3. Conectar Settings, preview y revisión documental a requisitos aplicables, evidencia aceptada, corrección y versión visible. Persistir snapshot por decisión comercial.
4. Añadir pruebas por fila de matriz y transición: borrador, publicación, hold/reserva, cobro, integración, cambio de contexto, cambio de versión y revisión manual.

**Criterio de salida de esta parte:** la misma combinación de titular, país y actividad produce el mismo diagnóstico, versión de política y bloqueo en API, interfaz y auditoría.

## Desarrollo restante: vivienda completa

El contrato de producto ya se decidió en la [investigación de Fase 4](./phase-4-research-decisions-2026-09-15.md): una vivienda física exclusiva por anuncio, dormitorios descriptivos, inventario uno y sin conversión automática desde hotel. El esquema inicial refleja ese contrato. Aún deben completarse:

- Alta guiada de producto, variante `whole_home` y recurso físico, con ubicación y contexto de cumplimiento por vivienda.
- Inventario nocturno de una unidad, bloqueo del propietario y calendario externo con exclusión mutua.
- Precio nocturno, cargos, restricciones, desglose comparable y cotización antes del hold.
- Hold, confirmación idempotente, cancelación, liberación de noches y snapshot contractual.
- Búsqueda, ficha pública y calendario de proveedor; verificación de todos los puntos de entrada.

Su criterio de salida será una vivienda creada que cotiza, se reserva y se cancela correctamente por todos los puntos de entrada. La tabla física sola no lo cumple.

## Secuencia recomendada

1. Aprobar la primera matriz de política, limitada y versionada.
2. Implementar y certificar requisitos adaptativos para hotel y tour existentes.
3. Implementar vivienda completa como iniciativa de dominio propia según el contrato decidido; certificarla antes de exponer `rental`.
