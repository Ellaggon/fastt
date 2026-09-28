# Matriz comercial BO v1 — tours

Status: draft
Document type: canonical
Owner: Provider Policy / Finance / Tours
Last verified: 2026-09-26
Scope: requisitos comerciales y operativos aplicables a tours ubicados en Bolivia
Source of truth: versiones firmadas de `CompliancePolicyVersion`; normativa y expedientes enlazados abajo
Related code/tests: `src/lib/commercial-policy/`, `src/lib/provider-documents.ts`, `src/lib/provider-document-validity.ts`, `tests/unit/commercial-policy-evaluate.test.ts`, `tests/unit/provider-document-evidence.test.ts`, `tests/ui/provider-document-renewal.test.ts`
Review trigger: cambio regulatorio, nueva actividad, jurisdicción, modalidad de cobro o firma de la versión
Supersedes: docs/onboarding/phase-4-policy-annex-bo-draft.md

> **Estado de decisión.** Esta es la matriz v1.0 lista para ratificación, no una política publicada.
> Hasta que Políticas, Finanzas y Operaciones Tours registren las tres aprobaciones, ninguna fila
> nueva puede sembrarse como `published` ni exigir un documento que aún no está en producción.
> El alojamiento no espera esta firma: tiene su propio anexo en
> [policy-annex.md](../lodging/policy-annex.md).

## Alcance y límites

Aplica cuando el producto es un `tour` con ubicación principal en Bolivia. La matriz distingue
el titular, quien ejecuta la actividad, la jurisdicción, el nivel de riesgo y quién cobra. No
afirma que todos los tours tengan una misma licencia, seguro o régimen fiscal.

`property_collect` significa que el proveedor cobra al viajero durante la experiencia: Fastt no
autoriza, recauda, custodia ni reembolsa esos fondos. Por eso una cuenta de liquidación Fastt no
es un requisito para publicar o aceptar reservas bajo esa modalidad. `platform_collect` sigue
no soportado hasta que exista contrato, procesador y versión firmada.

La base oficial boliviana distingue el registro departamental para operación en un departamento
del nacional cuando se opera en más de uno; también distingue prestadores, empresas y guías.
Las fuentes para la revisión son el [reglamento de registro turístico](https://www.turismo.produccion.gob.bo/wp-content/uploads/2023/05/REGLAMENTO-ESPECIFICO-PARA-EL-REGISTRO-CATEGORIZACION-Y-CERTIFICACION-DE-PRESTADORES-DE-SERVICIOS-TURISTICOS-2023.pdf), el [trámite de licencia turística](https://www.gob.bo/tramites/licencia-turistica-de-prestadores-de-servicios-turisticos) y las guías vigentes del [SIN para persona natural](https://siatinfo.impuestos.gob.bo/index.php/requisitos-para-la-inscripcion/requisitos-para-obtener-el-nit-para-personas) y [jurídica](https://siatanexo.impuestos.gob.bo/index.php/requisitos-para-la-inscripcion/procedimientos-y-requisitos-para-obtener-el-nit-para-personas-juridicas). La evidencia de Airbnb es una referencia de producto, no norma aplicable a Fastt.

## Contexto que debe resolver el evaluador

Una versión sólo puede aplicarse a esta tupla completa:

`titular × papel operativo × país del titular × jurisdicción del producto × clase de actividad × modalidad de cobro`.

| Dimensión | Valores iniciales | Para qué sirve |
| --- | --- | --- |
| Titular | `persona_natural`, `entidad` | Define identidad, representación y evidencia societaria. |
| Papel operativo | `operador`, `guía`, `intermediario` | Evita atribuir una credencial personal a una empresa o viceversa. |
| Jurisdicción | departamento, alcance nacional y municipio/sitio si aplica | Determina la autoridad y el territorio cubierto. |
| Clase de actividad | `urbana_cultural`, `naturaleza_guiada`, `aventura`, `transporte`, `acuática_aérea`, `gastronómica` | Activa controles condicionales; una oferta puede tener más de una. |
| Cobro | `property_collect`, `platform_collect`, `undecided` | Separa autorización para vender de recaudar o liquidar. |

Las clases no son niveles de calidad. Son declaraciones operativas que deben poder ser corregidas
y auditadas. Una actividad híbrida hereda todos los requisitos aplicables. Si no se puede
clasificar, queda `requires_review`; nunca recibe una excepción por defecto.

## Matriz de requisitos

**Fuente** indica si la fila expresa una obligación a verificar en la norma o contrato aplicable
(`Legal/contractual`) o una condición propuesta por Fastt (`Política Fastt`). Las filas legales
requieren cita de la norma o expediente de la jurisdicción; las de Fastt requieren aprobación de
Políticas. Ninguna se activa sólo por llevar la etiqueta “tour”.

| Requisito y cuándo aplica | Fuente | Evidencia aceptada / emisor | Vigencia y alcance que se comprueba | Revisor | Capacidades afectadas y acción si falta |
| --- | --- | --- | --- | --- | --- |
| Titular e identidad: todo proveedor | Política Fastt | Documento gubernamental vigente del titular; poder del representante si actúa por entidad | Titular o representante; se reabre al cambiarlo | Verificación | `publish`, `booking`, integraciones. Solicitar identidad o representación. |
| Existencia y representación de entidad: `entidad` | Legal/contractual | Matrícula, constitución y poder cuando corresponda; autoridad competente | Entidad y representante; fecha de emisión según documento | Verificación | `publish`, `booking`. Solicitar evidencia societaria; no aplicar a persona natural salvo versión firmada. |
| Registro fiscal: titular que opera o cobra | Legal/contractual | NIT/configuración fiscal verificada; SIN u otra autoridad aplicable | Titular fiscal y país de residencia tributaria | Fiscalidad | `publish`, `booking`, `collect_payment`, `payout` según versión. Corregir registro fiscal. |
| Habilitación turística del operador: `operador` o `intermediario` cuando la categoría/jurisdicción la exige | Legal/contractual | Licencia o registro turístico, SIRETUR u homologación admitida; autoridad departamental o nacional competente | Categoría, departamento(s), establecimiento/oficina si corresponde y vencimiento | Operaciones Tours + Verificación | `publish`, `booking` de productos en ese alcance. Solicitar licencia correcta; no sustituirla por una de hotel. |
| Credencial del guía: `guía` o persona asignada a una salida cuando la actividad o autoridad la exige | Legal/contractual | Credencial o habilitación de guía; autoridad competente | Persona, especialidad, territorio e intervalo de vigencia | Operaciones Tours | `booking` para salidas afectadas; reasignar guía habilitado o aportar credencial. |
| Seguro comercial: si ley aplicable lo exige o la clase implica aventura, transporte, agua o aire | Legal/contractual o Política Fastt aprobada | Póliza/certificado de cobertura; aseguradora emisora | Asegurado, actividad, territorio, participantes/activos cubiertos y vencimiento | Riesgo / Operaciones Tours | `publish`, `booking` de actividad/salida afectada. Renovar o retirar la actividad; no aceptar un PDF sin alcance verificable. |
| Transporte turístico: si incluye conductor, vehículo o traslado operado por el proveedor | Legal/contractual | Habilitación del operador/vehículo/conductor y seguro, según jurisdicción | Vehículo o tercero, ruta/territorio y vigencia | Riesgo / Operaciones Tours | `booking` de la opción con traslado. Quitar traslado, declarar tercero aprobado o aportar habilitación. |
| Acceso a área regulada: si el recorrido requiere permiso de sitio, área protegida o patrimonio | Legal/contractual | Permiso, concesión o autorización del administrador competente | Sitio, ruta, cupo/fecha y vigencia | Operaciones Tours | `booking` de fechas o itinerarios afectados. Cambiar ruta o aportar autorización. |
| Manipulación de alimentos: si el proveedor prepara o sirve alimentos y la jurisdicción lo exige | Legal/contractual | Habilitación sanitaria aplicable; autoridad competente | Establecimiento, preparador, localidad y vigencia | Operaciones Tours | `booking` de la inclusión afectada. Quitar la inclusión o completar habilitación. |
| Protocolo operativo y emergencia: clases de riesgo aprobadas por Fastt | Política Fastt | Datos estructurados de responsable, contacto y protocolo; no se presume un documento regulatorio | Producto, actividad, responsables y fecha de revisión | Riesgo / Operaciones Tours | `publish` o `booking` según la versión. Completar plan o enviar a revisión. |
| Cobro directo: `property_collect` | Contractual Fastt | Declaración contractual del proveedor y condiciones de pago de tour | Producto y modelo de cobro; cambia con el contrato | Finanzas / Políticas | Habilita sólo la reserva según contrato; `payout` sigue no aplicable. Confirmar quién cobra. |
| Cobro por Fastt y liquidación: `platform_collect` | Contractual Fastt | Contrato firmado, procesador aprobado, beneficiario y cuenta de liquidación verificada | Titular, país fiscal/pago, producto y periodo contractual | Finanzas / Pagos | `collect_payment`, `payout`. Mantener bloqueado hasta tener anexo firmado e infraestructura activa. |

## Reglas de composición

1. La identidad y fiscalidad pertenecen al titular; una evidencia de producto no las reemplaza.
2. La licencia, credencial, seguro y permiso se enlazan a la persona, activo, actividad, territorio
   y fechas que cubren. Una aprobación de tipo genérico no habilita otras salidas automáticamente.
3. Se solicita la evidencia mínima aplicable. Propiedad inmobiliaria, cuenta bancaria, certificados
   médicos y antecedentes no son requisitos universales de tours.
4. `En revisión` no satisface una regla. `No aplica` se excluye del denominador y conserva la razón,
   la política y el revisor que la resolvió.
5. La falta de una evidencia de riesgo bloquea el producto, opción o salida afectada; no invalida
   automáticamente hoteles u otros tours del mismo proveedor.
6. Una renovación no reinterpreta reservas confirmadas. Su impacto sobre salidas futuras se define
   por la versión firmada y se conserva con snapshot.

## Publicación, reserva y cobro

| Resultado | Requisitos mínimos |
| --- | --- |
| Preparar borrador | Ninguno de los documentos bloquea la edición. |
| Publicar una ficha | Identidad, titular/fiscalidad y evidencias de actividad aplicables verificadas para el producto. |
| Aceptar una reserva | Lo anterior, más evidencia vigente para la salida, guía o activo cuando aplique. |
| Cobrar con Fastt | Sólo `platform_collect` con política comercial, contrato, procesador y controles financieros aprobados. |
| Recibir liquidación de Fastt | Sólo cuando exista el modelo anterior y cuenta de liquidación verificada. |

## Registro de ratificación y carga

Antes de crear cualquier `CompliancePolicyVersion` publicada, Políticas, Finanzas y Operaciones
Tours deben completar este registro para cada combinación que se habilite:

| Campo obligatorio | Valor requerido |
| --- | --- |
| Identificador de versión | Clave única y semántica de la tupla de contexto. |
| Base legal o contractual | URL/expediente, artículo o cláusula, fecha de consulta y responsable de validación. |
| Reglas aplicables | Claves de la matriz, obligatoriedad, evidencia, alcance, vigencia, SLA, capacidades y acción correctiva. |
| Aprobación de Políticas | Usuario, fecha y referencia del expediente. |
| Aprobación de Finanzas | Usuario, fecha y referencia del expediente; obligatoria para `collect_payment` o `payout`. |
| Aprobación de Operaciones Tours | Usuario, fecha y referencia del expediente. Sin esta firma no se exige un documento nuevo de tours. |
| Fecha de vigencia y reversión | Inicio, término si aplica, cohorte y procedimiento para retirar la versión sin reinterpretar reservas. |

La implementación registra `papel operativo`, `clase de actividad`, vigencia, sujeto y alcances de
evidencia en tablas aditivas. Las evidencias anteriores conservan alcance de proveedor hasta que se
revisen. El evaluador compartido resuelve reglas publicadas por capacidad y aplica `conditionJson`
sólo como condición explícita de papel, actividad, territorio, recurso o sujeto. Publicación y reserva
de tours no pueden omitir ese diagnóstico; una política aún no ratificada sigue devolviendo bloqueo.

Cada versión comercial de tours guarda además su `contextJson` con papel, actividad y jurisdicción,
y tres firmas inmutables separadas: `policy`, `finance` y `tour_operations`. Cada regla obligatoria
guarda fuente (`legal`, `contract` o `fastt_policy`), referencia, fecha de consulta, evidencia aceptada,
revisor, capacidades afectadas y acción correctiva. La base y el evaluador rechazan una publicación
que omita cualquiera de esos elementos; el estado `published` no se deduce de la etiqueta `tour`.

## Superficie del proveedor

La pantalla vigente no reutiliza las cuatro pestañas de alojamiento. El avance cuenta un paso por
pestaña visible.

| Línea | Pestañas |
| --- | --- |
| Alojamiento | Identidad, Negocio, Fiscal y Cobros |
| Tours | Identidad, Actividad y licencias, Seguridad y permisos, y Fiscal. Cobros solo si Fastt liquida |

En tours, el registro de la entidad aparece dentro de Identidad y solo si el titular es entidad.
En cobro directo, Pagos no entra en el avance ni se pide para publicar o reservar. La habilitación
por experiencia muestra el diagnóstico de publicar y reservar. Una política sin ratificar se
atribuye a Fastt y no pide documentos que esta matriz todavía no exige.

## Criterios de aceptación de la fase A

- Toda fila tiene fuente, emisor/evidencia, alcance, vigencia, revisor, capacidad y acción.
- Las reglas de hotel no se reutilizan para tours; las reglas de tour no se activan por vertical a secas.
- El pago directo no exige una cuenta de liquidación Fastt para publicar o reservar.
- Una combinación sin firma permanece en modo sombra y bloqueada para capacidades nuevas.
- La matriz sólo pasa a `published` con las tres aprobaciones indicadas y una prueba de diagnóstico.

## Revisión, vigencia y renovaciones

El revisor decide sobre la evidencia, no sólo sobre su tipo. La cola muestra el archivo seguro,
emisor, titular, emisión, vigencia y alcance declarado (producto, recurso, territorio y actividad),
y registra esos mismos datos junto con el resultado, el revisor y el motivo de rechazo. Las plantillas
de rechazo distinguen alcance insuficiente, documento vencido y emisor o vigencia no verificables.

Una fecha de vencimiento es una fecha civil: la evidencia vale durante el día indicado y vence al
comenzar el siguiente. Una evidencia vencida sigue siendo historial; no se vuelve a aprobar. El
proveedor envía una renovación explícita del mismo tipo, vuelve a declarar su alcance y la renovación
entra como nueva evidencia pendiente. La anterior queda `superseded`, con su decisión y alcance
intactos para auditoría.

Al vencer una evidencia, Verificación avisa al proveedor y la consola administrativa crea una acción
de renovación con el alcance y un recuento de salidas futuras y reservas confirmadas relacionadas.
Operaciones decide, según la versión aplicable y el riesgo, si limita nuevas salidas, reasigna recursos
o pausa venta futura. El sistema no cancela, cambia precio ni reinterpreta una reserva confirmada: su
snapshot de reserva y política permanece como evidencia contractual. Un riesgo inmediato u obligación
legal de intervenir requiere un caso operativo trazable y una decisión humana separada; no es una
consecuencia automática del vencimiento.

## Migración y certificación

La migración es diagnóstica y de sólo lectura. `pnpm audit:commercial-evidence-migration` clasifica
cada evidencia como pendiente, histórica no habilitante, vencida, genérica sin alcance o con alcance
que aún debe coincidir con una política firmada. No modifica estados, alcances, decisiones ni reservas.
La activación queda bloqueada hasta que exista una versión comercial firmada y una cohorte explícita;
los proveedores hotel, tour y mixtos se certifican por separado. El documento genérico heredado puede
permanecer en el historial, pero no concede una capacidad comercial de producto por defecto.
