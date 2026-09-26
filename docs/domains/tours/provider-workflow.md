# Flujo del proveedor para tours

Status: active  
Document type: canonical  
Owner: Tours / Provider Experience  
Last verified: 2026-09-25  
Scope: creación, reanudación, edición y preparación para publicar  
Source of truth: `src/lib/playbook/complete-to-publish.ts` y las páginas `src/pages/product/`  
Related code/tests: `src/pages/catalog/tours.astro`, `src/lib/tours/tourProviderNavigation.ts`, pruebas `tour-commercial-wizard`
Review trigger: cambio del playbook, requisitos de publicación o navegación del proveedor

Cada pantalla del recorrido es una etapa. El indicador avanza al guardar y pasar a la siguiente:

1. Identidad.
2. Fotos.
3. Destino.
4. Itinerario y detalles.
5. Participantes.
6. Participantes y búsqueda.
7. Salida.
8. Precio.
9. Condiciones de reserva.
10. Disponibilidad.
11. Revisión y publicación.

Cada tour muestra requisito pendiente y acción siguiente. Producto, variante y tarifa se conservan al navegar por precio, condiciones y calendario. Una salida activa completa basta para cumplir el requisito cuando el negocio no necesita más.

La ubicación pública no sustituye el punto de encuentro operativo. La vista previa usa la ficha pública real y mantiene deshabilitada la contratación mientras el producto no esté publicado. Los criterios de calidad combinan requisitos universales con recomendaciones según la actividad.

Para políticas comerciales, consultar [policies.md](./policies.md). Para nuevas tablas o caminos paralelos, revisar primero los [ADRs](../../engineering/adr/README.md).
