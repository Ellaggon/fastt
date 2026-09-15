# Anexo comercial BO v1 — propuesta para revisión de políticas y finanzas

**Estado:** borrador, no aprobado ni sembrado en `CompliancePolicyVersion`.  
**Ámbito propuesto:** titular residente/constituido en Bolivia, producto ubicado en Bolivia, actividades `hotel` y `tour`. Vivienda completa queda fuera hasta certificación de dominio. Una cuenta con titular, fiscalidad o pago en otro país exige anexos adicionales; no se permite wildcard.

## Decisiones que debe ratificar el responsable

1. Confirmar si el proveedor puede ser persona natural o entidad en cada actividad y qué documento acredita la operación comercial de una persona natural. El control actual exige `business_registration` a ambos; **esta propuesta lo conserva** hasta que exista una decisión firmada que permita otra evidencia. La etiqueta persona natural no crea una exención.
2. Confirmar si Fastt puede cobrar al viajero (`platform_collect`) en este ámbito, bajo qué contrato/procesador y con qué revisión. Hasta confirmarlo, ese modelo devuelve `policy_context_unsupported` para `collect_payment` y `payout`.
3. Confirmar los documentos fiscales y de actividad aceptados, su emisor, vencimiento, revisión y visibilidad de número de licencia para hotel/tour por localidad o subactividad. No se agrega una licencia universal de tour o alojamiento sin referencia validada.
4. Confirmar tratamiento ante falta de datos fiscales: bloquear payout, retención autorizada o revisión manual. Esta propuesta **no calcula retenciones**.

## Matriz funcional conservadora propuesta

| Contexto | Requisito/evidencia hoy comprobable | Capacidad afectada | Responsable de revisión | Resultado sin evidencia |
| --- | --- | --- | --- | --- |
| Persona natural o entidad, hotel/tour BO | Nombre legal + nombre comercial; titular y país declarados | `publish`, `booking`, integraciones | Verificación | Preparación permitida, capacidad bloqueada |
| Ambos titulares | `ProviderVerification=approved` | `publish`, `booking`, pagos, integraciones | Verificación | Bloqueo con enlace a verificación |
| Ambos titulares | `government_id=verified`, `business_registration=verified`, `tax_document=verified` o puente fiscal verificado cuando proceda | Pagos e integraciones según controles vigentes | Verificación/fiscalidad | Bloqueo; persona natural no obtiene excepción |
| Ambos titulares | `ProviderTaxConfiguration=verified` | `publish`, `booking`, pagos | Fiscalidad | Bloqueo con enlace a fiscalidad |
| Ambos titulares | Cuenta de pago `verified` | `payout`; cobro según contrato separado | Pagos | Payout bloqueado |
| Hotel BO | Condiciones, inventario, precio, ubicación y contenido certificados por producto | `publish`, `booking` | Operaciones de alojamiento | Bloqueo local de ese hotel |
| Tour BO | Salida futura, cupo, tarifa y condiciones certificados por producto | `publish`, `booking` | Operaciones de tours | Bloqueo local de ese tour |
| `platform_collect` | Contrato/procesador/beneficiario aprobado, todavía sin anexo | `collect_payment`, `payout` | Finanzas/políticas | `policy_context_unsupported` |
| `property_collect` | Confirmación contractual de que el proveedor cobra; payout Fastt sólo si aplica | `collect_payment`, `payout` | Finanzas/políticas | No inferir capacidad de payout a partir de reserva |

Esta matriz es una propuesta técnica basada en los controles **ya implementados**, no una afirmación sobre derecho boliviano. No basta para publicar cuatro versiones comerciales (titular×actividad×modelo): cada combinación y rol jurisdiccional necesita una versión vigente con `approvedBy`, `approvedAt`, `approvalReference`, evidencias admitidas, capacidad afectada y acción. Las versiones pueden compartir requisitos, pero deben tener aprobación explícita y no solaparse.

## Certificación previa a publicar

- Probar persona y entidad para hotel y tour con evidencia faltante, enviada, revisada, rechazada, vencida y corregida; verificar el mismo diagnóstico en UI y servidor.
- Probar titular BO con producto en otro país, fiscalidad fuera de BO y cuenta de pago fuera de BO: cada combinación sin anexo queda bloqueada explícitamente.
- Comparar evaluador nuevo en modo shadow con gobernanza actual; toda diferencia que conceda capacidad requiere aprobación y prueba de publicación, hold, confirmación, cobro y payout.
- Cambiar declaración o país reabre revisión, registra auditoría y no modifica reservas ya confirmadas sin snapshot y procedimiento operativo.

**Firmas requeridas para pasar a `published`:** responsable de políticas del proveedor y responsable de finanzas/cobro, con referencia documental y fecha de vigencia. El equipo de ingeniería puede cargar, probar y activar versiones aprobadas; no puede sustituir la validación normativa por documentación de Airbnb o Expedia.
