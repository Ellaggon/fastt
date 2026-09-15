# Fase 1: entrada de proveedor y diagnóstico accionable

Fecha: 14 de septiembre de 2026. Relacionada con el [reporte integral](/Users/ellaggon/Projects/fastt/docs/fastt-onboarding-ux-audit-2026-09-13.md) y el [contrato de fase 0](/Users/ellaggon/Projects/fastt/docs/onboarding/phase-0-contract.md).

## Resultado

**Fase 1 completada y certificada contra Fastt Backup.** El recorrido autenticado cubre intención persistida, identidad, contacto operativo, creación hotelera y diagnóstico de bloqueo antes de publicar. No se rediseñaron los formularios de producto ni se añadió vivienda completa.

| Criterio de salida                                                           | Resultado                                                | Evidencia                                                                                                                                                |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nueva cuenta de proveedor identifica su tarea y comienza el servicio elegido | Cumplido                                                 | `/dashboard` sin proveedor abre `/provider/onboarding`; la bienvenida distingue ofrecer de explorar y luego alojamiento/tour.                            |
| Guardar identidad avanza sin bucle administrativo                            | Cumplido                                                 | La identidad vuelve al paso operativo de la vertical elegida; el contacto operativo lleva al playbook de creación correspondiente.                       |
| Sin producto, las herramientas operativas no son la ruta principal           | Cumplido                                                 | El inicio usa `ProviderOnboardingLayout`, sin `WorkspaceLayout` ni sidebar operativo.                                                                    |
| Producto completo y proveedor bloqueado explica la causa antes de publicar   | Cumplido                                                 | La vista previa combina preparación de producto, gobernanza y elegibilidad comercial; muestra el primer bloqueo y su enlace antes de habilitar publicar. |
| Contacto y completitud operativa no se contradicen                           | Cumplido                                                 | `supportEmail` es obligatorio en formulario y esquema, igual que `operationsComplete` en gobernanza.                                                     |
| Viajeros e invitados conservan destinos y permisos                           | Cumplido por continuidad existente, sin cambio regresivo | `returnTo` sanitizado sigue atravesando registro, callback e inicio de sesión; la aceptación de invitación mantiene su ruta.                             |

## Cambios realizados

- Se añadió `src/pages/provider/onboarding/` y un shell reducido para las dos decisiones iniciales: intención y vertical.
- Se encapsularon los destinos permitidos de continuación en `src/lib/onboarding/providerOnboarding.ts`. Los endpoints de identidad y perfil sólo aceptan esas rutas; no admiten una redirección arbitraria enviada por formulario.
- Se reutilizaron los formularios actuales. El recorrido exige nombre comercial, razón social y, en el segundo paso, zona horaria, moneda y correo de soporte; luego abre el playbook hotelero o de tours ya existente.
- La creación de producto sin proveedor vuelve al paso de negocio de la vertical cuando se conoce `type=Tour`, o a la bienvenida cuando aún no se eligió una vertical.
- La vertical elegida se conserva durante 30 días en una cookie `httpOnly` y de mismo sitio antes de crear el negocio. La bienvenida ofrece continuar o cambiarla explícitamente.
- Las rutas operativas principales (`Reservas`, cola day-of, Finanzas, tarifas y calendario, incluidas sus entradas de multi-calendario y conexiones) y Configuración redirigen al inicio de onboarding cuando no hay proveedor asociado.
- La vista previa muestra el bloqueo de configuración del proveedor o de elegibilidad comercial antes del botón de publicación. Si el estado cambia entre carga y publicación, el error `provider_configuration_blocked` también se traduce en un enlace seguro de resolución.

## Verificación realizada

```sh
FASTT_DATA_ENV=test pnpm exec vitest run tests/unit/provider-onboarding.test.ts tests/ui/provider-onboarding-phase1.test.ts tests/unit/onboarding-phase0-governance.test.ts tests/unit/onboarding-phase0-product.test.ts
FASTT_DATA_ENV=test pnpm exec vitest run tests/integration/provider-onboarding-authenticated.e2e.test.ts
pnpm check
```

- Las 28 pruebas de fase 1 y sus regresiones unitarias de fase 0 aprobaron; los contratos unitarios y de superficie cubren la persistencia de intención, la elegibilidad comercial y la matriz de deep links principales.
- `pnpm check` completó sin errores nuevos; el repositorio conserva advertencias preexistentes de deprecaciones y variables sin uso.
- `tests/unit/provider-onboarding.test.ts` cubre verticales, continuidad y rechazo de destinos externos o ajenos al onboarding.
- `tests/ui/provider-onboarding-phase1.test.ts` cubre shell reducido, continuidad de ambos formularios, G04 y G05.
- `tests/integration/provider-onboarding-authenticated.e2e.test.ts` cubre con autenticación simulada y PostgreSQL real el alta de identidad, el correo operativo obligatorio, ambos redirects de onboarding, la creación del primer hotel y la respuesta `provider_configuration_blocked` con causa de verificación.

## Cierre de los gaps F1

| ID    | Estado  | Resolución                                                                                                                                                              |
| ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-01 | Cerrado | La elección de vertical se guarda antes de crear negocio y se retoma durante 30 días. La persistencia entre dispositivos queda para la sesión de preparación de fase 2. |
| F1-02 | Cerrado | La vista previa consulta la misma elegibilidad comercial canónica que publica y la combina con gobernanza para deshabilitar y explicar la publicación.                  |
| F1-03 | Cerrado | Los deep links operativos principales y el hub de Configuración entran al onboarding si la cuenta no tiene proveedor.                                                   |

## Evaluación conjunta de fase 0 y fase 1

La fase 1 está certificada para el primer recorrido hotelero. La fase 0 está certificada contra almacenamiento real. Sus decisiones de producto siguen vigentes: razón social obligatoria, correo operativo obligatorio, alojamiento limitado a hotel/habitación y sin excepciones aún por persona/empresa.

Se puede iniciar fase 2. Su alcance pendiente es el borrador duradero entre dispositivos, la continuidad de cada dato del formulario y la matriz E2E completa de enlaces profundos; no son bloqueos pendientes de la fase 1.
