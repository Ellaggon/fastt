# Fase 5 — Lanzamiento gradual y medición

**Fecha:** 15-09-2026  
**Estado:** controles de lanzamiento implementados; no activado sobre proveedores reales.

## Control de cohortes

El nuevo onboarding de proveedor se decide exclusivamente en servidor a partir del usuario autenticado y configuración de entorno. No acepta cookies, parámetros ni headers para activar el flujo.

| Variable | Uso |
| --- | --- |
| `PROVIDER_ONBOARDING_ENABLED` | Kill switch. `false` dirige al Perfil del proveedor legacy. |
| `PROVIDER_ONBOARDING_ROLLOUT_STAGE` | `off`, `staging`, `allowlist`, `percentage` o `general`. Un valor inválido falla cerrado. |
| `PROVIDER_ONBOARDING_USER_ALLOWLIST` | Usuarios piloto explícitos. |
| `PROVIDER_ONBOARDING_ROLLOUT_PERCENT` | Porcentaje estable por hash de usuario, usado sólo en `percentage`. |
| `PROVIDER_ONBOARDING_STAGING_HOSTS` | Hosts permitidos durante `staging`. |
| `PROVIDER_ONBOARDING_DEPLOYMENT_ENV` | Alternativa controlada para declarar staging. |

La reversión dirige nuevas entradas a `/provider/settings/profile?onboarding=legacy`. No borra proveedor, productos, variantes, tarifas ni sesiones de preparación ya creadas. El rollout no interviene en permisos, evaluación de gobernanza, publicación, inventario, hold ni reservas.

## Secuencia de lanzamiento

1. **Pruebas:** `PROVIDER_ONBOARDING_ROLLOUT_STAGE=staging`, host de pruebas, `SETTINGS_FUNNEL_SINK=both`. Ejecutar pruebas autenticadas y revisar errores/latencia.
2. **Piloto:** `allowlist` con cuentas nuevas invitadas y responsables definidos. Mantener la ruta legacy disponible.
3. **Porcentaje:** comenzar en 5%, observar una ventana completa y avanzar sólo con métricas completas y sin incidentes críticos.
4. **General:** activar sólo después de la revisión conjunta de Producto, Soporte, Operaciones y Seguridad.

Un error de autorización, publicación, inventario, pérdida de preparación, redirección de viajero/invitado o mensaje falso bloquea el avance y exige volver a `off` o retirar la cohorte afectada.

## Medición y operación

- Persistir `SETTINGS_FUNNEL_SINK=both` para que el funnel sea consultable en `ProviderAuditLog` y disponible en logs.
- Consultar `GET /api/admin/providers/settings-funnel` como administrador para bloqueos, CTA y dominios completados. Nunca guardar documentos, tokens o datos personales en los eventos.
- Medir por cohorte: inicio efectivo, primera identidad, primer borrador, primera oferta reservable, abandono, errores, latencia y tickets de soporte.
- No comparar cohortes hasta contar con al menos 30 altas elegibles por vertical y una ventana equivalente, como define el contrato de Fase 0.

## Criterios de avance

| Señal | Requisito para ampliar |
| --- | --- |
| Autorización y publicación | Cero regresiones; el flag no modifica los controles del servidor. |
| Continuidad | Ningún borrador o sesión persistida se duplica o pierde al volver. |
| Errores y latencia | Sin degradación material frente a control durante la ventana definida. |
| Funnel | Eventos completos y consultables para la cohorte. |
| Soporte | Incidencias clasificadas, con responsable y resolución antes de ampliar. |

## Validación de código

`tests/unit/provider-onboarding-rollout.test.ts` cubre kill switch, allowlist, porcentaje estable, staging fail-closed y retorno legacy. La activación de proveedores reales queda deliberadamente fuera de esta ejecución.
