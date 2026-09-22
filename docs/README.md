# Documentación de Fastt

Status: active  
Document type: index  
Owner: Engineering  
Last verified: 2026-09-22  
Scope: índice y reglas de navegación documental  
Source of truth: este índice y los índices de dominio
Review trigger: incorporación, reemplazo o retiro de una fuente documental

## Orden de lectura

1. `README.md` para stack y estructura del repositorio.
2. [Política de documentación](./DOCUMENTATION_POLICY.md) antes de crear o ampliar un Markdown.
3. El índice del dominio que corresponde a la tarea.
4. Arquitectura o contrato vigente.
5. ADR aplicable si la tarea cambia estructura o persistencia.
6. Runbook si se ejecutará una operación.
7. Certificaciones y archivo sólo para evidencia o contexto histórico.

## Fuentes vigentes

| Área                          | Entrada recomendada                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Tours                         | [Dominio Tours](./domains/tours/README.md)                                                                                      |
| ADRs de tours e integraciones | [Índice de ADRs](./engineering/adr/README.md)                                                                                   |
| Precios                       | [Arquitectura de precio efectivo](./engineering/effective-pricing-architecture.md)                                              |
| Onboarding                    | [Índice de onboarding](./onboarding/README.md)                                                                                  |
| Centro de Mando               | [Índice del Centro de Mando](./command-center/README.md)                                                                        |
| Migración Supabase            | [Estado de migración](./engineering/supabase-migration.md)                                                                      |
| Integraciones                 | [Runbook de integraciones](./engineering/provider-integration-operations-runbook.md)                                            |
| Seguridad                     | [Registro de deuda](./engineering/security-debt-register.md) y [monitorización](./engineering/dependency-monitoring-runbook.md) |
| Fiscalidad                    | [`fiscality/`](./fiscality/phase-0-contract.md)                                                                                 |
| Pagos reales                  | [Activación de dinero real](./payments/live-money-activation.md)                                                                |

## Tipos de documento

- `domains/`: comportamiento y contratos vigentes por dominio.
- `engineering/adr/`: decisiones estructurales con estado explícito.
- `runbooks/`: procedimientos repetibles, seguros y reversibles.
- `certifications/`: evidencia fechada; nunca sustituye el contrato vigente.
- `archive/`: material histórico que no debe guiar implementaciones nuevas.
- `engineering/`, `onboarding/`, `command-center/`: documentación heredada aún no migrada. Debe consultarse desde este índice y consolidarse cuando se modifique.

## Regla de mantenimiento

No crear archivos `phase-N-closeout.md` para cambios ordinarios. Actualiza el documento canónico y, si hace falta evidencia, crea una certificación fechada. Los planes terminados se eliminan después de trasladar decisiones, riesgos pendientes y comandos reproducibles.

La admisión, metadata, tamaño e indexación se validan con `pnpm run check:docs`. Las reglas
completas están en la [política de documentación](./DOCUMENTATION_POLICY.md).
