# Acuerdo económico inicial de tours

Status: draft
Document type: canonical
Owner: Dirección / Finanzas
Last verified: 2026-09-28
Scope: modelo económico propuesto para reservas de tours con cobro directo en Bolivia
Source of truth: acuerdo aceptado por Fastt y cada proveedor; este borrador define la propuesta, no acredita aceptación
Related code/tests: src/shared/infrastructure/db/schema/tables.ts, src/lib/verification/commercial-lines.ts, src/lib/provider-tax-configuration.ts, src/lib/payments/live-money-activation.ts, src/modules/financial/domain/commission-snapshot.ts
Review trigger: aceptación del primer acuerdo, cambio de titular, tasa, modalidad de cobro, emisor fiscal o procesador

## Estado y alcance

Esta propuesta separa la venta al viajero de la remuneración de Fastt. No es un contrato
firmado, una tarifa publicada ni autorización para cobrar. La matriz de habilitación de
tours permanece en [borrador](./policy-annex.md) hasta su ratificación; este documento no
sustituye sus tres aprobaciones. Antes de cobrar una comisión se necesita el acuerdo
aceptado por ambas partes y el proceso fiscal/contable correspondiente.

Aplica a tours con `property_collect`: el negocio proveedor presta la experiencia y cobra
directamente al viajero. Fastt facilita la reserva y no captura, custodia, divide ni
reembolsa ese pago. El administrador de la cuenta no adquiere por su rol una participación
personal en el precio del tour. Una cuenta bancaria registrada tampoco activa liquidaciones.

## Partes y responsabilidades separadas

El acuerdo se identifica por **proveedor + línea tours + versión + periodo de vigencia**.
La ficha de un tour y cada reserva deben poder señalar qué versión aceptada les aplica.
Las siguientes funciones son independientes aunque una misma persona jurídica pueda
cumplir varias. Cada una requiere identidad explícita y fuente verificable:

| Concepto | Decisión para el inicio | Dato y autoridad; nunca inferir de |
| --- | --- | --- |
| Vendedor del servicio | El titular legal del negocio proveedor que contrata con Fastt y ofrece el tour. Debe identificarse con nombre legal y registro fiscal aplicable. | `Provider` y `ProviderHolderProfile`, verificados para el contrato. El nombre comercial, el guía y el usuario que inició sesión no identifican al vendedor. |
| Prestador operativo | Puede coincidir con el vendedor o ser un guía/equipo bajo su responsabilidad. | Contexto operativo y evidencia por experiencia/salida. Ser guía no convierte a esa persona en vendedor ni beneficiario. |
| Beneficiario del pago del viajero | En el alcance inicial de cobro directo es el mismo titular vendedor. Recibe el pago fuera de Fastt. | Aceptación contractual e identidad del titular. `ProviderPaymentAccount` sólo prepara una eventual liquidación de Fastt; no prueba quién recibió un cobro directo. Un tercero beneficiario exige acuerdo propio y revisión, no un cambio de usuario administrador. |
| Canal y responsable del cobro | `property_collect` significa **cobro directo por el vendedor**; la forma y el momento acordados con el viajero se muestran por oferta. | `ProviderCommercialLine.collectionModel` registra la declaración por línea, pero no acredita un pago ni habilita una pasarela. `platform_collect` queda fuera de esta propuesta. No heredar la elección de alojamiento. |
| Deudor y acreedor de comisión | El vendedor titular paga la comisión pactada a Fastt; Fastt es acreedor únicamente de la partida conciliada. | Tasa, base, moneda, vigencia y aceptación del acuerdo. Un `CommissionSnapshot` o un porcentaje de demostración no es aceptación ni factura. El administrador no recibe comisión por su rol. |
| Emisor fiscal del servicio | Lo determina el encuadre tributario y contractual del vendedor para el concepto vendido; no se elige libremente en el formulario de identidad. | Identidad fiscal verificada y decisión fiscal revisada. `ProviderTaxConfiguration.invoicingMode` es un dato heredado de cuenta y no autoriza a Fastt a facturar el tour. |
| Emisor fiscal de la comisión | Fastt documenta su propia comisión conforme al régimen y acuerdo aplicables; es una operación distinta de la venta del tour. | Revisión fiscal y documento emitido. La confirmación de reserva y `fiscal_snapshot` no son facturas fiscales por sí solos. |
| Administrador autorizado | Usuario con permisos para operar la cuenta. Sólo una persona con representación comprobada puede aceptar o modificar un acuerdo en nombre del titular. | `ProviderUser` y mandato/representación revisados. `owner` o `admin` son permisos de software, no prueban titularidad, facultad de firma ni derecho a cobrar. |

**Alcance inicial:** vendedor, beneficiario del cobro directo y deudor de la comisión
coinciden en el mismo titular verificado; Fastt es el acreedor de su comisión. Un tour
publicado por un intermediario en nombre de otro prestador, un beneficiario tercero o un
emisor fiscal distinto requiere identificar las partes, su mandato y un acuerdo específico.
Hasta entonces no se fuerza la coincidencia ni se inventa un titular: el contrato queda
pendiente de revisión.

Para un proveedor mixto, sólo se comparte la identidad del titular cuando corresponde.
Cada línea conserva su canal de cobro, condiciones económicas, aceptación y versión.
El mismo usuario puede administrar alojamiento y tours sin que ello unifique sus
beneficiarios, comisiones o emisores fiscales.

### Mínimos de la versión aceptada y de la reserva

El acuerdo aceptado debe registrar IDs del proveedor y línea, vendedor/titular,
beneficiario, modelo de cobro, acreedor y deudor de comisión, tasa y base, moneda,
vigencia, referencia de condiciones, emisor fiscal por concepto, identidad y facultad
del firmante, fecha de aceptación y versión. Una modificación crea otra versión; no
reescribe la anterior. Los cambios de titular, beneficiario, cobro o emisor fiscal
requieren nueva revisión antes de aplicarse a reservas futuras.

La reserva conserva referencia a esa versión, vendedor, canal de cobro, moneda, precio
y condiciones vigentes. El cobro acreditado, la prestación, las devoluciones y la
comisión conciliada son eventos posteriores con su propia evidencia. Una confirmación
de reserva no se transforma en prueba de pago, factura ni orden de liquidación.

En el esquema actual, `ProviderCommercialLine` sólo guarda la modalidad declarada;
`ProviderTaxConfiguration` guarda un `invoicingMode` global con valor predeterminado;
`CommissionSnapshot` guarda una tasa sin referencia al acuerdo aceptado. Son fuentes
parciales. El contrato anterior define los datos que faltan; no deben completarse
desde esos campos por inferencia ni considerarse activados por este documento.

## Propuesta económica inicial

| Decisión | Regla propuesta |
| --- | --- |
| Modelo | Comisión variable por reserva; no suscripción mensual ni cargo fijo por alta. |
| Deudor | El titular del negocio proveedor aceptante debe a Fastt la comisión. El viajero no recibe un recargo de Fastt por esta comisión. |
| Tasa | Se fija por proveedor y línea tours en un acuerdo aceptado, con moneda, vigencia y versión. Sin tasa aceptada no se presume 0 %, 15 % ni otra cifra; la reserva no genera una deuda de comisión liquidable automáticamente. |
| Base | Precio del servicio turístico efectivamente cobrado y no devuelto al viajero, en la moneda contractual. Se excluyen impuestos/tasas separados y verificables, propinas y cobros de terceros que el contrato excluya expresamente. Si no hay desglose fiable, la base queda pendiente de conciliación; no se estima. |
| Nacimiento | La confirmación de reserva fija la versión contractual y una base potencial. La comisión se devenga sólo después de prestado el servicio o vencido el plazo de cancelación con importe legítimamente retenido **y** una vez acreditado el cobro efectivo del proveedor. Hold, reserva pendiente y precio cotizado no crean deuda exigible. |
| Importe | `base conciliada × tasa contractual`; se redondea una vez en la moneda de la base según el acuerdo. Se conserva snapshot de tasa, base, moneda, reservas/ajustes y versión. No se recalculan reservas históricas al modificar la tasa. |
| Liquidación | Conciliación por periodo mensual. Fastt emite el documento de su comisión conforme al régimen aplicable; plazo de pago propuesto: 15 días calendario desde su emisión. No se debita la cuenta del proveedor ni se descuenta del pago del viajero. |

La fecha de inicio, porcentaje, moneda de facturación, tratamiento de tipo de cambio y
referencia del acuerdo deben completarse antes de pasar este documento a `active` o
generar una obligación cobrable. Un valor en datos de demostración no constituye tarifa.

## Cancelaciones, cambios y disputas

| Resultado de la reserva | Base de comisión propuesta |
| --- | --- |
| Cancelación con devolución íntegra | Cero. Si ya se facturó, emitir el ajuste correspondiente. |
| Cancelación con devolución parcial | Sólo la parte del servicio retenida legítimamente y efectivamente cobrada; excluir cargos ajenos conforme al contrato. |
| No presentación | Sólo el importe contractualmente retenido y cobrado; no asumir que equivale al precio total. |
| Cancelación por el proveedor o imposibilidad de prestar | Cero sobre lo devuelto. Cualquier importe retenido por una excepción requiere revisión humana y base contractual. |
| Cambio de fecha/opción o importe | Mantener trazabilidad de la reserva original y sus ajustes; conciliar sobre el cobro final de la prestación. |
| Contracargo, devolución o cobro disputado | Suspender la partida afectada y ajustar el siguiente periodo; no tratar una declaración unilateral como cobro definitivo. |

El proveedor debe informar cobros y devoluciones con referencia a la reserva. Finanzas
concilia esos datos con evidencia admisible y conserva estados **pendiente**, **conciliado**
y **disputado**. Fastt no debe afirmar al viajero que el pago está acreditado sólo porque
la reserva fue confirmada. La disputa de una comisión se revisa antes del cobro; los
snapshots originales de reserva y condiciones permanecen inmutables.

## Decisiones necesarias antes de activar

1. Dirección fija o acepta la tasa por proveedor, el tratamiento de impuestos no
   desglosados, moneda, conversión, vigencia y mecanismo de aceptación del acuerdo.
2. Finanzas valida la factura de comisión, la periodicidad, el plazo y la evidencia de
   cobro/devolución. Un snapshot financiero existente no es una factura ni un débito.
3. Operaciones certifica que las políticas de cancelación y los estados de reserva
   permiten calcular la base retenida sin confundir cotización, hold y dinero recibido.
4. Sólo después se habilitan la comunicación y el cobro de la comisión en producción.

El cobro integrado y el reparto automático son otra modalidad, con contrato e
infraestructura propios. Su puerta operativa está en [activación de dinero real](../../payments/live-money-activation.md).
