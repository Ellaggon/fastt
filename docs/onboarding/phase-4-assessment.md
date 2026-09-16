# Fase 4 — Requisitos adaptativos y expansión

**Fecha:** 15-09-2026  
**Estado:** vivienda completa implementada y certificada en Fastt Backup; fase abierta exclusivamente por la ratificación y publicación de la matriz BO v1.

Las decisiones de producto, investigación competitiva y estrategia técnica están en [Fase 4 — investigación, decisiones y estrategia de implementación](./phase-4-research-decisions-2026-09-15.md).

## Resultado de la evaluación

La Fase 4 no puede convertirse responsablemente en un cambio de etiquetas. El código actual conserva tres requisitos mínimos globales de verificación (`government_id`, `business_registration`, `tax_document`), no persiste el tipo de titular persona/empresa y no contiene una matriz aprobada de país, actividad y evidencia aceptable. Aplicar excepciones para personas naturales, países o actividades sin esos datos cambiaría controles de publicación, reservas y cobro por una regla inventada.

La vivienda completa ya tiene un contrato separado: un anuncio `whole_home`, una sola unidad vendible y recurso físico, inventario uno, capacidad, tarifa, calendario y checkout. Dormitorios y camas permanecen descriptivos, por lo que nunca se venden como habitaciones.

## Capacidades ya utilizables

| Trabajo de Fase 4 | Estado actual | Evidencia |
| --- | --- | --- |
| Negocio mixto | Disponible | El alcance de workspace separa hotel y tour; conserva la vertical seleccionada y no mezcla vocabulario operativo. |
| Herramientas profesionales según uso | Disponible | La preferencia esencial/profesional se resuelve con capacidades, rol y volumen de operación; no concede permisos. |
| Revisión y corrección documental | Disponible | Los slots de documentos muestran faltante, enviado, verificado o requiere cambios; preservan notas de rechazo y reenvío. |
| Matriz titular/país/actividad | Lista para activar después de aprobación | Perfil persistido, contrato versionado, diagnóstico y guard de servidor controlado por flag. Sigue faltando la aprobación de las versiones BO v1. |
| Vivienda completa | Disponible | `rental` usa `whole_home`, unidad exclusiva, capacidad, inventario, tarifa, búsqueda, hold, confirmación, cancelación y detalle público. |

## Decisiones conservadas

1. Se mantienen los requisitos globales actuales hasta que políticas del proveedor apruebe una matriz versionada.
2. Persona natural, empresa, país y actividad no reciben una promesa de requisito especial ni una excepción de frontend.
3. Hotel, tour y vivienda completa tienen contratos de inventario distintos; vivienda no reutiliza el modelo de habitaciones.
4. La política comercial se evalúa por producto en modo sombra y se aplica a publicación y confirmación sólo con `FASTT_ENFORCE_COMMERCIAL_POLICY=true`, tras una versión aprobada.

## Entregables necesarios para completar la fase

- Matriz versionada con: tipo de titular, país/jurisdicción, actividad, documentos/evidencias aceptadas, obligatoriedad por capacidad y responsable de revisión.
- Persistencia auditable de la declaración del titular y del contexto aplicable, incluida fecha de vigencia y versión de política.
- Evaluador único del servidor que use esa matriz para publicar, aceptar reservas, pagos e integraciones; la interfaz debe consumir su diagnóstico, nunca duplicarlo.
- Escenarios integrados por cada opción nueva: crear inventario correcto, buscar/cotizar, hold, reserva, cancelación y representación de viajero.
- Aprobación de Políticas y Finanzas antes de publicar cualquier versión comercial BO v1.

## Verificación ejecutada

`tests/unit/onboarding-phase4-boundaries.test.ts` protege las fronteras: negocio mixto conserva contexto de vertical, `rental` no se expone como activo y KYC continúa global hasta que exista política aprobada.

### Incremento implementado el 15-09-2026

- `ProviderHolderProfile` persiste persona/entidad, país del titular, residencia fiscal, país de pago y modelo de cobro. La declaración se solicita en identidad; los cambios posteriores pasan a `in_review` y generan registro de auditoría. No son una excepción KYC automática.
- El contrato de `CompliancePolicySet` distingue `casework` de `commercial` y añade tipo de titular, rol jurisdiccional, versión aprobada, capacidades, evidencia aceptada, acción y dueño de revisión. Las semillas anteriores quedan en `casework` y no pueden habilitar permisos comerciales.
- El evaluador comercial combina titular, país del producto, fiscalidad y pago. Falta, conflicto, versión sin firma o documento sin verificar producen bloqueos explícitos. `/api/onboarding/commercial-policy?productId=…` ofrece el diagnóstico autenticado por producto en modo `shadow`; la autorización vigente de publicar/reservar/cobrar sigue en `provider-governance`.
- `WholeHome` tiene exclusividad obligatoria y dormitorios/camas descriptivos. `WholeHomeUnit` vincula una única variante y recurso físico por anuncio, inventario uno y clave física única por proveedor. `rental` está activo como `whole_home`: crea la unidad, configura calendario/tarifa mediante los flujos existentes y expone detalle público con consulta, hold y confirmación.
- La cancelación canónica borra los locks de stock confirmados y rematerializa disponibilidad. La prueba integrada de reembolso verifica que la reserva cancelada queda sin locks y con cupo disponible otra vez.
- El guard comercial reutiliza el mismo diagnóstico por producto en publicar y confirmar reserva, sin alterar la autorización vigente mientras el flag esté apagado. La guía de activación y la referencia requerida están en [activación de política comercial](./phase-4-policy-activation.md).
- Las cuatro migraciones aditivas se aplicaron al tenant aislado Fastt Backup. `pnpm check` y las pruebas unitarias/UI focalizadas pasaron. La prueba autenticada hotel/tour pasó y verificó titular persistido y diagnóstico `unsupported` sin anexo.

### Puertas que todavía impiden cerrar Fase 4

1. **Política comercial aprobada.** Políticas/finanzas deben ratificar el [anexo BO v1 propuesto](./phase-4-policy-annex-bo-draft.md) o corregirlo, por titular, país, actividad y modelo de cobro, con evidencia aceptada y consecuencias para `publish`, `booking`, `collect_payment` y `payout`. Luego se publican las versiones firmadas y se certifica el flag por cohorte. No se puede inferir una licencia o excepción legal de comparables de mercado.
2. **Despliegue local.** Las migraciones están aplicadas al tenant de integración; cualquier otra base que sirva `localhost:4321` debe recibirlas antes de mostrar y guardar la nueva declaración. El API precomprueba la tabla para evitar crear un proveedor parcialmente configurado si falta el esquema.

**Conclusión de certificación:** el contrato de vivienda completa cumple su parte del criterio de salida en Fastt Backup. Fase 4 no se declara cerrada hasta recibir y registrar la ratificación de Políticas y Finanzas para BO v1 y activar sus versiones por cohorte.
