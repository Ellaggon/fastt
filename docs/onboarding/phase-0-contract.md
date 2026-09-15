# Onboarding · Fase 0: contrato y línea base

Fecha: 14 de septiembre de 2026. Versión: `2026-09-14.1`.

Parte del [plan integral de onboarding](/Users/ellaggon/Projects/fastt/docs/fastt-onboarding-ux-audit-2026-09-13.md). Código base inspeccionado: `105e410e43eb6f3c5ae4efc8968e58c53f4d6e36`.

**Estado:** entregables contractuales preparados, reglas de dominio contrastadas con pruebas ejecutables y línea base consultada. La certificación de integración con la base aislada queda pendiente por una conexión de tests inválida. No declarar la fase cerrada sin esa salvedad. Ver [evaluación de cierre](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-0-closeout.md).

## 1. Decisiones del primer incremento

| ID | Decisión | Consecuencia para las fases siguientes |
|---|---|---|
| D01 | **Nombre comercial y razón social continúan obligatorios al crear negocio**, ambos con al menos dos caracteres después de trim, según el esquema actual | Fase 1 mejora el contexto y la continuidad; no oculta el campo ni inventa un nombre |
| D02 | Conservar reglas actuales de habilitación; no introducir excepciones por persona, país o actividad en este incremento | Una selección persona/empresa no cambia los bloqueos hasta implementar la matriz correspondiente |
| D03 | El alojamiento del primer incremento utiliza `hotel` + `hotel_room` | Vivienda completa, dormitorios vendidos por cama y combinaciones de inventario quedan fuera de la promesa inicial |
| D04 | El correo de soporte guardado en `ProviderProfile.supportEmail` es necesario para publicar y aceptar reservas | Fase 1 debe exigirlo/explicarlo de forma coherente; no se presume fallback al correo de login |
| D05 | Preparación del producto, habilitación del negocio, autorización del actor y disponibilidad comercial son ejes separados | El resumen agregado futuro no puede anunciar “reservable” por un porcentaje |
| D06 | Preservar retorno de viajero e invitación antes de aplicar bienvenida de proveedor | No convertir todo signup en alta de proveedor |
| D07 | No hacer obligatorias integraciones ni cuenta de cobro para redactar una ficha | Cada bloqueo se aplica a su capacidad específica |
| D08 | Sólo productos `production` de proveedores `commercial` y `production` son elegibles para publicación pública | Un fixture completo no debe publicarse ni reclasificarse automáticamente |
| D09 | No añadir cambios de interfaz, redirecciones ni políticas regulatorias en fase 0 | Su implementación pertenece a fases 1–4 y debe usar este contrato |

Estas decisiones fijan la continuidad con reglas ya implementadas bajo el encargo de fase 0. No representan una aprobación legal nueva ni una revisión humana realizada por responsables externos. No se contactó a terceros ni se alteraron estados de aprobación de proveedores.

## 2. Responsabilidades

| Área | Responsabilidad concreta | Evidencia de salida |
|---|---|---|
| Producto | Alcance del incremento, estados comprensibles y límites de lo que se ofrece | D01–D09 y catálogo de casos |
| Diseño | Mostrar siguiente paso, motivo de bloqueo y diferencia entre guardado/revisión/activación | Mapa de estados y copy contractual; implementación en fase 1 |
| Backend | Mantener evaluadores como fuente de verdad, pertenencia, elegibilidad y revalidación | Escenarios y pruebas; integración SQL pendiente |
| Políticas del proveedor | Resolver futura aplicabilidad por persona/empresa, país y actividad | En fase 0 se conserva la política implementada; las excepciones futuras requieren definición expresa |

## 3. Mapa de estados y transiciones

### 3.1. Acceso y contexto

| Estado de experiencia | Entrada / condición | Siguiente paso contractual | Persistencia actual |
|---|---|---|---|
| No autenticado | No hay sesión | Autenticarse conservando destino válido | Cookies y `returnTo` |
| Viajero | Intención o destino de reserva/viaje | Retornar al contexto del viajero | No hay un enum universal de intención en el registro inspeccionado |
| Invitación pendiente | Token de invitación y sesión adecuada | Aceptar o mostrar error de invitación | Invitación existente; no crear negocio |
| Proveedor sin negocio | Intención de ofrecer y ausencia de vínculo | Bienvenida y datos obligatorios D01 | Hoy dashboard redirige a perfil; nueva entrada en fase 1 |
| Negocio sin oferta | Proveedor asociado, cero productos | Crear primer servicio | Proveedor + productos existentes |
| Oferta en preparación | Producto incompleto | Reanudar primer pendiente accionable | Datos de producto; recorrido persistente integral pendiente |
| Oferta completa, negocio pendiente | Producto listo y capacidad requerida falsa | Corregir o esperar revisión, continuar editando | Gobernanza y preparación separadas |
| Lista para solicitar publicación | Preparación y habilitación favorables, elegibilidad comercial correcta | Publicación explícita, revalidada en servidor | No confundir con `Product.publicationState=ready` aislado |
| Operación | Publicado; disponibilidad calculada según consulta | Administrar reservas/inventario | Publicación, variantes, precios, restricciones e inventario |

### 3.2. Estados persistidos y estados derivados

| Entidad / señal | Estados o condición relevantes | Interpretación |
|---|---|---|
| `Provider.status` | `draft`, `active`, `archived` en el contrato de alta inspeccionado | No sustituye a las capacidades: el evaluador de gobernanza no calcula habilitación sólo desde este campo |
| `Product.publicationState` | `draft`, `ready`, `published` | `ready` describe evaluación de producto; falta aplicar todos los demás controles |
| `Variant.lifecycleState` | `draft`, `ready`, `archived` | Variante y producto tienen ciclos independientes |
| `Variant.salesEnabled` | Booleano; exige lifecycle `ready` por constraint | Una variante preparada puede seguir cerrada a venta |
| Verificación del proveedor | La última fila debe estar `approved` | `pending` no habilita publicar/reservar |
| Registro fiscal | Debe estar `verified` | Tener país, número o impuestos activos no equivale a verificación |
| Documentos | Tipos requeridos en estado `verified` | Pendientes/rechazados no cuentan; existe puente fiscal documentado abajo |
| Cuenta de cobro | Al menos una `verified` | Un rollup financiero `ready` no sustituye una cuenta verificada |
| Reservable | Resultado contextual: fechas, ocupación/participantes, precio, cupo, restricciones y canal | No se añade un booleano permanente que quede obsoleto |

Transición de producto actual: la evaluación puede persistir `draft` o `ready`; publicar vuelve a evaluar y persiste `published` cuando es admisible. **El endpoint de evaluación no es una consulta inocua para una auditoría de datos reales.** Por eso la línea base utiliza SQL de sólo lectura y no llama a `/api/product/evaluate`.

Mensajes contractuales: “Borrador guardado”; “Ficha completa; falta verificar el registro fiscal”; “En revisión; puedes seguir editando”; “Publicado, sin fechas disponibles”. La futura interfaz no debe usar esos textos de manera intercambiable.

## 4. Casos de alojamiento soportados en este incremento

| Caso | Decisión | Límite |
|---|---|---|
| Hotel con un tipo de habitación y una unidad | Dentro del alcance `hotel` | Requiere habitación vendible y condiciones completas |
| Hotel con varios tipos y varias unidades | Dentro del modelo existente | Diferenciar tipo, número de unidades, capacidad e inventario por fecha |
| Hostal/establecimiento que vende habitaciones completas | Admitido sólo bajo el mismo contrato hotelero y tipos de catálogo realmente disponibles | La etiqueta comercial no habilita venta por cama |
| Hotel con habitaciones incompletas adicionales | Puede tener al menos una habitación vendible; la evaluación no exige completar todas | Las no vendibles no deben presentarse como reservables |
| Varios alojamientos del mismo negocio | Modelo de múltiples productos | Mantener alcance de propiedad al editar; UX profesional en fases posteriores |
| Negocio con hotel y tours | Modelo de verticales existente | Preparar uno primero; no exigir dos wizards simultáneos |
| Vivienda completa con dormitorios descriptivos | Fuera del primer incremento; `rental` está `planned` | No camuflarla como habitación sin certificar inventario/checkout |
| Dormitorio compartido vendido por cama | No certificado dentro del alcance | Requiere contrato de inventario propio |
| Venta simultánea de vivienda completa y sus habitaciones | Fuera del alcance | Riesgo de inventario relacionado; no prometer soporte |

La lista es de modelos de venta, no de licencias turísticas ni de jurisdicciones autorizadas. El primer incremento no amplía países, monedas ni tipos comerciales simplemente agregando opciones visuales.

## 5. Política persona / empresa

El alta actual no tiene un discriminador persona/empresa en el esquema de identidad inspeccionado: exige `displayName` y `legalName`. El set documental base contiene identificación gubernamental, registro mercantil y documento fiscal. La presencia de un registro fiscal verificado con NIT/TIN puede satisfacer el componente documental fiscal.

**Decisión:** conservar ese comportamiento en incremento 1 y no prometer onboarding documental adaptado a personas naturales. Una persona puede preparar datos y oferta bajo los contratos actuales, pero no se le garantiza que esté habilitada para cobrar si su situación no satisface la política vigente. No rellenar razón social con el nombre comercial sin decisión del titular, no subir documentos ficticios y no marcar requisitos como “no aplica” sólo en frontend.

Copy de transición recomendado: “Nombre legal del titular o razón social, tal como aparece en tus documentos”. Esa aclaración no elimina el requisito de registro mercantil ni crea una excepción de verificación. Si la política de Fastt no admite un caso, la interfaz debe explicarlo antes de prometer activación.

La fase 4 deberá definir entidad/titular, país, actividad, evidencias admitidas, reutilización y responsable de revisión. Si se decide adelantar esa capacidad, hay que reabrir D02 y ampliar el alcance; no tratarla como un ajuste de texto de fase 1.

## 6. Matriz exacta de habilitación del negocio

Esta tabla describe `evaluateProviderGovernance`. **No es la totalidad del checkout ni una matriz de permisos de usuarios.**

| Requisito | Regla actual | Publicar | Aceptar reservas | Capacidad `payments` | Integraciones |
|---|---|:---:|:---:|:---:|:---:|
| Identidad | Nombre comercial y legal no vacíos | Sí | Sí | Sí | Sí |
| Operación | Zona, moneda y `supportEmail` no vacíos | Sí | Sí | No | No |
| Verificación | Última revisión `approved` | Sí | Sí | Sí | Sí |
| Documentos | Set requerido verificado, con puente fiscal | No | No | Sí | Sí |
| Fiscalidad | Configuración fiscal `verified` | Sí | Sí | Sí | No |
| Cuenta para cobrar | Al menos una cuenta `verified` | No | No | Sí | No |
| Equipo | Existe miembro owner/admin | Sí | Sí | Sí | Sí |
| Conector | Connected y último sync success/ok | No | No | No | Sí |

“Sí” significa que ese requisito participa en la capacidad; “No” no significa que el dato carezca de utilidad en otros procesos. Los avisos de impuestos comerciales ausentes, conectores pendientes o inconsistencias de rollup son señales distintas de los bloqueos usados en esta matriz.

Los predicados de gobernanza de identidad/operación verifican presencia, mientras que los esquemas de guardado validan formato. El contrato de creación D01 continúa aplicando el mínimo de dos caracteres. No asumir que una importación antigua pasó las validaciones de creación sólo porque el valor está presente.

### 6.1. Escenarios de paridad

Cada escenario parte de un proveedor con todos los requisitos salvo integraciones y elimina únicamente el requisito indicado. [JSON ejecutable de escenarios](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-0-scenarios.json).

| ID | Falta | Publicar | Reservas | Payments |
|---|---|:---:|:---:|:---:|
| P00 | Nada | ✓ | ✓ | ✓ |
| P01 | Identidad | — | — | — |
| P02 | Correo operativo | — | — | ✓ |
| P03 | Aprobación | — | — | — |
| P04 | Fiscalidad verificada | — | — | — |
| P05 | Documentos mínimos | ✓ | ✓ | — |
| P06 | Cuenta de cobro verificada | ✓ | ✓ | — |
| P07 | Owner/admin en equipo | — | — | — |

Estos resultados se contrastan con el evaluador real del servidor en [pruebas de dominio](/Users/ellaggon/Projects/fastt/tests/unit/onboarding-phase0-governance.test.ts); sólo se sustituye la lectura del almacenamiento. También se preparó [la prueba equivalente contra PostgreSQL aislado](/Users/ellaggon/Projects/fastt/tests/integration/onboarding-phase0-contract.test.ts), cuya ejecución no pudo certificarse por la conexión de tests.

### 6.2. Publicación: orden completo de controles

En el endpoint inspeccionado: sesión autenticada → proveedor asociado → producto perteneciente al proveedor → capacidad `publish` → evaluación de producto (reglas base y validación canónica adicional) → elegibilidad comercial → persistencia de publicación.

La elegibilidad comercial del repositorio exige producto `dataClass=production`, proveedor `dataClassification=production` y `accountPurpose=commercial`. Los fixtures completos pueden quedar preparados, pero no se convierten en anuncios públicos. El test de ese comportamiento usa un repositorio controlado, sin publicar fixtures reales.

**Hallazgo adicional:** `assertProviderCapability` devuelve permisos, pero no exige por sí mismo que el actor sea owner/admin. `/api/product/publish` comprueba pertenencia al proveedor; no usa un permiso específico `canPublish`. No documentar que sólo el propietario puede publicar cuando ese contrato aún no existe. Una restricción adicional necesita decisión y prueba propias antes de añadirse.

### 6.3. Producto hotelero y tour

Hotel: identidad/destino, contenido y destacados, fotos, coordenadas, subtipo, habitación con perfil/capacidad/camas y al menos una habitación vendible; reglas esenciales para huéspedes y categorías de políticas efectivas. Las categorías consultadas son Cancellation, Payment, CheckIn y NoShow. Una habitación vendible requiere su preparación comercial, no sólo haber sido creada.

Tour: identidad/destino y contenido, mínimo de cinco fotos y tres pasos de itinerario, duración, encuentro, inclusiones, categoría, participantes activos y salida completa. El evaluador canónico añade los requisitos por sección, incluidas políticas y disponibilidad. Usar las constantes y evaluadores existentes para no crear una segunda lista divergente.

La preparación tiene más de una capa: `evaluateProductReadiness` aplica comprobaciones base y llama al resolvedor canónico adicional. La vista previa no puede sustituir toda esa evaluación por `loadCompleteToPublishState` aislado. La agregación de fase 1 debe incluir ambos niveles y la elegibilidad comercial.

Las [pruebas de producto de fase 0](/Users/ellaggon/Projects/fastt/tests/unit/onboarding-phase0-product.test.ts) cubren para hotel y tour: datos preparados elegibles, bloqueo adicional de disponibilidad y propietario/producto no elegible para producción. Ejecutan el caso de uso real con repositorio y respuesta del resolvedor adicional controlados; no certifican el calendario SQL ni una reserva real.

### 6.4. Reservas y cobros

La confirmación inspeccionada resuelve el proveedor del hold y exige `booking`. Para tours también aplica flags de checkout. Después intervienen hold, cotización, inventario, restricciones, idempotencia y creación de la reserva. No se debe exigir que el viajero sea miembro del equipo del proveedor.

`payments` es la habilitación de negocio utilizada por superficies financieras; no significa “un pago fue ejecutado”, “hay saldo disponible” ni “todos los endpoints de movimiento de dinero usan este único gate”. La gestión de cuentas también comprueba permisos como `canManagePayments`. La capacidad del negocio puede ser verdadera para un staff cuyo permiso de gestionar pagos sea falso; ese caso tiene prueba.

No existe en lo inspeccionado un criterio universal “banco verificado antes de crear cualquier reserva”. No inventarlo en onboarding. Tampoco deducir de esta matriz que un desembolso está autorizado: sus requisitos, permisos y controles transaccionales siguen vigentes.

## 7. Estrategia de regreso para viajeros e invitados

Orden de resolución para fase 1:

1. Flujos de autenticación especializados (recuperación/MFA/callback) completan su tarea sin ser capturados por onboarding.
2. Invitación válida conserva su destino y valida identidad del invitado; cuenta equivocada, token vencido o cancelado conservan acciones de recuperación del flujo.
3. Destino local válido y autorizado de viajero vuelve a reserva/viaje/búsqueda. No crear proveedor.
4. Intención explícita de ofrecer sin proveedor conduce a bienvenida, conservando vertical y destino posterior.
5. Miembro de negocio existente vuelve al contexto autorizado, sin crear otro negocio.
6. Sin intención ni destino inequívoco, mostrar elección de uso. No asumir proveedor para todos.

Actualmente signup/signin/callback usan `returnTo` con fallback `/dashboard`; dashboard deriva a perfil cuando no hay proveedor. El alta de invitación preserva el token a través del login y, tras aceptar, dirige a Equipo con `result=joined`. Esa continuidad existente debe preservarse aunque el destino final de onboarding mejore.

`sanitizeReturnTo` es una validación de forma básica, no autorización de ruta: sólo un camino local admitido y autorizado puede usarse como retorno. Fase 1 debe probar rutas de autenticación recursivas, rutas de otro proveedor y entradas malformadas, además de enlaces externos. No agregar tokens a métricas ni logs de navegación genéricos.

La intención se debe conservar de forma acotada antes de existir proveedor; el destino solicitado se revalida después de autenticar. No convertir el registro normal en un mecanismo que crea un negocio con cada reintento.

## 8. Escenarios para las fases siguientes

| ID | Caso | Resultado de aceptación | Fase |
|---|---|---|---|
| R01 | Alta desde viaje/checkout | Regresa al viaje, no crea proveedor | 1 |
| R02 | Alta para ofrecer tour y confirmación de email | Recupera intención de tour | 1 |
| R03 | Invitación con login/registro intermedio | Acepta en negocio correcto; sin duplicación | 1 |
| R04 | Invitación vencida/cuenta equivocada | Error contextual y recuperación | 1 |
| R05 | Destino externo, malformado o sin permiso | Fallback seguro, no navega ni autoriza por query | 1 |
| R06 | Cuenta existente operativa | No fuerza el nuevo onboarding | 1 |
| A01 | Producto completo con fiscal pendiente | No afirma habilitación para publicar | 1 |
| A02 | Provider listo con producto incompleto | Muestra pendiente concreto del producto | 1 |
| A03 | Fixture preparado | Explica elegibilidad; nunca reclasifica automáticamente | 1 |
| A04 | Staff con negocio habilitado | Respeta permisos reales de cada acción | 1 |
| C01 | Hotel/tour: guardar, salir y volver | Recupera lo persistido y contexto correcto | 2 |
| C02 | Expirar sesión y usar otro dispositivo | Recupera borrador persistente tras autenticación | 2 |
| C03 | Doble clic, red interrumpida y reintento | No duplica proveedor/producto/variante/salida | 2 |
| C04 | Deep link, retroceso y pasos previos | Conserva producto/variante/tarifa; no avanza por query sin requisitos | 2 |
| C05 | Teclado y móvil | Foco, errores, progreso y acciones utilizables | 2 |
| V01 | Hotel con 6 unidades de un tipo | Inventario y precio correctos por fecha | 3 |
| V02 | Tour con adulto/niño y cupo compartido | Una capacidad común, sin sobreventa por categorías | 3 |
| V03 | Producto publicado sin inventario | Publicado y no reservable se distinguen | 3 |

Son escenarios de aceptación, no un listado de pruebas que ya se hayan ejecutado. La evidencia de ejecución está separada en el cierre.

## 9. Medición inicial realizada

Consulta ejecutada el 14 de septiembre de 2026, con transacción PostgreSQL `READ ONLY`, timeout y salida de conteos agregados. No exporta nombres, emails, tokens, documentos ni payloads de auditoría. [Resultado JSON](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-0-baseline.json) y [script reproducible](/Users/ellaggon/Projects/fastt/scripts/ops/onboarding-phase0-baseline.ts).

| Dato | Resultado |
|---|---|
| Entorno del proceso | `development`, conexión local configurada |
| Ventana UTC | 2026-08-15 12:23:46.515 → 2026-09-14 12:23:46.515 |
| Proveedores totales existentes | 217 |
| Proveedores comerciales clasificados production | 212 |
| Eventos persistidos `SettingsFunnel` en la ventana | 0 |
| Sink configurado en este proceso | `log` por defecto |
| Conversión registro → oferta reservable | **No medible** |

Los 212 proveedores no son 212 altas nuevas en la ventana ni una cohorte de usuarios reales verificada. La clasificación de datos tampoco demuestra cuál configuración está desplegada en producción. No se consultaron logs externos: puede haber eventos en logs que no estén persistidos en esta tabla.

Incluso con muchos eventos de configuración faltaría el denominador de altas con intención de proveedor y el evento de primera oferta reservable. Por eso el resultado es ausencia de cobertura medible, no abandono del 100 % ni conversión del 0 %.

### 9.1. Contrato de medición para continuar

Unidad: nueva cuenta con intención de proveedor; distinguir usuario de negocio y producto. Cohorte por primera selección de intención, con ventana de seguimiento definida. Excluir fixture/demo/QA y no mezclar invitados con propietarios que crean negocio.

Eventos mínimos futuros: intención elegida, negocio creado, primer borrador, preparación completada, requisitos enviados/resueltos, publicación solicitada/bloqueada y primera oferta reservable. Deduplicar eventos de servidor por entidad/transición. Recargas y reintentos no crean conversiones adicionales.

Registrar tiempo activo de preparación separado de espera de revisión. Tasa de activación = miembros elegibles de una cohorte que alcanzan primera oferta reservable / miembros elegibles de esa misma cohorte. Definir horizonte de seguimiento antes de comparar cohortes.

Umbral de exploración propuesto: al menos 30 altas elegibles por vertical con seguimiento comparable y eventos completos; por debajo, describir casos y conteos sin afirmar eficacia. No es garantía de significancia estadística: un experimento necesita cálculo de muestra según su efecto esperado. Actualmente no hay cobertura para aplicar ese umbral.

Reproducción de la consulta, desde la raíz del proyecto:

```sh
node --import dotenv/config --import tsx scripts/ops/onboarding-phase0-baseline.ts --output=docs/onboarding/phase-0-baseline.json
```

El resultado sólo representa la conexión elegida. No activar automáticamente `SETTINGS_FUNNEL_SINK=db` como parte de esta auditoría: requeriría tratar persistencia, alcance y retención como cambio de instrumentación.

## 10. Dependencias para avanzar sin perder el objetivo integral

Fase 1 debe consumir D01–D09, incorporar los dos niveles de validación del producto y la elegibilidad comercial en su diagnóstico, preservar regreso de viajeros/invitados y corregir el contacto operativo. Fase 2 continúa con shell, persistencia y reanudación; fase 0 no implementa esas piezas.

Antes de dar cierre técnico incondicional, restaurar una conexión de tests válida que pase el fingerprint y no corresponda a producción, ejecutar la paridad PostgreSQL preparada y resolver cualquier divergencia real. Las decisiones contractuales pueden usarse para diseñar fase 1; eso no convierte las pruebas pendientes en aprobadas.
