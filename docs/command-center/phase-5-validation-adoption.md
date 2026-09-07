# Fase E — Validación con trabajo representativo y adopción

**Estado:** validación parcial; certificación de decisiones no superada. Sin despliegue general.  
**Propietarios:** Operaciones, QA y Producto.  
**Referencia:** `docs/reports/report-source.md` y las fases A–D del Centro de Mando.

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

La comprobación de solo lectura contra Supabase devolvió `passed: false`: los cuatro casos de certificación siguen abiertos, sin decisiones aplicadas, eventos de aplicación ni reservas de idempotencia exitosas. La comprobación de navegación en Codex fue realizada por el agente, no por administradores participantes. No existen métricas de observación humana que permitan cerrar la adopción. El análisis y las correcciones posteriores están en `docs/reports/provider-admin-implementation-audit-2026-09-07.md`.
