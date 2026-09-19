# Tours PDP — certificación operativa pendiente de Fase 2

**Estado:** código cerrado; certificación comercial con datos reales pendiente.  
**Última revisión:** 19 de septiembre de 2026.  
**Ámbito:** ficha pública de tour, selección de salida/tarifa y galería.  
**No bloquea:** correcciones de interfaz que ya se compilan y prueban de forma aislada.  
**Sí bloquea:** declarar la Fase 2 certificada operativamente o usarla como evidencia para ampliar el rollout comercial.

## Motivo y situación actual

El cierre técnico y su evidencia reproducible están registrados en [Cierre en código — Tours Fases 2 y 3](./tours-phase-2-3-code-closeout.md). Este documento conserva únicamente la puerta de certificación visual y comercial.

La implementación de Fase 2 separa tarifa, política efectiva, modalidad de reserva y cupo. Las pruebas controladas validan el flujo privado y la superficie de selección; la compilación valida la ficha y la galería.

El 18 de septiembre de 2026, la consulta comercial y el catálogo autenticado no aportaron un caso apto para recorrer el flujo: no había tours publicados y el único tour visible estaba en borrador, con 0 de 11 bloques de publicación completos. Por tanto, no se puede sustituir la validación comercial con una afirmación basada sólo en fixtures o pruebas de código.

No se debe publicar un tour ficticio para este fin en el catálogo general. La certificación se ejecuta primero en staging o en un proveedor controlado incluido explícitamente en el rollout; una prueba en producción requiere una oferta real aprobada por Operaciones y limitada a la cohorte autorizada.

## Condiciones para pasar a «lista para certificar»

1. Existe una ficha de tour publicada en staging o habilitada para un proveedor controlado.
2. La ficha tiene fotos, contenido, ubicación, itinerario, tickets, al menos una salida futura y precio/cupo materializados.
3. Hay dos alternativas seleccionables con políticas de cancelación o pago distintas y cargos verificables.
4. Hay una salida compartida y una privada, con idioma y grupo mixto configurados.
5. Hay una fecha sin cupo y una alternativa disponible para la misma experiencia o destino.
6. La persona ejecutora tiene acceso de lectura al proveedor y al recorrido público; no crea reservas ni contactos de viajeros durante la certificación.

## Matriz de certificación

| ID       | Escenario                               | Comprobación de interfaz                                                                                                              | Evidencia de cierre                                                    |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| P2-OC-01 | Dos tarifas, políticas distintas        | Al cambiar tarifa se actualizan precio, moneda, cargos, política y tipo de confirmación; no persisten datos de la selección anterior. | Capturas antes/después y respuesta de cotización sin datos personales. |
| P2-OC-02 | Salida compartida, idioma y grupo mixto | La fecha, idioma, entradas adulto/niño/infante y cupo coinciden con la salida; no se cambian participantes de forma silenciosa.       | Registro de selección y desglose de precio/cupo.                       |
| P2-OC-03 | Salida privada                          | La ficha presenta cotización/solicitud, no hold ni confirmación instantánea; la política mostrada corresponde a la opción privada.    | Captura de la opción y de su resumen comercial.                        |
| P2-OC-04 | Cupo agotado                            | La fecha agotada no permite reservar y ofrece fechas u opciones útiles cuando existen.                                                | Captura del estado agotado y de la alternativa.                        |
| P2-OC-05 | Galería de una y varias fotos, móvil    | A 375 px la galería no desborda; una foto no presenta navegación redundante; varias fotos abren, avanzan, retroceden y cierran.       | Capturas de ambos tamaños y lista de controles visibles.               |
| P2-OC-06 | Teclado y lector de pantalla            | El diálogo anuncia foto activa, conserva el foco dentro de la galería, cierra con Escape y devuelve el foco al disparador.            | Recorrido con teclado y árbol de accesibilidad o lector de pantalla.   |
| P2-OC-07 | Ficha sin fecha y sin coordenadas       | La información estable sigue siendo útil; el mapa no bloquea contenido ni la selección posterior.                                     | Captura de la ficha inicial y de una fecha válida.                     |

## Procedimiento y registro

1. Registrar entorno, proveedor controlado, identificadores internos de producto/variante/tarifa y fecha de ejecución. No registrar correos, nombres de viajeros ni datos de pago.
2. Ejecutar P2-OC-01 a P2-OC-07 en orden. Si una selección cambia fecha, tarifa o participantes, confirmar que se invalida la cotización/hold anterior antes de continuar.
3. Guardar las capturas y el resultado de cada caso en `docs/ops/tours-pdp-phase-2-evidence/<AAAA-MM-DD>-<entorno>/`. El archivo `DECISION_LOG.md` debe indicar `passed`, `failed` o `blocked`, la causa y un enlace a la evidencia.
4. Si falla un caso, abrir corrección con el ID P2-OC correspondiente. No marcar la Fase 2 como certificada mientras quede algún caso `failed` o `blocked`.

## Criterio de cierre

Este registro pasa a **certificado** sólo cuando los siete casos estén `passed`, la evidencia pertenezca a un entorno comercial controlado y el responsable de Tours/Operaciones confirme que las políticas y disponibilidad observadas son las efectivas para cada alternativa.

Al cerrarlo, actualizar este estado, añadir el enlace al directorio de evidencia y referenciar el resultado en `docs/engineering/tours-rollout-canary.md` antes de cualquier ampliación de cohorte.
