# Fase 2: preparación guiada y continuidad

Fecha: 14 de septiembre de 2026. Continúa las fases 0 y 1 descritas en el [reporte de onboarding](/Users/ellaggon/Projects/fastt/docs/fastt-onboarding-ux-audit-2026-09-13.md).

## Resultado

La preparación inicial de hotel y tour ahora usa un shell guiado cuando el playbook está activo. El sidebar y la barra operativa permanecen disponibles fuera de ese modo, por lo que administrar una oferta existente no cambia de contexto involuntariamente.

Los once pasos se presentan en tres etapas:

| Etapa | Alojamiento            | Tour                   |
| ----- | ---------------------- | ---------------------- |
| 1     | Tu alojamiento         | Tu experiencia         |
| 2     | Habitaciones y venta   | Salidas y venta        |
| 3     | Revisión y publicación | Revisión y publicación |

Cada guardado conserva los datos en los agregados canónicos que ya usa Fastt. Además, una sesión persistente guarda únicamente el contexto de reanudación: usuario, proveedor, producto, vertical, playbook, paso, variante, tarifa y URL interna validada. No copia campos de formularios ni información sensible.

## Cambios realizados

- Se creó `GuidedPreparationLayout`, con encabezado compacto, ancho móvil, enlace para saltar al contenido y barra de progreso accesible. `PlaybookLayout` lo usa sólo cuando un playbook está activo; el modo operativo conserva `WorkspaceLayout`.
- Se añadió `ProviderPreparationSession` y la migración `2026-09-14_provider_preparation_sessions.sql`. Una fila única por usuario, proveedor y playbook evita que una reanudación duplique el borrador.
- La creación de hotel o tour inicia la sesión en `content`; las páginas guiadas actualizan el paso actual y preservan `variantId` y `ratePlanId`. El dashboard muestra “Retoma donde lo dejaste”.
- El endpoint de sesión exige autenticación, proveedor asociado y propiedad del producto. Sólo acepta rutas internas de producto o tarifas, evitando convertir la sesión en una redirección abierta.
- Se corrigieron mensajes del resumen para tours: usa tour, salidas y cupos; no ofrece enlaces de habitaciones dentro de una tarjeta de tour. La confirmación de publicación usa la etiqueta de su vertical.

## Verificación

```sh
FASTT_DATA_ENV=test pnpm exec vitest run tests/unit/preparation-session.test.ts tests/ui/provider-onboarding-phase2.test.ts tests/unit/provider-onboarding.test.ts tests/ui/provider-onboarding-phase1.test.ts
FASTT_DATA_ENV=test pnpm exec vitest run tests/integration/provider-onboarding-authenticated.e2e.test.ts
pnpm check
```

- Se aplicó la migración en Fastt Backup.
- La prueba autenticada crea un proveedor, un borrador de hotel y otro de tour, actualiza el hotel con variante y tarifa, recupera ambos desde la sesión y verifica una sola fila por playbook, sin duplicar productos.
- Los contratos unitarios verifican etapas, URL segura, contexto de variante/tarifa y shell guiado sin sidebar operativo. `pnpm check` no reportó errores nuevos; las advertencias existentes siguen fuera de este cambio.

## Evaluación de salida

| Criterio                                        | Estado                | Evidencia                                                                                                                            |
| ----------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Borrador hotel y tour sin duplicación           | Cumplido              | Prueba autenticada contra Fastt Backup crea ambos y verifica una sesión por playbook.                                                |
| Salir, autenticarse y retomar datos persistidos | Cumplido              | La sesión se consulta por usuario/proveedor y conserva la URL con producto, variante y tarifa; el dashboard la ofrece de nuevo.      |
| Enlaces profundos y retroceso                   | Cumplido por contrato | Las URL de reanudación se validan, y los constructores del playbook conservan contexto; el pie guiado mantiene el enlace Anterior.   |
| Guardar y continuar coherente                   | Cumplido              | Los formularios guiados existentes persisten primero y redirigen al siguiente paso; la sesión sólo registra el resultado persistido. |
| Móvil y accesibilidad                           | Cumplido              | Shell sin sidebar, layout fluido, salto a contenido y `progressbar` con etiqueta y valor ARIA coherentes.                            |

## Límite que pasa a fases posteriores

Los valores aún no guardados permanecen en el borrador local de navegador, como medida de recuperación durante la edición. No se sincronizan entre dispositivos para evitar copiar datos no confirmados al servidor. Los datos guardados y el contexto de reanudación sí son persistentes y cumplen el contrato de esta fase.

La Fase 3 puede comenzar con los caminos reservables de hotel y tour. Su prueba debe cubrir disponibilidad, precio e inventario/salidas comerciales reales, no sólo la creación del borrador.
