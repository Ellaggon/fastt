# Validación UX de Integraciones

## Objetivo

Comprobar que un proveedor sin experiencia técnica puede elegir, autorizar, mapear y validar
una integración sin asistencia. Las sesiones deben realizarse con datos de prueba y nunca con
credenciales personales o productivas.

## Participantes

- Cinco participantes por ronda como mínimo.
- Al menos tres no deben haber configurado antes una API, OAuth o channel manager.
- Incluir una sesión móvil, una sesión solo con teclado y una con lector de pantalla por ronda.

## Escenario

“Tu alojamiento ya utiliza un channel manager. Conéctalo con Fastt, elige la propiedad,
relaciona una habitación y consigue una primera sincronización válida.”

No explicar qué botón deben pulsar. Se puede recordar el objetivo, pero no traducir términos ni
guiar el recorrido.

## Observación

Registrar únicamente:

- Momento en que el participante entiende qué puede conectar.
- Dudas expresadas en voz alta.
- Paso donde solicita ayuda.
- Error visible y acción de recuperación.
- Finalización o abandono.

No grabar credenciales, identificadores externos, contenido de campos ni respuestas del
proveedor.

## Métricas automáticas

Los eventos se guardan en `ProviderAuditLog` con `entityType=IntegrationUxFunnel`.

```bash
pnpm run query:integration-ux -- --provider=PROVIDER_ID
```

También están disponibles para administradores en:

```text
GET /api/admin/providers/integration-ux?providerId=PROVIDER_ID&maturityMinutes=30
```

El reporte devuelve:

- Mediana y p75 de tiempo hasta elegir integración.
- Vistas, finalizaciones y abandono maduro por paso.
- Errores de autorización y tasa sobre visitas al paso Acceso.
- Mappings pendientes y tasa de inventario completamente relacionado.
- Mediana y p75 hasta la primera sincronización válida.

Un recorrido se considera abandonado cuando lleva 30 minutos sin actividad y no completó el
paso. Así no se confunden recargas o navegación interna con abandono.

## Umbrales de aceptación

| Objetivo                      | Umbral inicial                             |
| ----------------------------- | ------------------------------------------ |
| Elegir integración            | mediana menor a 30 segundos                |
| Completar Proveedor           | abandono menor a 10%                       |
| Completar Acceso              | abandono menor a 20%                       |
| Error de autorización         | menor a 10%                                |
| Completar Propiedad           | abandono menor a 15%                       |
| Mappings pendientes           | tendencia descendente por sesión           |
| Primera sincronización válida | mediana menor a 10 minutos                 |
| Uso solo con teclado          | 100% del recorrido sin bloqueo             |
| Móvil 360 px                  | sin desplazamiento horizontal de la página |

## Teclado y móvil

En cada ronda verificar:

1. Orden de foco lógico desde el encabezado hasta la acción principal.
2. Activación de botones, radios y formularios con teclado.
3. Flechas, Inicio y Fin entre pestañas del mapeo.
4. Foco visible en propiedad seleccionable y controles de mapeo.
5. Zoom del navegador al 200%.
6. Viewports de 360 × 800, 390 × 844 y 768 × 1024.
7. Mensajes de error anunciados y acción de reintento disponible.

## Decisión

Después de cada ronda, corregir primero los pasos con mayor abandono maduro. No cambiar copy
por una sola observación: combinar grabaciones de comportamiento, incidencias repetidas y datos
del embudo.
