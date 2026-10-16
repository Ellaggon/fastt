# Fase E — Validación con trabajo representativo y adopción

Status: active
Document type: runbook
Owner: Operations / Engineering
Last verified: 2026-10-16
Scope: certificación, observación humana, cohortes y reversión del Centro de Mando
Source of truth: contrato operativo, pruebas y certificador enlazados
Review trigger: cambio de contrato, controles o procedimiento; revisar evidencia del entorno antes de ejecutar
Supersedes: `docs/reports/provider-admin-ux-analysis-2026-09-06.md`, `docs/reports/provider-admin-implementation-audit-2026-09-07.md`

**Evidencia del 7 de septiembre:** validación parcial; certificación de decisiones no superada. No acredita despliegue general ni estado actual.
**Propietarios:** Operaciones, QA y Producto.  
**Referencia:** contrato operativo y fundaciones de seguridad de este directorio.

## Objetivo y límite

Demostrar que una persona administradora puede identificar el proveedor correcto, comprender qué falta, preparar o revisar la decisión correcta y recuperar su trabajo sin mensajes falsos. Esta fase valida la experiencia con trabajo realista, pero no habilita decisiones sobre proveedores comerciales ni elimina la ruta legacy.

Una observación de personas no puede sustituirse por una prueba automatizada. Las pruebas de código y navegador prueban que el recorrido existe; Operaciones y QA deben registrar las sesiones ciegas descritas aquí antes de ampliar el alcance.

## Datos de prueba clasificados

El único proveedor para ejecutar comandos v2 durante esta fase es `provider_command_center_v2_certification`:

| Atributo | Valor obligatorio |
| --- | --- |
| Propósito de cuenta | `integration_certification` |
| Clasificación | `fixture` |
| Datos de clientes | `false` |
| Estado comercial | `inactive` |
| Dominios | Identidad, Fiscalidad, Documentos y Pagos |
| Preparación | `CONFIRM_COMMAND_CENTER_V2_CERTIFICATION=prepare pnpm certify:command-center:v2 --apply` |
| Verificación final | `pnpm certify:command-center:v2 --verify` |

No usar proveedores de producción, datos personales reales, cuentas bancarias reales ni documentos de clientes. El script de certificación ya rechaza preparar la fixture sin la confirmación expresa y conserva fuentes canónicas, auditoría e idempotencia.

## Observación sin guía

La persona facilitadora no explica navegación, nombres de botones ni el significado de los estados. Solo entrega una tarjeta por tarea y observa. Puede intervenir únicamente si se bloquea un dato técnico de acceso; lo registra como incidencia, no como éxito.

| Tarea | Tarjeta entregada al participante | Resultado observable |
| --- | --- | --- |
| T1: contexto | «Revisa la identidad fiscal de la fixture y dime qué proveedor, área, evidencia y plazo estás evaluando.» | Nombra proveedor y área correctos, encuentra criterios y fecha de evaluación sin usar UUID. |
| T2: decisión | «Con la evidencia disponible, prepara el resultado permitido y explica qué cambiaría antes de confirmarlo.» | Elige motivo compatible, detecta comentario obligatorio y describe el efecto canónico. |
| T3: segundo control | «Otro revisor dejó una propuesta de riesgo alto. Determina si puedes intervenir y qué falta.» | Reconoce maker/checker, permisos y estado de segundo control. |
| T4: recuperación | «El navegador perdió conectividad después de preparar la propuesta. Retoma el trabajo.» | Recupera borrador y reutiliza idempotencia, sin crear una segunda decisión. |
| T5: alcance | «Desde la ficha de un proveedor ajeno a la fixture, abre Fiscalidad y vuelve a su ficha.» | Mantiene `providerId`; no confunde una cola global con la revisión del proveedor. |

Registrar para cada tarea: participante pseudonimizado, rol, fixture, inicio/fin, resultado, primer error, ayuda requerida, URL inicial y final, texto que interpretó, request ID si hubo comando y enlace de auditoría. No registrar secretos, documentos ni valores revelados.

## Métricas y criterios de aceptación

| Indicador | Cálculo | Umbral para ampliar el piloto |
| --- | --- | --- |
| Finalización autónoma | tareas correctas sin explicación / tareas iniciadas | 90% o más por tarea |
| Error de contexto | tarea con proveedor, dominio o caso equivocado / tareas iniciadas | 0 incidencias críticas |
| Comprensión de efecto | respuestas que explican correctamente el efecto previo / T2 completadas | 90% o más |
| Recuperación | T4 recuperadas sin duplicado / T4 iniciadas | 100% |
| Mensaje falso | mensaje que afirma envío, aplicación o respuesta no persistida | 0 |
| Seguridad de decisión | decisión sin permiso, evidencia, MFA, auditoría o segundo control | 0 |

Una incidencia crítica es decidir sobre otro proveedor, perder un borrador permitido, duplicar una decisión, afirmar un efecto no aplicado, exponer un dato sensible sin autorización o saltar maker-checker. Cualquier incidencia crítica bloquea la ampliación y obliga a volver a la ruta legacy para la acción afectada.

## Ajuste tras las sesiones

Producto y Operaciones revisan primero el primer punto de confusión de cada tarea. Cada hallazgo debe producir uno de estos resultados: cambio de texto, cambio de jerarquía, corrección de navegación, nueva restricción o descarte motivado. Se conserva antes/después, evidencia de repetición y responsable. No se cambia una política para ocultar un problema de comprensión.

Las observaciones deben revisar especialmente estas frases:

- «Preparar decisión»: debe describirse como propuesta cuando el segundo control aplica.
- «Solicitud registrada»: solo aparece cuando existe una decisión persistida; envío y respuesta se muestran como no confirmados mientras no haya fuente de esos hechos.
- «Marcar para corrección»: solo se ofrece en Fiscalidad y Pagos, con su efecto explícito.
- «Solo lectura»: explica si falta la bandera global, el proveedor no pertenece al piloto o el usuario no tiene permiso.

## Despliegue por alcance controlado

El control es de servidor y no acepta parámetros HTTP. Para habilitar comandos de una fixture se requieren ambas variables:

```sh
COMMAND_CENTER_V2_COMMANDS_ENABLED=true
COMMAND_CENTER_V2_PILOT_PROVIDER_IDS=provider_command_center_v2_certification
```

La API valida la cohorte además de la interfaz para propuestas, asignación, aprobación y devolución de segundo control. Un proveedor fuera de `COMMAND_CENTER_V2_PILOT_PROVIDER_IDS` recibe una vista de solo lectura y una salida explícita a legacy. La lista vacía habilita a nadie.

| Etapa | Alcance | Condición de entrada | Condición de salida |
| --- | --- | --- | --- |
| Shadow | Todo interno, lectura | `COMMAND_CENTER_V2_READ_ENABLED=true` | Navegación y datos comparados con legacy. |
| Fixture | Un proveedor `fixture` | Métricas de T1–T4 sin críticos | Certificación completa y auditoría revisada. |
| Piloto invitado | Lista explícita y limitada | Dos sesiones ciegas satisfactorias por rol aplicable | Sin falsos mensajes, errores de contexto ni recuperaciones fallidas. |
| Ampliación | Cohortes aprobadas | Revisión de Operaciones, QA y Producto | Cobertura de tareas legacy demostrada. |
| Retiro de legacy | Ningún usuario depende de sus mutaciones | Inventario de tareas y reversión probado | Aprobación explícita de responsables. |

Para revertir comandos, cambiar `COMMAND_CENTER_V2_COMMANDS_ENABLED=false`. Para retirar una cohorte, eliminar solo su ID de `COMMAND_CENTER_V2_PILOT_PROVIDER_IDS`. Mantener la lectura y los registros. Conservar `COMMAND_CENTER_LEGACY_WRITE_ENABLED=true` solo para tareas cuya equivalencia de controles haya sido demostrada. No trasladar decisiones pendientes de segundo control a un endpoint anterior: una bandera de interfaz no prueba paridad de permisos, evidencia, MFA ni segregación de funciones. Si no hay paridad, la acción permanece bloqueada. La reversión de interfaz no borra propuestas, decisiones, evidencias ni eventos de auditoría.

## Evidencia de salida exigida

No declarar esta fase cerrada hasta adjuntar al ticket o registro de release:

1. El resultado de `pnpm test:command-center:phase-e` y `pnpm check`.
2. La salida de `pnpm certify:command-center:v2 --verify` para la fixture aislada.
3. La planilla de observación de T1–T5 con métricas calculadas y hallazgos resueltos o aceptados.
4. Una revisión de `AuditEvent`, `SensitiveDataAccessEvent` y decisiones de segundo control de la fixture.
5. La configuración exacta de flags, cohorte, responsable, ventana y procedimiento de reversión.
6. El inventario de las tareas que aún requieren legacy. El panel anterior no se retira hasta que ese inventario quede vacío y se demuestre su cobertura.

## Revisión posterior de la ejecución (7 de septiembre de 2026)

La comprobación de solo lectura contra Supabase devolvió `passed: false`: los cuatro casos de certificación siguen abiertos, sin decisiones aplicadas, eventos de aplicación ni reservas de idempotencia exitosas. La comprobación de navegación en Codex fue realizada por el agente, no por administradores participantes. No existen métricas de observación humana que permitan cerrar la adopción. Esta observación es histórica: no certifica el estado del entorno actual.

## Revalidación y recuperación

La verificación de solo lectura del 15 de octubre de 2026 devolvió `passed: true`
para los cuatro casos de `provider_command_center_v2_certification`: decisiones de
rechazo aplicadas, casos resueltos, fuentes canónicas actualizadas, actividad,
auditoría y cuatro reservas exitosas de idempotencia. Sustituye el diagnóstico de
«cuatro casos sin ejecutar», pero no acredita adopción ni segundo control humano.
El certificador declara el alcance y `adoptionCertified: false`.

Antes de ampliar la cohorte, ejecutar ambos comandos y conservar sus salidas:

```sh
pnpm test:command-center:recovery
pnpm certify:command-center:v2 --verify
```

El reconciliador abre fiscalidad solo para fuentes enviadas (`pending`), no por el
resultado `requires_attention`. No cierra propuestas pendientes o inciertas. Un cierre
por fuente ya no pendiente se registra como reconciliación, sin afirmar aprobación.
El verificador distingue los cuatro expedientes preparados de su historial y rechaza
cualquier expediente activo adicional de la fixture.

La primera suite usa exclusivamente la base aislada de `.env.test`, validada por
fingerprint. Requiere las migraciones existentes de seguridad, casework y decisiones.
No sustituirla por la base operativa si falta esquema. Sus fixtures llevan
`integration_certification`, `fixture` e `inactive` y se revierten al terminar cada
escenario. Incluye dos proveedores, 101 casos cerrados y uno activo anterior,
rollback de fuentes por área, repetición de decisión y separación maker/checker.
Las pruebas de servicios no sustituyen una sesión autenticada con dos personas.

### Recuperación de comandos

Los comandos v2 de propuesta y segundo control guardan efecto de dominio, cierre,
actividad, outbox, auditoría de éxito y respuesta de idempotencia en una transacción.
La reserva se bloquea durante el efecto. Las reservas de comandos atómicos sin
confirmación pueden reclamarse tras 60 segundos, con control del propietario de la
reserva y el mismo cuerpo; el resultado exitoso se conserva 24 horas para reintentos. Un fallo anterior al commit revierte los
cambios; una respuesta perdida se consulta con la misma clave y cuerpo. Una reserva
exitosa no se degrada a fallida por un error posterior. Una operación en curso
responde conflicto y no se ejecuta de nuevo. Las invalidaciones de caché ocurren
después del commit y no convierten una decisión confirmada en un fallo de negocio.

Las decisiones históricas `failed` o `applying` previas a este contrato permanecen
bloqueadas: comparar snapshot, fuente, auditoría y actor antes de cualquier reparación.
No asumir que el estado actual de la fuente prueba qué decisión lo produjo. No
reaplicar ni crear otra propuesta para «desatascar» una aplicación parcial antigua.
Si no hay trazabilidad suficiente, requiere reconciliación operativa explícita.

### Solicitudes dentro de la plataforma

1. Registrar la solicitud mediante la decisión y, si corresponde, segundo control.
2. Revisar y publicar un mensaje específico para el proveedor desde el expediente.
   El comentario interno no se copia automáticamente.
3. La publicación persiste en el buzón `/provider/compliance/requests`; únicamente
   miembros actuales con permiso del área pueden verla y responder. No envía correo.
4. Mostrar publicación y respuesta con fechas propias y correlación a la decisión.
   Publicación no equivale a lectura; no hay confirmación de lectura ni de correo.
5. La respuesta autenticada devuelve el caso a revisión sin aprobar evidencia ni
   cambiar la fuente. Los archivos se cargan en su sección segura.

No ensayar con destinatarios comerciales ni enviar mensajes externos para certificar.
La cohorte y la bandera de comandos se validan también en las APIs de publicación y
respuesta. La reversión conserva lectura, mensajes, decisiones y auditoría.

### Vigencia y fechas

La ficha separa revisión registrada de actualización de la fuente. `updatedAt` no
suple una revisión ausente. Una fuente aprobada que cambió después de revisarse o
sin fecha verificable requiere reconciliación. Documentos respetan su vencimiento
explícito. No hay caducidad universal por antigüedad. Los plazos adicionales de
revisión requieren política aprobada y fecha explícita; no inventar plazos ni
considerar universal una regla de otro sujeto o tipo documental.

### Observación pendiente y gate de adopción

Operaciones coordina participantes; el agente prepara el protocolo, pero no firma
sus resultados. Usar T1–T5 anteriores, dos sesiones ciegas satisfactorias por rol y
un checker distinto del maker. Registrar también teclado/foco, zoom 200% y 375 px.
Mantener las columnas: participante, rol, tarea, inicio, fin, resultado, ayuda,
error de contexto, comprensión del efecto, recuperación sin duplicado, mensaje
falso, URL inicial/final, request ID, auditoría, hallazgo y responsable.

No calcular porcentajes sobre filas vacías ni considerar «no observado» como éxito.
Sin estas sesiones, no ampliar el piloto ni retirar el panel anterior. La paridad de
permisos, MFA, evidencia y segundo control sigue siendo obligatoria en cualquier
ruta de compatibilidad o reversión.
