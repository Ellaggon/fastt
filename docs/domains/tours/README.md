# Dominio Tours

Status: active  
Document type: index  
Owner: Tours / Engineering  
Last verified: 2026-09-26
Scope: descubrimiento, ficha, reserva y operación del proveedor
Source of truth: documentos canónicos enlazados en este índice  
Review trigger: cambio del contrato o de las superficies públicas y del proveedor de tours

## Leer primero

- [Políticas comerciales de tours](./policies.md): contrato, editor, preview y compatibilidad histórica.
- [Acuerdo económico inicial](./commercial-terms.md): propuesta de cobro directo, comisión, base, devengo y cancelaciones; pendiente de aceptación.
- [Matriz comercial BO v1](./policy-annex.md): borrador sin firma. No exige documentos nuevos hasta que Políticas, Finanzas y Operaciones Tours la ratifiquen.
- [Playbooks del proveedor](./tour-provider-playbooks.md): especificación ideal de los cuatro recorridos guiados, etapas, diagnóstico compartido e interfaz.
- [Taxonomía de datos](../../engineering/tour-vertical-table-taxonomy.md): Product → Variant/tour_slot → RatePlan → inventario → reserva.
- [ADRs de Tours](../../engineering/adr/README.md): capacidades diferidas y expansiones de esquema.
- [Rollout canary](../../engineering/tours-rollout-canary.md): habilitación gradual.

## Operación y evidencia

- [Reparación de políticas incompatibles](../../runbooks/tour-policy-remediation.md).
- [Certificación de políticas](../../certifications/tours/policies-2026-09-21.md).
- [Certificación de ficha y checkout](../../certifications/tours/booking-flow-2026-09.md).
- [Certificación de verificación por línea](../../certifications/verification/line-gates-2026-09-26.md).
- [Auditoría de modos fiscales heredados](../../certifications/fiscality/legacy-invoicing-modes-2026-09-28.md): datos de producción clasificados sin mutar reservas.
- [Certificación financiera transversal](../../certifications/financial/booking-payment-commission-cancellation-2026-09-28.md): evidencia parcial de reserva, conciliación y cancelación; no certifica cobro real ni comisión aceptada.

Las certificaciones describen qué se probó en una fecha. Los documentos de este directorio definen el comportamiento vigente.
