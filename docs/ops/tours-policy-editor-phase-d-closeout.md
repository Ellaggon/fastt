# Cierre de Fase D — Editor y navegación de tours

**Fecha:** 21 de septiembre de 2026  
**Estado:** completada en código; certificación visual/manual pendiente de Fase F.

## Resultado

El editor de condiciones recibe el tipo de oferta y deja de llamar hotel o habitación a los ámbitos de un tour: usa experiencia, salida y tarifa. Sus títulos, explicación de cancelación/no presentación y pago ahora se orientan al viajero y a la salida; el pago dice explícitamente que Fastt no procesa ni custodia fondos.

La salida queda accesible directamente desde el diálogo mediante un enlace al calendario contextualizado por producto y variante. Las preguntas de reserva ya declaran su alcance global en la página: se responden una vez, aplican a todas las salidas/tarifas y se congelan con cada reserva.

## Estados y accesibilidad

- El diálogo usa `role=dialog`, `aria-modal`, nombre y descripción asociados.
- Escape y clic fuera lo cierran; el foco vuelve al control que lo abrió.
- Carga, ausencia de opciones, preview obligatorio, éxito y fallos de red se informan en el área de estado. Una caída al guardar reactiva el botón y pide verificar antes de reintentar.
- El editor sigue obteniendo categorías, presets y condiciones existentes desde el contexto resuelto por servidor de Fase B.

## Validación

`pnpm run build` y `git diff --check` finalizaron correctamente. El build conserva únicamente advertencias preexistentes de imports dinámicos del módulo de precios.

## Evaluación de salida

La salida funcional de Fase D se cumple en código: los controles de tour tienen contexto, no cambian condiciones por abrir el diálogo y los tres modos continúan sujetos a la compatibilidad de servidor.

Queda una certificación de navegador de Fase F para teclado, lector de pantalla y móvil. También queda como dependencia intencional de la selección comercial: el editor todavía no recibe fecha/participantes de una búsqueda pública, por lo que Fase C identifica correctamente una cotización ausente en vez de inventarla.
