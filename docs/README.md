# Documentación de Fastt

Status: active  
Document type: index  
Owner: Engineering  
Last verified: 2026-10-01
Scope: índice y reglas de navegación documental  
Source of truth: este índice y los índices de dominio
Review trigger: incorporación, reemplazo o retiro de una fuente documental

## Orden de lectura

1. `README.md` para stack y estructura del repositorio.
2. [Política de documentación](./DOCUMENTATION_POLICY.md):
   léela al crear o ampliar Markdown.
3. El índice del dominio que corresponde a la tarea.
4. Arquitectura o contrato vigente.
5. ADR aplicable si la tarea cambia estructura o persistencia.
6. Runbook si se ejecutará una operación.
7. Certificaciones y archivo sólo para evidencia o contexto histórico.

## Fuentes vigentes

| Área                          | Entrada recomendada                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tours                         | [Dominio Tours](./domains/tours/README.md)                                                                                                                                                                                           |
| Alojamiento                   | [Dominio Alojamiento](./domains/lodging/README.md)                                                                                                                                                                                   |
| ADRs de tours e integraciones | [Índice de ADRs](./engineering/adr/README.md)                                                                                                                                                                                        |
| Precios                       | [Arquitectura de precio efectivo](./engineering/effective-pricing-architecture.md)                                                                                                                                                   |
| Onboarding                    | [Índice de onboarding](./onboarding/README.md)                                                                                                                                                                                       |
| Centro de Mando               | [Índice del Centro de Mando](./command-center/README.md)                                                                                                                                                                             |
| PostgreSQL                    | [Operación PostgreSQL](./engineering/supabase-migration.md)                                                                                                                                                                          |
| Integraciones                 | [Runbook de integraciones](./engineering/provider-integration-operations-runbook.md) y [validación UX](./provider-integrations-ux-validation.md)                                                                                     |
| Seguridad                     | [Registro de deuda](./engineering/security-debt-register.md) y [monitorización](./engineering/dependency-monitoring-runbook.md)                                                                                                      |
| Fiscalidad                    | [Contrato de fiscalidad](./fiscality/phase-0-contract.md), [procedimiento de certificación](./fiscality/phase-10-certification.md) y [auditoría de modos heredados](./certifications/fiscality/legacy-invoicing-modes-2026-09-28.md) |
| Pagos reales                  | [Activación de dinero real](./payments/live-money-activation.md) y [certificación financiera transversal](./certifications/financial/booking-payment-commission-cancellation-2026-09-28.md)                                          |

## Contratos técnicos transversales

- UI: [sistema de diseño](./design-system-governance.md) y
  [playbooks](./engineering/playbook-contract.md).
- Formularios con pestañas: [navegación local y conservación de
  contexto](./domains/ui/local-workspace-tabs.md).
- Datos: [aislamiento de fixtures](./engineering/marketplace-data-isolation.md),
  [geografía](./engineering/marketplace-geography-migration.md) y
  [propiedad del proveedor](./engineering/provider-settings-table-taxonomy.md).
- Operación:
  [navegación administrativa](./engineering/backoffice-governance-baseline.md),
  [Rooms & Rates](./engineering/rooms-rates-table-taxonomy.md),
  [rendimiento](./performance-observability.md) y
  [guardrails PostgreSQL](./engineering/db-surface-risk-analysis.md).

Abrir sólo la fuente correspondiente a la tarea.
Un contrato grande se consulta por sección; no implica leer todo el repo.

## Tipos de documento

- `domains/`: comportamiento y contratos vigentes por dominio.
- `engineering/adr/`: decisiones estructurales con estado explícito.
- `runbooks/`: procedimientos repetibles, seguros y reversibles.
- `certifications/`: evidencia fechada; nunca sustituye el contrato vigente.
- `archive/`: material histórico que no debe guiar implementaciones nuevas.
- `engineering/`, `onboarding/`, `command-center/`: heredada aún no migrada.
  Consúltala desde este índice y consolídala al modificarla.

## Regla de mantenimiento

No crear archivos `phase-N-closeout.md` para cambios ordinarios.
Actualiza el documento canónico y, si hace falta evidencia, crea certificación
fechada.
Elimina planes terminados tras trasladar decisiones, riesgos pendientes y
comandos reproducibles.

La admisión, metadata, tamaño e indexación se validan con `pnpm run check:docs`.
Las reglas completas están en la
[política de documentación](./DOCUMENTATION_POLICY.md).

`Last verified` indica la última revisión documental.
No acredita despliegue, prueba o aprobación comercial.
Requiere evidencia fechada con entorno y alcance.
Los nombres heredados `phase-*` se conservan si el contenido es contrato o
procedimiento vigente; no un cierre de sesión.
