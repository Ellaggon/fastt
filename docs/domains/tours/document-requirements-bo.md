# Catalogo documental de Tours en Bolivia

Status: draft
Document type: canonical
Owner: Titular del proyecto / Provider Policy
Last verified: 2026-11-08
Scope: seleccion documental por prestador, actividad y departamento; prioridad La Paz
Source of truth: fuentes oficiales enlazadas; aplicabilidad pendiente de ratificacion
Related code/tests: src/lib/documents/document-definitions.ts; src/lib/provider-documents.ts; src/lib/commercial-policy/policy-drafts.ts; tests/unit/commercial-policy-evaluate.test.ts
Review trigger: nueva jurisdiccion, cambio normativo, categoria, fuente contradictoria o activacion

## Como utilizarlo

Informa la [matriz de cobertura](./policy-annex.md) para preparar definiciones y reglas;
no es aprobacion, dictamen legal ni certificacion exhaustiva. No hubo confirmacion
directa con autoridades.

Separar tres capas: expediente para obtener una habilitacion, documento emitido y
evidencia que Fastt necesita conservar. Un campo en un formulario no demuestra que
sea obligatorio para todas las categorias. Renovacion, reposicion y alta pueden diferir.
Una credencial de una asociacion no sustituye automaticamente la de la autoridad.

## La Paz: guias

Fuentes: [formulario departamental](https://milapaztravel.lapaz.gob.bo/vista/declaraciones/ELTRegistradoGuias)
y [Decreto Departamental 109](https://milapaztravel.lapaz.gob.bo/pdfs/gaceta/Decreto109_691f65c45acd7.pdf).
El formulario contempla los siguientes elementos; confirmar obligatoriedad por categoria:

| Elemento del tramite | Tratamiento propuesto en Fastt |
| --- | --- |
| Solicitud y curriculum | No duplicar el expediente administrativo. |
| Identificacion personal | Verificar identidad con acceso restringido. |
| Antecedentes FELCC y FELCN | No recopilar rutinariamente; justificar necesidad y tratamiento antes. |
| Certificado medico y grupo sanguineo | No almacenar por defecto; son datos sensibles. |
| Primeros auxilios | Evaluar acreditacion pertinente al servicio, emisor y vigencia. |
| Prevencion de riesgos | Condicionar a categoria/actividad, no exigir a todos por mostrar un campo. |
| Formacion en turismo y experiencia | Registrar competencia; no presumir un unico titulo obligatorio. |
| Idiomas y respaldo formativo | Separar idioma declarado de competencia comprobada. |
| Fotografia | No confundir foto administrativa con verificacion biometrica. |
| Publicacion por perdida o robo | Solo reposicion aplicable; no requisito general del marketplace. |

La autorizacion resultante es la credencial del guia, personal y con alcance/categoria.
Para Fastt proponer verificacion de titular, emisor, numero, territorio, actividad,
estado, fechas y fuente de comprobacion; no basta una imagen legible. Vincularla al
guia que realmente ejecutara la salida, no al proveedor de forma indiferenciada.
El decreto distingue licencia del prestador y credencial del guia (arts. 20 y 24),
y trata la operacion sin habilitacion (art. 33). Revisar modificaciones antes de activar.

## La Paz: operador y documentos condicionales

Para operador con equipo, verificar por separado prestador y personas. El
[formulario juridico departamental](https://milapaztravel.lapaz.gob.bo/vista/declaraciones/ELTActualizacionJuri)
identifica requisitos segun categoria; por ejemplo, diferencia guias de operadoras
de controles sanitarios para hospedaje/gastronomia. No trasladar estos ultimos al paseo.

La base nacional de registro enumera constitucion/representacion cuando corresponda,
matricula comercial, NIT, licencia municipal y balance para empresas. Son antecedentes
del tramite, no todos requisitos universales de una persona guia ni todos archivos
que Fastt deba recopilar. Revisar el [reglamento de registro, art. 16](https://www.turismo.produccion.gob.bo/wp-content/uploads/2023/05/REGLAMENTO-ESPECIFICO-PARA-EL-REGISTRO-CATEGORIZACION-Y-CERTIFICACION-DE-PRESTADORES-DE-SERVICIOS-TURISTICOS-2023.pdf).

| Evidencia candidata | Cuando encaja en Fastt |
| --- | --- |
| Licencia turistica y resolucion de respaldo | Prestador operador, categoria y alcance verificables. |
| Identidad/representacion y registro comercial | Segun tipo real de titular y facultad de contratar. |
| NIT y datos fiscales | Titular fiscal que corresponda, sin equiparar todos los regimenes. |
| Credencial de cada guia asignado | Guia individual, actividad, territorio y fechas de salida. |
| Poliza y certificado de cobertura | Si corresponde por categoria o politica aprobada; verificar actividad, asegurados y exclusiones. |
| Permiso de sitio o area protegida | Solo si la ruta incluye un espacio que exige autorizacion. |
| Habilitaciones de transporte/conductor/vehiculo | Solo con transporte; fuera del alcance inicial. |
| Acreditaciones de actividad especializada | Montanya, aventura, agua o aire; fuera de esta primera admision. |
| Autorizaciones sanitarias | Cuando exista preparacion/servicio de alimentos aplicable; fuera del paseo inicial. |
| Protocolo de emergencia y contacto | Datos operativos propuestos por Fastt, no una licencia estatal ficticia. |
| Acuerdo comercial y condiciones de pago | Contrato separado; el viajero paga al proveedor. |

El [modulo de operadoras](https://conocebolivia.produccion.gob.bo/wp-content/uploads/2025/11/MODULOS-OPERADORAS-DE-TURISMO.pdf)
contempla accidentes personales y atencion de emergencias, entre otras condiciones.
No confundir ese seguro con responsabilidad civil ni asumir que un paseo urbano esta exento.
Confirmar norma/categoria aplicable y alternativas admitidas antes de cargar una regla.

## Alcance nacional y vigencias

El [tramite nacional de guias](https://www.gob.bo/tramites/licencia-turistica-de-guias-de-turismo-nacional)
publica identidad, nacimiento, carnet laboral para extranjeros, antecedentes y certificado
medico, con procedimiento ligado al registro en mas de un departamento. No reemplaza
la confirmacion departamental ni prueba que todo guia necesite dos tramites simultaneos.

Hay discrepancias temporales: ese portal indica un anyo, mientras una
[comunicacion oficial de octubre de 2026](https://modernizacion.presidencia.gob.bo/index.php/nota_prensa/programa-tranca-cero-impulsa-la-simplificacion-de-tramites-y-amplia-la-vigencia-de-licencias-en-beneficio-del-sector-turistico/)
anuncia cambios de vigencia nacional mediante DS 5721. Contrastar texto, transicion y
documento concreto; no codificar un plazo universal ni extenderlo al departamento.
El [modulo tecnico de guias](https://www.turismo.produccion.gob.bo/wp-content/uploads/2023/05/MODULO-TECNICO-GUIAS-DE-TURISMO.pdf)
distingue formacion/idoneidad y certificaciones especializadas. Ante fuentes discrepantes,
no rechazar automaticamente a un guia empirico ni aceptar una simple autodeclaracion.

## Comparacion de los nueve departamentos

Investigacion sin habilitaciones: no copiar La Paz ni presumir exenciones por falta de fuentes.

| Departamento | Fuente publica localizada y alcance | Pendiente antes de habilitar |
| --- | --- | --- |
| La Paz | Formulario de guia y decreto enlazados arriba; mayor detalle disponible. | Categoria concreta, modificaciones, seguro y permisos de ruta. |
| Santa Cruz | [RA SDDH 003/2020](https://gacetaoficial.santacruz.gob.bo/verpdf/ra-sddh-nro-003-2020): solicitud, formacion o experiencia admitida, CV, identidad, extranjero cuando aplique, FELCC/REJAP, medico, fotos y pago. | Vigencia y modificaciones; no sustituir FELCC/FELCN de otra fuente por REJAP sin revision. |
| Cochabamba | [SITUR departamental](https://turismo.gobernaciondecochabamba.bo/) muestra tramites y categoria guias. | Checklist documental de guia vigente no confirmado en esta consulta. |
| Chuquisaca | [Apertura de prestadores](https://tramites.chuquisaca.gob.bo/tramites/turismo/apertura-de-prestadores-de-servicios-turisticos.html): registro empresarial, representacion, NIT, licencia municipal, balance e identidad. | Es tramite de empresas, no listado completo de guias; obtener este ultimo. |
| Tarija | [Ley departamental 519](https://www.tarija.gob.bo/gaceta-oficial/leyes-departamentales?download=3444%3Aley-departamental-n-519-ley-departamental-de-turismo-del-departamento-de-tarija) incluye categorias y tasas de guias. | Confirmar expediente, reglamento y cambios; una tasa no describe todos los documentos. |
| Oruro | [Ley 261, referencia oficial](https://www.economiayfinanzas.gob.bo/index.php/node/12636), relativa a tasas de Cultura y Turismo. | No se obtuvo checklist completo de guia; pedir fuente departamental actual. |
| Potosi | No se verifico un checklist departamental completo en fuentes oficiales accesibles. | Confirmar guia/operador y permisos por sitio; no usar normas de San Luis Potosi, Mexico. |
| Beni | [Ley departamental de turismo](https://asambleabeni.gob.bo/storage/publications/November2022/OZ6xDFr0ynr2XIYn1E3h.pdf), art. 22: autorizacion adicional para operar en areas protegidas. | Expediente de guia, reglamento y autorizacion concreta del area. |
| Pando | [Ley departamental 093](https://gaceta.pando.gob.bo/upload_gaceta/LEY-093.pdf): marco turistico y guias. | Checklist operativo vigente no confirmado; no inferirlo de la definicion legal. |

Para completar filas pendientes solicitar a cada autoridad: checklist de alta/renovacion,
categorias, fundamento y modificaciones, reconocimiento de credencial nacional,
verificacion publica de estado, vigencias y requisitos adicionales por actividad/sitio.

## Referencias de marketplaces

- [Airbnb, licencias y seguros](https://www.airbnb.com/help/article/3892): exige las
  habilitaciones aplicables y espera responsabilidad civil comercial; solicita evidencia
  segun actividad/lugar, revisa personal y renovaciones. Publicacion no sustituye licencia.
- [GetYourGuide, verificacion de credenciales](https://supply.getyourguide.support/hc/en-us/articles/38780821416989-How-to-complete-credential-verification-with-Evident):
  separa identidad/negocio de licencias/seguros. Su revision con Evident es un piloto
  desde septiembre de 2026 para proveedores/mercados seleccionados, no cobertura universal.
  Es la referencia principal de flujo, no una garantia de disponibilidad en Bolivia.
- [Viator, actualizacion contractual agosto 2026](https://operatorresources.viator.com/updated-supplier-agreement-august-2026/):
  el resumen oficial presenta responsabilidad civil como base global, con limites por
  riesgo/destino y suspension de nuevas ventas por cobertura insuficiente o vencida.
  No basarse en su articulo antiguo que distinguia solo productos de alto riesgo.
  El contrato completo enlazado no fue legible en esta consulta: no atribuirle mas clausulas.
- [Expedia, acuerdo de datos para actividades](https://legal.expediagroup.com/privacy/privacy-contract-terms/partner-data-processing-agreements/travel-suppliers/activities):
  no es un checklist de licencias. No se encontro una lista publica suficiente para
  atribuirle los mismos requisitos documentales de las otras plataformas.

### Comportamiento recomendado, pendiente de aprobacion

Separar identidad/negocio, habilitacion y seguridad. Preparar una ficha no requiere
aprobar esas capas; vender si. Licencias dependen de persona, actividad y jurisdiccion,
no de una casilla generica de "tour". Solo la autoridad concede habilitacion.
Proponer responsabilidad civil comercial para el piloto real como politica de Fastt,
con cobertura y disponibilidad local revisadas; no declararla ley universal ni confundirla
con accidentes personales. Esta propuesta no crea un requisito activo ni contrata seguro.
No copiar periodos de gracia o cancelaciones automaticas de otra plataforma.
Un vencimiento debe detener nuevas ventas afectadas y abrir revision de salidas existentes,
sin afirmar que siempre deban ejecutarse ni cancelarlas todas sin evaluar seguridad y contrato.

Estados distinguibles: no aplica justificado, pendiente de evidencia, en revision,
verificado, rechazado y vencido. Falta de configuracion es pendiente de Fastt, no
incumplimiento del proveedor. Una autodeclaracion no equivale a documento verificado.
Minimizar copias sensibles, revisar sujeto/emisor/alcance/fechas y guardar trazabilidad.
El [Decreto departamental 203](https://www.lapaz.gob.bo/storage/gaceta/203.pdf),
25/09/2026, fue recuperado y leido visualmente en sus seis paginas el 2026-11-08.
Su art. 2 sustituye el art. 23 del 109: licencia departamental, credencial de guia y
certificado de transporte duran tres anyos desde emision. Conserva actualizacion
documental y pago anual; incumplir este ultimo suspende habilitacion. La disposicion
final segunda remite plazos/procedimientos a instructivos administrativos y la tercera
mantiene las demas disposiciones. No prescribe aqui un canje automatico de documentos
antiguos: escalar dudas de transicion al emisor, sin recalcular vencimientos.
Fastt debe separar vencimiento documental y habilitacion actual; no inferir pago vigente
de la fecha impresa. No confundir estos tres anyos departamentales con el regimen nacional.

### Verificacion actual y documentos anteriores

Busqueda del 2026-11-08: no se localizo instructivo publico de transicion ni se confirmo
consulta de pagos/suspensiones. El [directorio de guias](https://milapaztravel.lapaz.gob.bo/vista/listados_guias.php)
no proporciono esa comprobacion. Esto no demuestra inexistencia de otros canales.
Proceso normal propuesto: declaracion, documento aplicable, revision humana de titular,
emisor, alcance y fechas, decision trazable y renovacion. No exigir consulta directa
al emisor para cada documento ni afirmar que se hizo cuando solo se reviso una copia.
Escalar contradicciones, indicios de alteracion, suspension conocida o transicion dudosa.
En esos casos solicitar tratamiento anterior al 25/09/2026, estado y evidencia admisible;
registrar respuesta/fecha/revisor. Solo el caso dudoso queda pendiente, no todo proveedor.
Una boleta aislada no prueba ausencia de suspension. No contactar automaticamente.

## Encaje tecnico y minimo recomendado

Aplicabilidad propuesta, no ratificada. Formularios reconsultados el
2026-11-08: el juridico distingue seguro de accidentes personales y guia autorizado
para operadoras. Eso no demuestra una obligacion universal ni reemplaza revisar categoria.

| Familia | Empresa operadora con equipo | Guia independiente |
| --- | --- | --- |
| Identidad | Entidad y representante facultado; evidencia minima verificable. | Identidad de la persona que ejecuta. |
| Fiscalidad | Situacion fiscal de la entidad real. | Situacion fiscal individual; sin presumir exencion. |
| Turismo | Autorizacion del operador y categoria aplicable. | Credencial personal; no licencia empresarial por defecto. |
| Guias | Credencial por cada guia asignado; licencia empresarial no los sustituye. | La misma persona identificada ejecuta la actividad. |
| Seguro | Accidentes personales segun fuente departamental; confirmar categoria/cobertura. | Accidentes/asistencia propuestos por Fastt; no ley universal demostrada. |
| Sitios | Permiso solo cuando la ruta lo exige. | Mismo criterio territorial; no exencion por ser persona. |
| Estandares Fastt | Contacto/protocolo de emergencia propuestos, no licencia estatal. | Mismo estandar operativo propuesto. |

Transporte, alimentos, naturaleza, aventura, agua, aire y ejecucion externa quedan fuera
de esta admision, no declarados ilegales. El acuerdo comercial conserva su puerta separada.
No recoger por defecto salud, sangre, antecedentes ni expediente estatal completo.
Datos adicionales requieren finalidad y tratamiento justificados. RC no equivale a accidentes.

La [propuesta local](../../../tests/fixtures/commercial-policy/bo-la-paz-urban.draft.json)
registra ambas vias, fuentes limitadas y pendientes, sin importador ni escrituras.
`BO:company` sigue siendo supuesto ficticio. La Paz ciudad/El Alto son casos del departamento,
no habilitacion de otros lugares; una licencia urbana no amplia su propio alcance.
Las [pruebas](../../../tests/unit/la-paz-commercial-policy-draft.test.ts) no acreditan licencias
reales. Restan categoria, seguro, transicion dudosa de documentos, definiciones/IDs y vigencias
de las reglas antes de ratificar. El vencimiento opcional no significa validez indefinida.
La consulta al emisor es escalamiento ante dudas, no tramite rutinario. Sin cargas reales,
definiciones publicadas ni politica activa por este documento.
