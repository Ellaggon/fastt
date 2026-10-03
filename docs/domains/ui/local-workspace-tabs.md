# Pestañas locales con contexto persistente

Status: active
Document type: canonical
Owner: Product / Engineering
Last verified: 2026-10-03
Scope: navegación inmediata entre formularios de un mismo objeto y contexto autorizado
Source of truth: src/lib/ui/local-tab-navigation.ts y consumidor de verificación
Related code/tests: src/pages/provider/settings/_client/verification-trust-panels.js; tests/unit/local-tab-navigation.test.ts; tests/render/verification-experience-selection.test.ts
Review trigger: nuevo consumidor, cambio de contexto, permisos, renderizado o navegación de formularios

## Cuándo usarlo

Usar cambio local cuando el servidor puede renderizar completos los paneles permitidos
con los datos que ya necesita la pantalla. Verificación es el consumidor de referencia.
El clic debe mostrar el formulario inmediatamente y preservar los campos todavía sin guardar.
La URL sigue siendo una entrada válida para recarga, enlaces directos e historial.

Si una sección necesita datos voluminosos o exclusivos, usar navegación de servidor
o una carga completa y cancelable de esa sección. No marcar como disponible un contenedor
vacío. No extender este patrón automáticamente a cotizaciones o decisiones transaccionales.

## Contrato obligatorio

1. El servidor declara las pestañas permitidas y renderizadas. Su existencia visual no concede permisos.
2. Renderizar formularios y estados según datos y permisos, nunca según la pestaña inicial.
   Sólo la visibilidad depende de la selección inicial. Evitar identificadores HTML duplicados.
3. Comparar contexto con `sameLocalTabContext`: origen, ruta y parámetros ajenos a la navegación
   deben coincidir. Declarar explícitamente las claves de navegación que pueden variar.
4. Sólo entonces actualizar URL con `pushState`, sección activa y enlaces. Cambiar negocio,
   experiencia, filtro de documento u otro objeto requiere una nueva representación del servidor.
5. Conservar las pestañas recordadas de otras líneas. Cada formulario declara su propio destino;
   `rememberTabInDestination` actualiza recuerdos sin sustituir la pestaña de envío.
6. Los enlaces de selección, enlaces secundarios, retornos y campos ocultos deben mantener el
   mismo contexto. Elementos dependientes de la sección se renderizan y se muestran u ocultan juntos.
7. Atrás/Adelante aplica la URL al contexto cargado. El puente `fastt:before-history-navigation`
   se registra en `Layout.astro` antes de ClientRouter; el consumidor cancela ese evento sólo
   si puede resolver localmente la entrada. Así Astro no inicia una recarga que borre borradores.
   Con otro contexto, dejar actuar al router. Conservar el estado existente al hacer `pushState`.
8. Usar enlaces reales con `aria-current` y `inert` en paneles inactivos. Conservar foco en el
   enlace activado, permitir teclado y clic modificado, evitar esperas artificiales y respetar
   `prefers-reduced-motion`. No usar roles de tabs sin implementar su contrato de teclado.
9. Guardar continúa usando el servidor y sus autorizaciones actuales; la respuesta recarga datos.
   La navegación local conserva la observación de la carga inicial, no garantiza cambios remotos en vivo.
10. No mostrar un esqueleto si el contenido ya está disponible. Para una navegación real,
    `astro:before-preparation` muestra `FormSkeleton.astro` dentro del área de contenido,
    oculta el formulario anterior y mantiene las pestañas disponibles. Retirarlo al completar,
    abortar o fallar la carga. Respetar movimiento reducido y anunciar la espera; las cargas
    largas deben ofrecer orientación. Un clic posterior deja que Astro cancele la petición anterior.

## Validación de un consumidor

- Entrar directamente por cada pestaña, alternar y comparar contenido con una recarga de la misma URL.
- Comprobar formulario completo, campos sin guardar, contexto del envío, retorno y otra línea.
- Probar objeto distinto, parámetros no reconocidos, panel no permitido y ausencia de selección.
- Recorrer teclado e historial; verificar que los paneles ocultos no reciben foco.
- Medir el clic hasta el contenido visible; no confundir tiempo de invocación de automatización con UX.
- Los mocks de contenedores no certifican formularios. Combinar pruebas de renderizado real,
  helpers y recorrido autenticado sin enviar documentos ni alterar condiciones comerciales.
