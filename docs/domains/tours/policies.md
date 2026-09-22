# Políticas comerciales de tours

Status: active  
Document type: canonical  
Owner: Tours / Pricing & Policies  
Last verified: 2026-09-22  
Scope: condiciones de tarifa, preview, asignación y publicación de tours  
Source of truth: `src/lib/policies/policy-business-contract.ts` y `src/lib/policies/policy-business-compatibility.ts`  
Related code/tests: `src/pages/api/policies/`, `src/components/policy/`, `tests/policies/`, `tests/integration/tour-policy-existing-payment-assignment.test.ts`  
Review trigger: cambio del contrato de políticas, pagos o reservas de tours  
Supersedes: auditoría de condiciones 2026-09-21 y cierres A–D

## Contrato por negocio

| Dimensión            | Alojamiento                                 | Tour                                     | Tipo desconocido |
| -------------------- | ------------------------------------------- | ---------------------------------------- | ---------------- |
| Categorías           | Cancelación, pago, llegada/salida y no-show | Cancelación, pago y no-show              | Ninguna          |
| Ancla de cancelación | Llegada                                     | Salida programada                        | No soportada     |
| Unidad nueva         | Días                                        | Horas antes de la salida                 | Ninguna          |
| Base de cancelación  | Reserva o tarifa de habitación              | Total de reserva                         | Ninguna          |
| Base de no-show      | Primera noche, total o porcentaje           | Total o porcentaje                       | Ninguna          |
| Pago                 | Pago en propiedad o prepago                 | Pago al proveedor durante la experiencia | Ninguno          |
| Fastt cobra/custodia | Según modalidad                             | No                                       | No               |

`pay_at_property` se conserva en persistencia por compatibilidad. En tours significa que el proveedor cobra durante la experiencia; Fastt no autoriza, cobra, custodia ni reembolsa fondos.

## Resolución y validación

El servidor deriva el negocio desde el destino real —producto, variante o tarifa— y aplica la misma compatibilidad a opciones, preview y asignación. Los modos `existing`, `preset` y `draft` no pueden eludirla mediante una petición directa.

Tours dispone de plantillas propias con cortes horarios. Se rechazan `CheckIn`, estadía corta/larga, cancelación sólo por días, prepago y no-show basado en primera noche. Alojamiento conserva su catálogo y semántica anterior. Un tipo nuevo falla cerrado hasta declarar contrato propio.

## Preview

El preview de tours separa:

1. resumen público de la condición;
2. escenarios antes, en y después del corte;
3. estado del cobro.

Obtiene hora de salida desde `TourSlotProfile` y zona/moneda desde `ProviderProfile`. Sin fecha o cotización autorizada muestra la información faltante o porcentajes; no fabrica importes, impuestos, cargos, noches ni reembolsos. `quotes` es `null` en el editor de tours mientras no exista una selección comercial real.

## Editor y navegación

La interfaz usa experiencia, salida y tarifa. Las categorías y opciones llegan filtradas desde servidor. El diálogo tiene nombre y descripción accesibles, cierra con Escape, devuelve el foco y conserva los datos ante errores. El enlace a salida/cupo mantiene producto, variante y tarifa.

Las preguntas operativas pertenecen al tour completo: se responden una vez por reserva, aplican a todas sus salidas y tarifas, y quedan congeladas con la reserva. Los cambios afectan reservas nuevas.

## Historial y publicación

Las reglas antiguas no se traducen automáticamente. Un corte por días requiere decisión explícita en horas; `first_night` no se convierte en total. Reservas existentes conservan sus snapshots.

Antes de publicar, `auditTourProductPolicyCompatibility` revisa las políticas efectivas de cada tarifa. Una incompatibilidad devuelve `tour_policy_compatibility_review_required` y dirige al proveedor a reemplazarla. El procedimiento está en el [runbook de reparación](../../runbooks/tour-policy-remediation.md).

## Límites vigentes

El editor no tiene participantes ni una cotización de disponibilidad; por ello no muestra un total autorizado. La paridad económica final se obtiene en el hold y checkout, que consumen el snapshot comercial congelado. La evidencia y los escenarios todavía pendientes están en las certificaciones, no en este contrato.
