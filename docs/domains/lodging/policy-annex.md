# Anexo de alojamiento — reglas en producción

Status: active  
Document type: canonical  
Owner: Provider Policy  
Last verified: 2026-09-26  
Scope: identificador, paquete y anexo de la línea de alojamiento; no cubre tours  
Source of truth: `src/lib/verification/line-gate.ts` y `src/lib/verification/policy-annex.ts`  
Related code/tests: `src/lib/verification/requirement-resolver.ts`, `tests/unit/verification-policy-annex.test.ts`, `tests/unit/verification-line-gate.test.ts`  
Review trigger: cambio de un control de alojamiento en producción, o alta de otra línea comercial

Este anexo es el dueño de la línea `lodging`, con identificador `annex.lodging.production`.
Hotel, vivienda completa y alquiler usan este identificador, este paquete y este anexo. No se
edita la matriz de tours para cambiar una regla de alojamiento.

## Qué ya exige producción

La puerta de publicación y reserva de un producto de alojamiento exige la capa compartida y,
además, el paquete de esta línea. Un faltante de guía, seguro o permiso de una experiencia no
entra aquí.

| Regla | Cuándo aplica | Evidencia que ya se comprueba | Si falta |
| --- | --- | --- | --- |
| Nombre legal | Siempre | Nombre legal y nombre comercial | No se publica ni se reserva |
| Operación | Siempre | Zona horaria, moneda y correo de soporte | No se publica ni se reserva |
| Cuenta revisada | Siempre | Cuenta aprobada | No se publica ni se reserva |
| NIT | Siempre, en esta puerta | Registro fiscal verificado | No se publica ni se reserva |
| Equipo | Siempre | Un owner o un admin | No se publica ni se reserva |
| Documento de identidad | Siempre | `government_id` verificado | No se publica ni se reserva |
| Registro de la entidad | Solo si el titular es `entidad` | `business_registration` verificado | No se publica ni se reserva. Una persona natural no lo presenta |
| Cuenta de liquidación | Solo `platform_collect` | Cuenta de pagos verificada | No se publica ni se reserva. En cobro directo no cuenta |
| Titularidad del inmueble | Línea de alojamiento | `ownership_proof` verificado para el producto | Bloquea ese alojamiento. No bloquea un tour |
| Licencia del establecimiento | Línea de alojamiento | `operating_license` verificado para el producto | Bloquea ese alojamiento. No sustituye la credencial de un guía |

La ficha del producto (fotos, habitaciones, ubicación, políticas de reserva) sigue en su propia
puerta de contenido. Este anexo no la reescribe.

## Qué no pertenece a esta línea

No se exigen credencial de guía, habilitación de operador, seguro de actividad, permiso de área
ni manipulación de alimentos. Esos controles, cuando existan, viven en el [anexo de tours](../tours/policy-annex.md), que sigue sin firma.

`package` y `limousine` no usan este anexo ni el de tours. Una línea nueva necesita su propio
identificador, su propio paquete y su propio anexo.

## Cómo se cambia

1. Se actualiza este anexo y la puerta de la línea en el mismo cambio.
2. No se agrega la regla a la matriz de tours ni se espera la firma de ese anexo.
3. La política comercial versionada de tours sigue en sombra hasta su propia firma. Este anexo
   no publica una `CompliancePolicyVersion`.

La licencia de operación sigue guardándose en un solo tipo de archivo. Un archivo sin alcance de
producto, persona, territorio o actividad no habilita el establecimiento ni la credencial de un
tour. El alcance es lo que separa las dos líneas.

## Vivienda completa: límite del producto

El contrato inicial de `whole_home` vende una vivienda física exclusiva por anuncio, con
una variante y recurso físico de inventario uno. Dormitorios, camas y baños son descriptivos;
no crean unidades vendibles. No convertir automáticamente hoteles ni vender simultáneamente
la vivienda y sus habitaciones. Una conversión requiere revisar reservas y recursos existentes.

Precio nocturno, cargos, políticas y disponibilidad deben coincidir desde búsqueda hasta
snapshot de reserva. Confirmación idempotente y cancelación conservan el contrato y liberan
el inventario correspondiente. Consultar `src/lib/whole-home/unit-contract.ts`,
`tests/unit/whole-home-unit-contract.test.ts` y
`tests/integration/whole-home-physical-unit.test.ts` antes de ampliar el modelo.

Decisión conservada de la investigación de onboarding del 15-09-2026; no implica una
certificación nueva de despliegue o de recorrido público.
