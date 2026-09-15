# Fase 4 — Requisitos adaptativos y expansión

**Fecha:** 15-09-2026  
**Estado:** implementación inicial certificada en Fastt Backup; fase aún abierta por anexos aprobados y vertical de vivienda reservable.

Las decisiones de producto, investigación competitiva y estrategia técnica están en [Fase 4 — investigación, decisiones y estrategia de implementación](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-4-research-decisions-2026-09-15.md).

## Resultado de la evaluación

La Fase 4 no puede convertirse responsablemente en un cambio de etiquetas. El código actual conserva tres requisitos mínimos globales de verificación (`government_id`, `business_registration`, `tax_document`), no persiste el tipo de titular persona/empresa y no contiene una matriz aprobada de país, actividad y evidencia aceptable. Aplicar excepciones para personas naturales, países o actividades sin esos datos cambiaría controles de publicación, reservas y cobro por una regla inventada.

También se confirmó que `rental` sigue en estado `planned`: no tiene `productType`, variante vendible, inventario, búsqueda pública, cotización ni checkout propios. Activarlo como “vivienda completa” sería una etiqueta sin un contrato comercial y provocaría inventario incorrecto frente a habitaciones.

## Capacidades ya utilizables

| Trabajo de Fase 4 | Estado actual | Evidencia |
| --- | --- | --- |
| Negocio mixto | Disponible | El alcance de workspace separa hotel y tour; conserva la vertical seleccionada y no mezcla vocabulario operativo. |
| Herramientas profesionales según uso | Disponible | La preferencia esencial/profesional se resuelve con capacidades, rol y volumen de operación; no concede permisos. |
| Revisión y corrección documental | Disponible | Los slots de documentos muestran faltante, enviado, verificado o requiere cambios; preservan notas de rechazo y reenvío. |
| Matriz titular/país/actividad | Contrato definido; anexos pendientes | Se decidió declaración explícita, capacidad independiente y política versionada. No hay perfil persistido ni anexos jurisdiccionales aprobados. |
| Vivienda completa | En hoja de ruta; sin activar | Contrato de unidad única, dormitorios descriptivos e inventario exclusivo definido. Registro `rental` aún planeado. |

## Decisiones conservadas

1. Se mantienen los requisitos globales actuales hasta que políticas del proveedor apruebe una matriz versionada.
2. Persona natural, empresa, país y actividad no reciben una promesa de requisito especial ni una excepción de frontend.
3. Hotel y tour siguen siendo las únicas verticales que se pueden crear y vender de punta a punta hoy.
4. Vivienda completa entra en la hoja de ruta como iniciativa de dominio separada: unidad completa de inventario uno, dormitorios descriptivos, precio, restricciones, hold, reserva, cancelación y superficies de viajero/proveedor.

## Entregables necesarios para completar la fase

- Matriz versionada con: tipo de titular, país/jurisdicción, actividad, documentos/evidencias aceptadas, obligatoriedad por capacidad y responsable de revisión.
- Persistencia auditable de la declaración del titular y del contexto aplicable, incluida fecha de vigencia y versión de política.
- Evaluador único del servidor que use esa matriz para publicar, aceptar reservas, pagos e integraciones; la interfaz debe consumir su diagnóstico, nunca duplicarlo.
- Escenarios integrados por cada opción nueva: crear inventario correcto, buscar/cotizar, hold, reserva, cancelación y representación de viajero.
- ADR y diseño del dominio de vivienda completa antes de habilitar `rental`.

## Verificación ejecutada

`tests/unit/onboarding-phase4-boundaries.test.ts` protege las fronteras: negocio mixto conserva contexto de vertical, `rental` no se expone como activo y KYC continúa global hasta que exista política aprobada.

### Incremento implementado el 15-09-2026

- `ProviderHolderProfile` persiste persona/entidad, país del titular, residencia fiscal, país de pago y modelo de cobro. La declaración se solicita en identidad; los cambios posteriores pasan a `in_review` y generan registro de auditoría. No son una excepción KYC automática.
- El contrato de `CompliancePolicySet` distingue `casework` de `commercial` y añade tipo de titular, rol jurisdiccional, versión aprobada, capacidades, evidencia aceptada, acción y dueño de revisión. Las semillas anteriores quedan en `casework` y no pueden habilitar permisos comerciales.
- El evaluador comercial combina titular, país del producto, fiscalidad y pago. Falta, conflicto, versión sin firma o documento sin verificar producen bloqueos explícitos. `/api/onboarding/commercial-policy?productId=…` ofrece el diagnóstico autenticado por producto en modo `shadow`; la autorización vigente de publicar/reservar/cobrar sigue en `provider-governance`.
- `WholeHome` inicia un agregado físico separado con exclusividad obligatoria y dormitorios/camas descriptivos. `WholeHomeUnit` reserva una única variante y recurso físico por anuncio, inventario 1 y clave física única por proveedor. Una prueba integrada en Fastt Backup creó dos anuncios, enlazó el primero y rechazó la segunda unidad con la misma clave física. `rental` permanece `planned`; no se ofrece una vivienda falsa mediante un cambio de etiqueta.
- Las cuatro migraciones aditivas se aplicaron al tenant aislado Fastt Backup. `pnpm check` y las pruebas unitarias/UI focalizadas pasaron. La prueba autenticada hotel/tour pasó y verificó titular persistido y diagnóstico `unsupported` sin anexo.

### Puertas que todavía impiden cerrar Fase 4

1. **Política comercial aprobada.** Políticas/finanzas deben ratificar el [anexo BO v1 propuesto](./phase-4-policy-annex-bo-draft.md) o corregirlo, por titular, país, actividad y modelo de cobro, con evidencia aceptada y consecuencias para `publish`, `booking`, `collect_payment` y `payout`. El equipo técnico debe publicar esas versiones, unir el diagnóstico a todos los puntos de autorización y probar una misma respuesta en interfaz y servidor. No se puede asumir una licencia o excepción legal a partir de Airbnb/Expedia.
2. **Vivienda vendible.** Faltan unidad física y recurso compartido de inventario 1, precio nocturno y cargos, bloqueo externo, búsqueda/cotización, hold/confirmación/cancelación, condiciones snapshot y detalle público. Sólo entonces se puede activar `rental` y ejecutar la prueba integrada de reserva y liberación.
3. **Despliegue local.** Las migraciones están aplicadas al tenant de integración; cualquier otra base que sirva `localhost:4321` debe recibirlas antes de mostrar y guardar la nueva declaración. El API precomprueba la tabla para evitar crear un proveedor parcialmente configurado si falta el esquema.

**Conclusión de certificación:** el incremento es seguro y probado en el tenant aislado, pero el criterio de salida de Fase 4 no está cumplido. No se declara cerrada ni se activan nuevas capacidades o vivienda completa.
