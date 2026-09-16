# Fase 0: evaluación de cumplimiento y gaps antes de continuar

Fecha: 14 de septiembre de 2026. Relacionado con el [contrato de fase 0](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-0-contract.md) y el [reporte integral](/Users/ellaggon/Projects/fastt/docs/fastt-onboarding-ux-audit-2026-09-13.md).

## Resultado de fase 0

**Fase 0 completada.** El contrato, la línea base y la paridad del evaluador con PostgreSQL aislado están certificados. La fase 1 se implementó después de esta evaluación y su resultado se documenta por separado en [phase-1-closeout.md](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-1-closeout.md); la fase 2 no se implementó.

| Entregable                      | Resultado                                   | Evidencia / límite                                                                     |
| ------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| Mapa de estados                 | Completo                                    | Separa acceso, estado persistido, preparación, habilitación y reservabilidad           |
| Casos soportados de alojamiento | Completo                                    | Hotel/habitación dentro del alcance; rental/cama/inventario combinado no prometidos    |
| Política persona/empresa        | Decisión explícita                          | Conserva reglas actuales; no inventa excepción documental para personas                |
| Razón social en incremento 1    | **Sigue obligatoria**                       | Contrato y esquema real comprobados                                                    |
| Publicar/reservar/cobrar        | Matriz documentada y contrastada en dominio | También distingue elegibilidad comercial y permisos; no afirma certificar desembolsos  |
| Regreso de viajeros/invitados   | Estrategia definida                         | Contratos de retorno actuales y cambios de fase 1 separados                            |
| Escenarios de prueba            | Entregados                                  | JSON P00–P07, pruebas nuevas y matriz de aceptación futura                             |
| Medición inicial                | Consulta completada                         | 0 eventos persistidos en 30 días; no se puede estimar conversión                       |
| Paridad documento/servidor      | Completa                                    | Evaluador real coincide en almacenamiento controlado y en PostgreSQL aislado (P00–P07) |

### Pruebas realizadas

- `tests/unit/onboarding-phase0-governance.test.ts`: **10 aprobadas**. Ocho escenarios del JSON, separación entre capacidad y permisos de staff, y proveedor inexistente. Usa el evaluador real y sus helpers; sustituye únicamente almacenamiento. No certifica filtros/joins SQL ni endpoint HTTP.
- `tests/unit/onboarding-phase0-product.test.ts`: **7 aprobadas**. Hotel y tour preparados, bloqueo canónico adicional, elegibilidad de producción y nombres obligatorios. Caso de uso real con repositorio controlado. No certifica cálculos comerciales SQL ni reservas reales.
- `tests/catalog/product-publication-eligibility.test.ts`, `tests/ui/provider-invitation-auth-continuity.test.ts`, `tests/auth/password-recovery-redirect.test.ts`, `tests/ui/provider-settings-funnel-queryable.test.ts`: **9 aprobadas en conjunto**. Alcance propio de esos tests; no sustituyen recorrido autenticado con navegador.
- `tests/integration/onboarding-phase0-contract.test.ts`: **9 aprobadas**. Ocho escenarios P00–P07 contra Fastt Backup restaurado y una validación de nombres obligatorios. Usa `.env.test`, fingerprint esperado y fixtures con prefijo `onboarding_p0_`.

Total de la batería declarada: **35 pruebas aprobadas** (26 sin conexión SQL y 9 de integración PostgreSQL).

### Comandos reproducibles

```sh
FASTT_DATA_ENV=test pnpm exec vitest run tests/unit/onboarding-phase0-governance.test.ts tests/unit/onboarding-phase0-product.test.ts tests/catalog/product-publication-eligibility.test.ts tests/ui/provider-invitation-auth-continuity.test.ts tests/auth/password-recovery-redirect.test.ts tests/ui/provider-settings-funnel-queryable.test.ts
FASTT_DATA_ENV=test pnpm exec vitest run tests/integration/onboarding-phase0-contract.test.ts
```

La suite usa el setup de aislamiento existente: `.env.test`, `FASTT_TEST_DATABASE_URL`, fingerprint esperado y exclusión de bases de producción. No se modificaron esos valores ni se utilizó la conexión operativa para suplir la base de tests.

## Límites documentados para fases posteriores

| ID    | Gap                                         | Impacto                                               | Acción concreta                                                  |
| ----- | ------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| F0-02 | No hay cobertura de funnel de activación    | No existe una tasa inicial comparable                 | Implement                                                        |
| F0-03 | La nueva política persona/empresa no existe | No se puede prometer activación documental adaptativa | Mantener D02 en incremento 1; definir y validar matriz en fase 4 |

F0-01 está resuelto: se reanudó el proyecto aislado Fastt Backup y los nueve casos de integración aprobaron el 14-09-2026. F0-02 no incumple el requisito condicional “si existe volumen suficiente”: la consulta y la evaluación de cobertura sí se realizaron. F0-03 es un límite explícito del alcance, no un pendiente oculto que fase 1 deba resolver mediante un campo opcional.

### Hallazgos que amplían la precisión del reporte original

1. Publicación también exige clasificación de producción y propósito comercial. Fase 1 debe mostrar ese motivo si aplica; no reclasificar datos por completar formularios.
2. Las comprobaciones base de producto y las del resolvedor canónico se acumulan. No reducir el futuro diagnóstico al porcentaje de la vista previa.
3. Habilitación de proveedor no equivale a autorización de actor. El endpoint de publicación inspeccionado no tiene una restricción específica owner/admin; no prometerla en el contrato sin implementarla.
4. Evaluar un producto puede escribir su estado. Las auditorías de sólo lectura no deben llamar a ese endpoint ni a gobernanza con `persist=true`.

## Evaluación solicitada de fase 2

El usuario pidió ejecutar fase 0 y después analizar si se cumplió la fase 2. Se evalúan ambas por separado para conservar el orden del programa.

**La fase 2 no está cumplida.** Las bases de wizard y datos de producto ya existían, pero los siguientes criterios no quedaron implementados ni certificados en esta ejecución:

| Criterio de fase 2                                      | Estado contrastado                                    | Gap antes de declarar cumplimiento                                              |
| ------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| Separar shell guiado de WorkspaceLayout                 | Pendiente                                             | PlaybookLayout sigue utilizando WorkspaceLayout                                 |
| Agrupar pasos en etapas coherentes                      | Pendiente                                             | Definiciones de once pasos existentes; no se implementó la agrupación propuesta |
| Guardar y continuar unificados                          | Pendiente de implementación/verificación global       | No hay cambio que garantice persistencia antes de cada navegación               |
| Sesión persistente del recorrido                        | Pendiente                                             | `sessionStorage` de formulario no resuelve reanudación entre dispositivos       |
| Conservar producto/variante/tarifa al retomar           | Parcial en rutas actuales, sin certificación integral | Falta recuperación basada en estado persistido del recorrido                    |
| Vocabulario y enlaces propios de tours                  | Pendiente                                             | Hallazgos del dashboard/preview siguen en el backlog                            |
| Móvil y accesibilidad                                   | Sin certificar                                        | No se ejecutó recorrido de teclado/móvil autenticado                            |
| Completar borrador hotel y tour, salir y reautenticarse | Sin certificar                                        | No se ejecutó E2E de ese recorrido                                              |
| Ausencia de duplicados por reintento                    | Sin certificar                                        | Requiere prueba de persistencia/concurrencia y continuidad                      |
| Deep links y retroceso                                  | Sin certificar                                        | Pruebas de auth existentes no equivalen al recorrido de creación completo       |

## Decisión de avance

No anunciar que fase 2 está hecha ni iniciar su implementación por interpretar esta petición como autorización de todas las fases. La siguiente fase del plan es la **fase 1**, usando el contrato ya certificado.

La documentación permite continuar con fase 1 y fase 2 según el plan. Los límites de onboarding identificados no se ocultan bajo una declaración de “fase completada”.
