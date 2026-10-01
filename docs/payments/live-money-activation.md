# Activación de dinero real

Status: active
Document type: runbook
Owner: Finance / Engineering
Last verified: 2026-10-01
Scope: condiciones para incorporar y habilitar ejecución de dinero real
Source of truth: puertas de capacidad y adaptadores enlazados; requiere decisión formal
Review trigger: cambio de contrato o procedimiento; revisar código y evidencia antes de operar

Fastt no procesa pagos del viajero ni envía liquidaciones en la implementación actual. La verificación de una cuenta bancaria y las declaraciones históricas de cobro son datos preparatorios; ninguno concede permiso para mover dinero. El acuerdo inicial de tours se define en el [contrato económico](../domains/tours/commercial-terms.md), sin selector de capacidades no soportadas.

Antes de incorporar un ejecutor de cobro o liquidación deben cumplirse, en este orden:

1. Políticas y Finanzas aprueban el contrato, el procesador, los países, monedas, beneficiarios, reembolsos, disputas y la referencia firmada de liberación.
2. Operaciones configura `FASTT_LIVE_MONEY_APPROVAL_REFERENCE` y `FASTT_ENABLE_LIVE_MONEY_MOVEMENT=1` en el entorno objetivo. La referencia deja trazabilidad de la aprobación; una clave de Stripe o una elección del proveedor no la sustituye.
3. El proveedor completa identidad, verificación, documentos, fiscalidad y cuenta de pago aprobada. `assertProviderCapability(..., "payments")` lo vuelve a comprobar en servidor.
4. El producto pasa una política comercial publicada, vigente, firmada y aplicable a `collect_payment` o `payout`. La puerta se evalúa obligatoriamente para dinero real, incluso si el diagnóstico comercial sigue en modo sombra para publicación y reservas.
5. Se implementa y certifica el adaptador correspondiente: captura/confirmación/reembolso/chargeback para cobro; conciliación, beneficiario, idempotencia y envío para liquidación. Hasta entonces `liveMoneyExecutionInfrastructure` devuelve no disponible y bloquea ambas operaciones.

La configuración `PAYOUT_RAIL_LIVE=1` sólo puede activar la verificación bancaria ACH de Stripe si también existe la referencia aprobada. No activa una captura ni una liquidación.
