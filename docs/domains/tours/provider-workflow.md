# Flujo del proveedor para tours

Status: active  
Document type: canonical  
Owner: Tours / Provider Experience  
Last verified: 2026-09-22  
Scope: creación, reanudación, edición y preparación para publicar  
Source of truth: `src/lib/playbook/complete-to-publish.ts` y las páginas `src/pages/product/`  
Related code/tests: `src/pages/catalog/tours.astro`, `src/lib/tours/tourProviderNavigation.ts`, pruebas `tour-commercial-wizard`
Review trigger: cambio del playbook, requisitos de publicación o navegación del proveedor

El recorrido se organiza en seis etapas persistentes:

1. Identidad.
2. Destino.
3. Experiencia: fotos, logística e itinerario.
4. Participantes y búsqueda: tickets y categorías son conceptos separados.
5. Salidas y venta: salida, precio, condiciones, preguntas y disponibilidad.
6. Revisión y publicación.

Cada tour muestra requisito pendiente y acción siguiente. Producto, variante y tarifa se conservan al navegar por precio, condiciones y calendario. Una salida activa completa basta para cumplir el requisito cuando el negocio no necesita más.

La ubicación pública no sustituye el punto de encuentro operativo. La vista previa usa la ficha pública real y mantiene deshabilitada la contratación mientras el producto no esté publicado. Los criterios de calidad combinan requisitos universales con recomendaciones según la actividad.

Para políticas comerciales, consultar [policies.md](./policies.md). Para nuevas tablas o caminos paralelos, revisar primero los [ADRs](../../engineering/adr/README.md).
