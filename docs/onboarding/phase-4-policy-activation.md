# Activación controlada de la política comercial BO v1

Status: active
Document type: runbook
Owner: Provider Policy / Finance / Tours
Last verified: 2026-09-28
Scope: ratificación, activación controlada y reversión de políticas comerciales de tours BO v1
Source of truth: `CompliancePolicyVersion`, `CommercialPolicyApproval` y la [matriz BO v1](../domains/tours/policy-annex.md)
Related code/tests: `src/lib/commercial-policy/ratification.ts`, `src/pages/api/admin/commercial-policies/[versionId]/approvals.ts`, `db/migrations/2026-11-08_commercial_tour_policy_ratification.sql`, `tests/unit/commercial-policy-evaluate.test.ts`
Review trigger: incorporación de revisores, firma de una versión, cambio regulatorio o cambio de la modalidad de cobro

La matriz BO v1 sigue siendo un borrador hasta que **Políticas**, **Finanzas** y **Operaciones Tours** aprueben cada combinación de titular, jurisdicción, actividad y modelo de cobro. Este documento no sustituye esa aprobación. Las reglas de alojamiento que ya están en producción viven en el [anexo de alojamiento](../domains/lodging/policy-annex.md) y no se activan por esta cohorte.

## Decisión de producto implementada

- Las combinaciones se guardan versionadas por rol de jurisdicción (`holder`, `product`, `tax`, `payout`), titular, país, vertical y modelo de cobro.
- Sólo una versión `published`, vigente y firmada con `approvedBy`, `approvedAt` y `approvalReference` puede habilitar una capacidad.
- El diagnóstico está disponible en `GET /api/onboarding/commercial-policy?productId=...` y continúa en modo sombra por defecto.
- La aplicación de publicación y confirmación requiere el kill switch `FASTT_ENFORCE_COMMERCIAL_POLICY=true` **y** una cohorte explícita. Si la etapa no se declara, queda en `off`; desplegar código no cambia autorizaciones históricas.
- La evidencia sin alcance registrado se conserva como histórica y no satisface un requisito de producto. Una versión firmada puede declarar `evidenceScope: "provider"` sólo para una evidencia realmente global; la omisión exige alcance explícito de producto u operación.

## Aprobación requerida

Por cada una de las combinaciones BO v1, Políticas, Finanzas y Operaciones Tours deben registrar:

1. Evidencia aceptada, obligatoriedad, propietario de revisión y acción correctiva.
2. Capacidades afectadas: publicar, reservar, cobrar, pagar e integrar.
3. Fecha de inicio, fecha de término si aplica, responsable que aprueba y referencia del expediente.
4. Criterio de revisión para cambios de titular, país, actividad y modelo de cobro.

La referencia no es opcional. El SIN distingue requisitos de registro según persona natural y jurídica, y asocia la actividad declarada con el registro tributario; por ello Fastt no infiere reglas regulatorias desde una etiqueta de producto. Las fuentes operativas son las guías vigentes del SIN y deben revisarse antes de publicar una versión: [persona natural](https://siatinfo.impuestos.gob.bo/index.php/requisitos-para-la-inscripcion/requisitos-para-obtener-el-nit-para-personas), [persona jurídica](https://siatanexo.impuestos.gob.bo/index.php/requisitos-para-la-inscripcion/procedimientos-y-requisitos-para-obtener-el-nit-para-personas-juridicas) y [actividades económicas](https://siatinfo.impuestos.gob.bo/index.php/actividades-economicas).

## Operación mientras haya una sola persona

La decisión vigente es conservar BO v1 en `draft` mientras Fastt opere con una sola persona.
Esa persona puede preparar la versión, reunir fuentes, definir reglas y ejecutar el diagnóstico en
modo sombra, pero no puede ratificarla ni publicarla por sí misma. La ratificación exige tres
identidades distintas, con permisos separados para `policy`, `finance` y `tour_operations`; el
modelo rechaza que un mismo usuario firme dos áreas de una versión.

No se crean cuentas, roles ni referencias ficticias para completar la separación. Cuando haya
capacidad de revisión, se deben designar tres personas concretas —internas o asesoras con mandato
verificable—, asignarles sólo el permiso de su área y registrar su referencia de expediente. Hasta
entonces no se piden documentos nuevos de tours por esta matriz ni se habilitan capacidades nuevas
por una firma parcial. Las reglas vigentes de alojamiento y las reservas ya confirmadas permanecen
sin cambios.

## Secuencia de activación

1. Aplicar las migraciones de `ProviderHolderProfile` y contrato comercial a la base que atiende el entorno objetivo.
2. Cargar las versiones aprobadas y verificar el diagnóstico de una muestra de proveedores sin activar el flag.
3. Activar el flag en un entorno de pruebas y certificar publicar y confirmar reserva para cada combinación aprobada.
4. Ejecutar `pnpm audit:commercial-evidence-migration` contra el entorno objetivo. Es sólo lectura y clasifica evidencia como histórica genérica, pendiente, vencida o con alcance que aún requiere coincidencia de política. Para producción se exige `FASTT_DATA_ENV=production` y `FASTT_AUDIT_DATABASE_FINGERPRINT` con el fingerprint esperado; el informe devuelve el fingerprint efectivo y rechaza una conexión que no coincida. Así no puede confundirse un inventario de pruebas con uno operativo.
5. Activar por cohorte, en este orden: `staging`, `allowlist`, `percentage`, `general`. Si el diagnóstico difiere de la autorización actual, volver a `off`, conservar el inventario y corregir la política o la evidencia; nunca editar aprobaciones históricas para hacerlas encajar.

## Configuración de cohorte

| Variable | Uso |
| --- | --- |
| `FASTT_ENFORCE_COMMERCIAL_POLICY` | Kill switch. Debe ser `true` para considerar cualquier cohorte. |
| `FASTT_COMMERCIAL_POLICY_ROLLOUT_STAGE` | `off`, `staging`, `allowlist`, `percentage` o `general`. El valor por defecto es `off`. |
| `FASTT_COMMERCIAL_POLICY_STAGING_HOSTS` | Hosts separados por coma admitidos durante `staging`. |
| `FASTT_COMMERCIAL_POLICY_DEPLOYMENT_ENV` | Si vale `staging`, la etapa `staging` también queda admitida aunque el host no esté en la lista. |
| `FASTT_COMMERCIAL_POLICY_PROVIDER_ALLOWLIST` | IDs de proveedor separados por coma que forman el canary inicial. |
| `FASTT_COMMERCIAL_POLICY_ROLLOUT_PERCENT` | Porcentaje estable posterior al allowlist. |
| `FASTT_AUDIT_DATABASE_FINGERPRINT` | Sólo para auditorías de producción: fingerprint esperado de la base objetivo; evita certificar por error una base de pruebas. |

La certificación de cada cohorte debe incluir un proveedor sólo hotel, uno sólo tour y uno mixto.
La decisión se calcula en servidor con el ID del proveedor; ni cabeceras ni parámetros de URL pueden
activar el contrato. Los tours mantienen su puerta comercial estricta ya existente mientras la cohorte
amplía el contrato a las demás ofertas.

## Contexto y transición que deben conservarse

El titular se declara explícitamente como persona o entidad; no se deduce del nombre,
correo ni volumen. Nombre público y nombre legal tienen fines distintos. País del titular,
residencia fiscal, país del producto y beneficiario se evalúan según su función.
La modalidad de cobro se declara por línea comercial en `ProviderCommercialLine`;
una línea nueva no hereda permisos ni modalidad de otra. El valor histórico de la cuenta
no autoriza automáticamente una línea.

Cambiar titular, jurisdicción, actividad o cobro exige reevaluar las capacidades afectadas.
`not_applicable` proviene del diagnóstico, nunca de una elección libre de la interfaz.
Las semillas de gestión de casos no son una ratificación comercial. La versión y el
snapshot contractual de reservas anteriores deben conservarse.

Este runbook consolida los antiguos planes `phase-4-assessment.md`,
`phase-4-closure-plan.md` y `phase-4-research-decisions-2026-09-15.md`.
El contrato particular de vivienda está en el [anexo de alojamiento](../domains/lodging/policy-annex.md).
La firma real, la evidencia aplicable y la certificación por entorno siguen siendo puertas
operativas: eliminar los planes duplicados no las declara cumplidas.
