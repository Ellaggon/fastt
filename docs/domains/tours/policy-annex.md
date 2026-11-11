# Matriz comercial BO v1 — tours

Status: draft
Document type: canonical
Owner: Provider Policy / Finance / Tours
Last verified: 2026-11-08
Scope: requisitos comerciales y operativos aplicables a tours ubicados en Bolivia
Source of truth: versiones firmadas de `CompliancePolicyVersion`; normativa y expedientes enlazados abajo
Related code/tests: `src/lib/commercial-policy/`, `src/lib/provider-documents.ts`, `src/lib/provider-document-validity.ts`, `tests/unit/commercial-policy-evaluate.test.ts`, `tests/unit/provider-document-evidence.test.ts`, `tests/ui/provider-document-renewal.test.ts`
Review trigger: cambio regulatorio, nueva actividad, jurisdicción, modalidad de cobro o firma de la versión
Supersedes: docs/onboarding/phase-4-policy-annex-bo-draft.md

## Borrador de expansion nacional e internacional

Orden de cierre, responsables y resultados: [roadmap de la primera puerta](../../onboarding/phase-4-policy-activation.md#roadmap-de-la-primera-puerta).
Un responsable puede registrar las tres revisiones; no se presume ratificacion por ello.

Decision del titular: disenar para varios paises, comenzar en Bolivia y validar primero
el departamento de La Paz. Esta matriz sigue en borrador: no constituye ratificacion,
alta en la base ni
permiso de publicacion o reserva. La fecha anterior acredita revision del alcance,
no verificacion de las fuentes regulatorias historicas citadas abajo.

- Base compartida de familias, no de obligaciones legales universales. Versiones
  separadas por pais, titular, cobro y papel jurisdiccional; no confundir pais fiscal,
  del titular y del producto ni trasladar requisitos bolivianos a otros paises.
- Geografia canonica: componer requisitos nacionales, departamentales y locales.
  Una admision unica por ambito, sin prioridad implicita entre versiones solapadas.
- Expansion gradual: departamento de La Paz; otros departamentos y paises requieren
  revision y aprobacion propias. Sitios regulados conservan sus permisos adicionales.

## Primer alcance evaluable: departamento de La Paz

- Formato propuesto: `guided_tour`; operación `self` o `team`, con actividad
  `urban_cultural` y guía declarado. Roles `guide` u `operator`, nunca intermediacion
  externa. Validar el contexto completo, no sólo una etiqueta.
- Territorio candidato: `bolivia/la-paz-department`, lugar `geo:bo:la-paz-department`.
  Incluye ciudades descendientes, no habilita automaticamente sitios o actividades.
  El tour ficticio sigue declarando La Paz ciudad; no se modifico su ruta en la base.
- Selector propuesto: contrato componible 3, admision `platform_standards`, formato
  `guided_tour`, ejecucion `self`/`team`, alimentos `none`, actividad exclusivamente
  `urban_cultural` y territorio anterior. Tipo y forma del titular se obtienen del
  expediente; no crear una cobertura universal para ambas clases por conveniencia.
- Sin naturaleza, aventura, agua, aire, transporte incluido ni ejecución por terceros.
  Excluir también preparación y servicio de alimentos para esta primera certificación;
  una visita gastronómica requiere revisar su clasificación antes de admitirla.
- Cobro `property_collect`. Forma jurídica, país del titular, fiscalidad y permisos
  aplicables siguen sujetos a revisión; no presumirlos por el alcance de beta.

Excluir del piloto no significa prohibición legal. Mezclas con actividades excluidas o
datos ambiguos quedan pendientes. No cambiar declaraciones reales para hacerlas encajar.

Antes de cargar: validar contexto, fuentes, selectores, familias y vigencia mediante el
roadmap enlazado. Probar admitidos/excluidos en aislamiento, no sobre la base compartida.
Una condicion documental no sustituye una exclusion; cobertura no sustituye verificacion,
acuerdo ni preparacion. No activar sin resultados y aprobaciones registrados.

El paseo ficticio sirve para simulacion, no para venta. Este borrador no aporta permisos,
credenciales, firmas ni respaldo documental real. La politica de cobertura tampoco
habilita por si sola el procesamiento documental ni el acuerdo comercial del proveedor.

### Alternativas minimas y recomendacion

1. Guia independiente: `self` y `guide`; revisar titular, fiscalidad y habilitacion personal.
   No asumir que esa credencial autoriza cualquier intermediacion o paquete turistico.
2. Operador con equipo: `team` y `operator`; revisar autorizacion del prestador y guias
   asignados por separado, ademas de seguro/emergencias segun categoria aplicable.

Objetivo de beta: ambas vias en el departamento de La Paz. La propuesta local ya
separa entidad/equipo de persona/ejecucion propia con ambito departamental explicito.
No cambiar el tour de empresa para simular la otra via ni extender a otros departamentos.
No admite terceros externos ni una admision compartida por defecto.
La persona requiere credencial propia; no se le impone licencia empresarial automaticamente
ni se le concede exencion de registro/fiscalidad por esta clasificacion sintetica.

Para cerrar cobertura: resolver categoria y fuentes; preparar admision y familias de
requisitos; simular casos positivos y negativos; registrar las tres aprobaciones y vigencia.
Definir requisitos no significa acreditarlos: documentos, acuerdo y preparacion conservan
sus puertas. La prueba sintetica nunca autoriza ventas. Esta matriz aun no esta lista
para ratificacion. Alojamiento conserva su [anexo independiente](../lodging/policy-annex.md).

## Alcance y límites

### Categoria, seguro y ruta del caso inicial

Propuesta no ratificada del 2026-11-08: **Operadora de Turismo** con equipo propio,
no agencia por conveniencia. Un prestador real debe acreditar esa categoria/alcance;
el guia independiente conserva su via personal.

Seguro: comprobar participantes/equipo, actividad, territorio, fechas, riesgos, limites y
exclusiones. El [formulario departamental](https://milapaztravel.lapaz.gob.bo/vista/declaraciones/ELTActualizacionJuri)
menciona accidentes personales para operadoras. Para guia independiente proponemos
accidentes/asistencia a participantes como estandar Fastt, no ley universal demostrada.
No inventar montos/aseguradoras ni equiparar accidentes con responsabilidad civil.

Ruta sintetica: exterior peatonal en La Paz ciudad; sin interiores, areas protegidas,
cierres, ocupacion exclusiva, estructuras ni evento amplificado. El
[permiso municipal](https://lapaz.bo/permiso-excepcional-para-cierre-y-uso-de-via-publica/)
tiene alcance amplio: no presumir exencion por ir a pie. Antes de venta real confirmar
aplicabilidad para ruta/grupo/operacion; cobertura departamental no concede permisos de sitio.
No se contacto al municipio ni compro seguro. Pendientes reales: autorizacion de categoria,
condiciones de poliza y criterio municipal. Supuestos registrados en el paquete local.

Aplica cuando el producto es un `tour` con ubicación principal en Bolivia. La matriz distingue
el titular, quien ejecuta la actividad, la jurisdicción, el nivel de riesgo y quién cobra. No
afirma que todos los tours tengan una misma licencia, seguro o régimen fiscal.

`property_collect` significa que el proveedor cobra al viajero durante la experiencia: Fastt no
autoriza, recauda, custodia ni reembolsa esos fondos. Por eso una cuenta de liquidación Fastt no
es un requisito para publicar o aceptar reservas bajo esa modalidad. `platform_collect` sigue
no soportado hasta que exista contrato, procesador y versión firmada.

### Fuentes y decisiones documentales

El [catalogo documental BO](./document-requirements-bo.md) mantiene el detalle de La Paz,
comparacion departamental, fuentes y requisitos propuestos. Revisar categoria, fiscalidad,
ruta, guias y seguro antes de cargar reglas; su estado draft no autoriza venta real.

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

El [contrato de composicion](./compliance-policy-composition.md) define persistencia,
firmas, fuentes y evaluacion por capacidad. Esta matriz no los sustituye:
sin ratificacion no concede publicacion ni reserva.

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
