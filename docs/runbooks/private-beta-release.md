# Liberacion de beta privada

Status: active
Document type: runbook
Owner: Titular del proyecto (operacion unipersonal)
Last verified: 2026-11-07
Scope: alcance seleccionado de piloto comercial privado y criterios pendientes de apertura
Source of truth: eleccion del titular del proyecto del 2026-11-05 y contratos enlazados
Related code/tests: src/lib/provider-documents.ts, src/lib/payout-rail/index.ts, tests/integration/document-gateway-live.test.ts, vercel.json
Review trigger: cambio de alcance, participantes, hosting o apertura

## Decision de alcance

El titular del proyecto eligio el 2026-11-05 el piloto comercial: la primera cohorte
debe poder recibir reservas reales cuando cumpla los controles de publicacion,
documentos, disponibilidad y operacion. El alcance esta decidido; la apertura NO
esta certificada. Estado de lanzamiento: BLOQUEADO hasta completar las puertas de
este runbook. No reinterpretar esta eleccion como permiso de merge o despliegue.

Una beta funcional no necesita todas las integraciones, pero si recorridos completos,
estados honestos y soporte. El numero pequeno de usuarios no reduce los requisitos de
aislamiento, permisos, respaldo ni seguridad documental. No se autoriza contratar,
cambiar variables, migrar datos ni habilitar trafico por publicar este documento.

Proponer una cohorte inicial de 3-5 proveedores invitados y hasta 20 usuarios totales.
Es un limite de admision propuesto, no capacidad medida ni cohorte aprobada. Product
debe confirmar participantes y responsable; Operations define horario y compromiso
de respuesta antes de invitar.

## Apertura elegida

### Operacion unipersonal temporal

Product, Operations, Finance y Engineering son funciones del titular, no departamentos
que contratar. Registrar verificaciones con identificador estable, sin exigir nombres
y apellidos aqui. Los contratos mantienen sus requisitos de identidad y representacion.

La asistencia automatizada ayuda con codigo y pruebas, no aprueba decisiones comerciales.
Revision externa solo ante exigencia aplicable de un tercero, contrato, norma o control
vigente: otra persona competente, distinta del titular. No requiere empleados ni segunda
firma rutinaria; no exime de obligaciones ni de firmas de proveedores.

Antes de invitar, el titular fija proveedores, reservas simultaneas, horario de soporte
y procedimiento ante su ausencia segun su capacidad real. La cohorte propuesta no es
un minimo: reducirla si no puede atenderla. No prometer soporte continuo sin cobertura;
pausar nuevas ventas si no puede atender incidencias y mantener gestion de las existentes.
Revisar esta restriccion al ampliar la cohorte o incorporar colaboradores.

Permitir reservas reales solo a una cohorte que cumpla todos los controles vigentes
de proveedor, producto y disponibilidad. Certificacion documental, cuando obligatoria,
y soporte/cancelacion probados son requisitos previos, no mejoras posteriores.
La preparacion de borradores y pruebas sinteticas es trabajo interno anterior a la
apertura, no el resultado comercial prometido. No simular aprobaciones para abrirla.

Modelo seleccionado para Bolivia: el viajero paga directamente al proveedor y Fastt
recibe por separado su remuneracion de intermediacion. Fastt no captura, custodia,
reparte ni reembolsa el importe del viajero. No requiere integrar una pasarela en Fastt.
La seleccion no acredita contratos firmados, tratamiento fiscal ni implementacion.
Finance y Operations deben ratificar condiciones, evidencias y responsabilidades.
Si una oferta exige cobro online por Fastt, queda fuera de este piloto.

## Base comercial y supuestos por ratificar

La guia es activa como procedimiento de apertura; los supuestos siguientes no son
tarifas publicadas, contratos aceptados ni funcionalidades certificadas:

- Mercado inicial decidido: Bolivia. Confirmar entidad legal de Fastt y titular de cada
  proveedor; operar en Bolivia no demuestra donde esta constituida una empresa.
- Propuesta inicial: pagar al llegar al alojamiento o antes de iniciar la actividad,
  sin anticipo obligatorio. Excluir ofertas que requieran deposito o garantia de no-show
  hasta aprobar otro flujo. Mostrar momento y medios aceptados antes de reservar.
- Propuesta: una moneda de precio, cobro y conciliacion por reserva, acordada de forma
  explicita. Priorizar BOB para la cohorte local, pendiente de aceptacion; no convertir
  tarifas USD existentes ni fijar tipos de cambio por defecto.
- Propuesta: comision por servicio realizado y cobro acreditado, con conciliacion mensual.
  Porcentaje, base, impuestos, moneda, vencimiento y vigencia deben acordarse por proveedor
  y linea. Ausencia de acuerdo no significa comision cero ni autoriza generar deuda.
- Propuesta: cobros excepcionales por cancelacion/no-show quedan en revision humana;
  no generan comision automatica. Si no hubo cobro, no hay base de comision.
- Una exencion de comision durante beta tambien necesita acuerdo explicito con vigencia.
  No abrir ofertas sin resolver sus condiciones economicas.

El [acuerdo economico de tours](../domains/tours/commercial-terms.md) sigue en borrador:
sus tasas, plazos y reglas no quedan aprobados por esta guia. Alojamiento necesita su
aceptacion propia; no hereda automaticamente el contrato de tours. Revision legal y
contable local pendiente antes de usar contratos y mensajes con viajeros reales.

## Tres recorridos comerciales a certificar

### Reserva, prestacion y comision

1. Mostrar vendedor, precio total, moneda, momento/medios de pago, cancelacion y soporte.
2. Confirmar solo con elegibilidad, inventario y condiciones vigentes; conservar su version.
3. El proveedor cobra fuera de Fastt y registra referencia, importe y fecha del cobro.
4. Operations registra prestacion o incidencia. Una declaracion unilateral conserva
   estado reportado; no equivale a verificacion bancaria ni conciliacion.
5. Finance concilia el importe elegible cobrado y no devuelto, aplica el acuerdo vigente
   y prepara el documento fiscal/comercial correspondiente. El proveedor paga la comision
   a Fastt por separado; no hay descuento automatico del pago del viajero.

No mezclar reserva confirmada, pago reportado, servicio realizado, partida conciliada
y comision pagada. Estos son requisitos del flujo, no estados ya certificados del codigo.
Sin desglose suficiente de impuestos/extras o evidencia, mantener la partida pendiente.

### Cancelacion o ausencia

Conservar actor, fecha, condiciones aplicables y motivo. Cancelar/liberar inventario
segun el ciclo certificado sin borrar la reserva. Sin cobro: sin comision. Con cobro
retenido: revisar legitimidad contractual, evidencia y devolucion pendiente antes de
conciliar. La cancelacion del proveedor requiere asistencia al viajero y revision
operativa; no se simula una prestacion. No prometer penalizaciones automaticas sin
un mecanismo real de cobro y autorizacion contractual.

### Devolucion, disputa y ajuste

Fastt registra el caso y da seguimiento; el proveedor devuelve el dinero que recibio.
Solicitud de devolucion no significa devolucion completada. Suspender la partida de
comision discutida, conservar evidencias y ajustar la base cuando se resuelva. Si ya se
cobro la comision, documentar credito/devolucion conforme al acuerdo, sin reescribir
el snapshot original. Separar disputa viajero-proveedor de disputa proveedor-Fastt.

Operations define canal, responsable, horario y escalamiento antes de abrir. Solicitar
solo referencias necesarias; no recopilar PAN/CVV, claves bancarias ni extractos completos
como evidencia rutinaria. El modelo de intermediacion no elimina responsabilidades.

## Brechas de implementacion del modelo

Engineering debe verificar UI, API, notificaciones y contratos por linea antes de la
apertura. `src/lib/policies/policy-business-contract.ts` permite `prepayment` y declara
`platformCollectsFunds: true` para hotel; tours admite `pay_at_property` sin cobro por
plataforma. Revisar consumidores y limitar las ofertas del piloto en servidor, sin
cambiar globalmente contratos existentes ni relajar readiness para admitirlas.

`src/lib/payments/live-money-activation.ts` mantiene el ejecutor no disponible. No
activar sus flags para registrar pagos externos ni para cobrar manualmente la comision.
Certificar que confirmaciones, emails y pantallas no afirmen que Fastt cobro o garantiza
una devolucion. Probar permisos del registro de cobro, auditoria, idempotencia, cambios
de condiciones y aislamiento entre proveedores. Conciliacion manual inicial solo con
procedimiento aprobado, acceso restringido y trazabilidad; nunca como pago simulado.

## Alcance por funcion

- Auth y equipo: login, logout, recuperacion, invitaciones, roles y aislamiento entre
  proveedores deben funcionar de extremo a extremo. Certificar entrega de correo real
  a destinatarios controlados y limites de reenvio antes de abrir invitaciones.
- Catalogo, tarifas y calendario: habilitar edicion y consulta a la cohorte despues de
  probar persistencia, permisos, invalidacion de cache y errores recuperables. Mostrar
  readiness real; un borrador no se convierte en oferta vendible por pertenecer a beta.
- Inventario y reservas: probar concurrencia, hold, expiracion, confirmacion idempotente
  y cancelacion. Durante el piloto comercial usar cupo dedicado a Fastt o un procedimiento
  certificado de conciliacion; no vender el mismo cupo externo sin control de conflictos.
- Documentos: recopilar requisitos y mostrar estado real. No ofrecer carga de originales
  sensibles cuando almacenamiento/inspeccion no esten operativos y certificados. Mantener
  consulta existente solo segun permisos y controles tecnicos vigentes. No abrir originales
  sin inspeccion ni sustituirla por revision humana. Un resultado limpio requiere revision
  humana posterior y no demuestra autenticidad.
- Integraciones: mostrar estado honesto; no presentar conectores sin certificar como
  conectados. Channex/otros channel managers quedan en sandbox hasta certificar mappings,
  sincronizacion inicial, reintentos, ACK, reservas modificadas/canceladas y scheduler.
- iCal: solo habilitar tras prueba de importacion/exportacion, antiguedad visible y manejo
  de conflictos. No prometer tiempo real ni usar un feed desactualizado como unica garantia
  para cupo compartido. Si no se cumple, mantener operacion manual con cupo dedicado.
- Financial: consultas y registros existentes, con distincion entre datos preparatorios,
  simulados y movimientos reales. No ofrecer cobros, reembolsos o payouts no implementados.
- Identidad externa, bureau fiscal e IA: fuera del alcance inicial. La ausencia del servicio
  no equivale a verificacion positiva ni habilita una capacidad bloqueada.

## Documentos e integraciones: implementacion pendiente

Verificar gates UI/API/cron en servidor, desactivados para capacidades no disponibles;
ocultar botones no basta. Probar permisos, doble envio y caida del servicio sin exito
simulado ni cola ilimitada. Pausar/drenar trabajos conservando archivos e historial.
Fixtures locales no certifican procesamiento hospedado. Aprobar hosting/costo antes de
desplegar; Render no es obligatorio. No usar laptops, correo o scanners publicos para
documentos reales. Aplicar el runbook documental enlazado.

## Orden de ejecucion y control de salida

1. Verificar recursos por entorno, aislamiento y restauracion. Preview no debe escribir
   en produccion. No reutilizar fastt backup sin decision expresa y preservacion.
2. Aprobar cohorte, contratos, medios/momento de pago, cupo dedicado y soporte.
3. Certificar documentos hospedados y elegibilidad real; no usar originales en laptops.
4. Probar reserva, precio/politicas congelados, concurrencia, expiracion, idempotencia,
   cancelacion, pago externo y conciliacion en entorno aislado; nunca produccion.
5. Ensayar incidente y rollback conservando reservas existentes y evidencia.
6. Revisar todas las puertas siguientes y autorizar apertura acotada; medir antes de ampliar.

Todos estos pasos siguen pendientes de certificacion. Las autorizaciones limitadas de
los ADR 0007/0008 no se amplian: no autorizan migracion o activacion productiva por el
hecho de elegir el piloto. Tampoco se autoriza contratar Render u otro servicio pago.

## Registro de apertura y decision go/no-go

En cada apertura/ampliacion, enlazar certificacion fechada sin secretos desde el indice.
Cada puerta necesita entorno, commit probado, responsable, resultado
y referencia a evidencia. En operacion unipersonal, identificar al titular y la funcion
asumida; no registrar equipos inexistentes ni presentar auto-revision como independiente.

- [ ] Product: cohorte nominal, ofertas admitidas, limites y modelo de pago aceptados.
- [ ] Finance y asesor local: entidad, contratos, base/tasa/moneda, impuestos, vencimiento,
  devoluciones y mecanismo separado de comision aprobados por linea y proveedor.
- [ ] Engineering: destinos efectivos de Preview/Production verificados, staging aislado
  y restauracion probada. El nombre de un proyecto backup no satisface esta puerta.
- [ ] Security/Operations: documentos obligatorios y procesamiento hospedado certificados;
  permisos negativos, inspeccion, revision humana y recuperacion probados.
- [ ] Engineering/Operations: catalogo, disponibilidad, hold/confirm/cancel, pago externo,
  conciliacion y excepciones probados; emails reales entregados a cuentas controladas.
- [ ] Operations: responsables nominales y canal/horario de soporte; incidente ensayado.
- [ ] Engineering: observabilidad, rollback, limites de admision y alertas comprobados.
- [ ] Titular: planes elegibles para uso comercial, presupuesto y cuotas aprobados.
- [ ] Product y responsables anteriores: decision go explicita sobre evidencia vigente.

Ninguna casilla queda certificada aqui. Reverificar pendientes previos: aislamiento de
Preview/staging, documentos hospedados, restauracion y conciliacion de servicios.

Si una puerta falla, registrar no-go y resolverla antes de admitir viajeros. No sustituir
hosting certificado por laptop ni suprimir documentos obligatorios para mantener costo
cero. Si el plan gratuito no permite uso comercial o no soporta controles esenciales,
presentar alternativa viable o costo para aprobacion; sin solucion, mantener cierre.

Tras go: desplegar el commit certificado con autorizacion, ejecutar smoke controlado
sin cargos ni reservas ficticias sobre cupo vendible y abrir solo la cohorte aprobada.
Supervisar diariamente reservas, incidencias, errores, latencia, colas y cuotas durante
la primera semana. Comparar semanalmente costos/consumo y conciliar comisiones por el
periodo acordado. Ampliar solo tras revision explicita de evidencia, no por calendario.

Ante doble venta, fuga de datos, error de precio/cobro o perdida de inspeccion requerida,
pausar nuevas operaciones afectadas; conservar gestion de reservas existentes y soporte.
Registrar responsables, comunicacion y recuperacion. Reabrir solo tras corregir y
recertificar el recorrido afectado. Esta guia no ejecuta merge, despliegue ni apertura.

Pruebas existentes relevantes, no ejecutables contra produccion como certificacion:

- Documentos: `tests/integration/document-gateway-live.test.ts`,
  `tests/integration/document-inspection-worker.test.ts` y
  `tests/integration/provider-document-submission-recovery.test.ts`.
- Elegibilidad: `tests/integration/provider-governance.test.ts`.
- Inventario/reservas: `tests/integration/inventory-hold.test.ts`,
  `tests/integration/inventory-flow.test.ts` y
  `tests/integration/booking-operations-lifecycle.test.ts`.
- Equipo: `tests/integration/provider-team-invitations.test.ts`.

Las suites no sustituyen el recorrido hospedado ni acreditan cobertura por existir.

Ante crecimiento de cola o consumo, limitar nuevas solicitudes antes del agotamiento;
no cancelar servicios ni eliminar evidencia automaticamente.

## Fuentes vigentes

- [Servicios y hosting pausado](../domains/platform/service-landscape.md).
- [Procesamiento documental](document-processing-deployment.md).
- [Operacion de integraciones](../engineering/provider-integration-operations-runbook.md).
- [Activacion de dinero real](../payments/live-money-activation.md).
- [Observabilidad](../performance-observability.md).

No acredita certificacion: piloto elegido; implementacion, pruebas y apertura pendientes.
