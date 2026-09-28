# Certificación de verificación por línea — 2026-09-26

Status: passed  
Document type: certification  
Owner: Provider Policy / QA  
Last verified: 2026-09-26  
Scope: ocho escenarios mínimos de cuenta, paquete y salida  
Source of truth: `src/lib/verification/line-gate.ts`, `src/lib/verification/requirement-resolver.ts`, `src/lib/verification/screen-sections.ts`  
Related code/tests: `tests/unit/verification-line-certification.test.ts`, `src/pages/api/booking/confirm.ts`  
Review trigger: cambio de la puerta de línea, del paquete o de la fecha en que una reserva juzga el vencimiento

Observado el 2026-09-26 sobre las funciones puras que usan publicar, reservar y la vista previa.
No sustituye el anexo de alojamiento ni la matriz de tours.

## Resultado

| Escenario | Observado |
| --- | --- |
| Guía independiente con cobro directo | Pide credencial de guía. No pide registro mercantil, seguro ni titularidad. Pagos no entra en el avance. Publicar y reservar con el guía asignado quedan permitidos. |
| Operador jurídico con varias actividades | Una sola habilitación de operador y un solo registro de entidad. El rafting pide seguro. El recorrido urbano y gastronómico no lo pide. Alimentos queda fuera del porcentaje y no bloquea. |
| Hotel solamente | La pantalla muestra cuenta compartida y alojamientos. Publicar exige titularidad y licencia del establecimiento. Reservar ese hotel no pide guía ni salida. |
| Hotel y tours | La pantalla muestra las tres secciones. Un hotel con su licencia no espera la credencial del tour. Un tour con su licencia no espera la titularidad del hotel. |
| Persona natural | El registro mercantil no aparece en requisitos, en la pantalla ni en la puerta. El tour se publica sin ese documento. |
| Entidad | El registro aparece una vez, en la cuenta compartida. El mismo documento habilita el hotel y el tour. Sin él, las dos líneas quedan bloqueadas. |
| Tour de aventura | El seguro es obligatorio. Cubre al guía de la salida. No cubre a otro guía. No aparece un permiso de área. |
| Cambio de guía o vencimiento | La credencial de Ana permite su salida el 2026-09-30 y el día de vencimiento 2026-10-01. La salida de Luis queda bloqueada. La salida de Ana el 2026-10-02 queda bloqueada. El hotel de la misma cuenta sigue permitido. |

Comando reproducible:

```bash
pnpm exec vitest run tests/unit/verification-line-certification.test.ts
```

La confirmación de reserva pasa la fecha de la salida a esa misma decisión.

## Límites de esta observación

La corrida no abrió un navegador ni una base. En Vitest la puerta HTTP no lanza el bloqueo salvo `FASTT_ENFORCE_LINE_GATE=1`; la decisión certificada es la función que esa puerta llama en producción. Las filas que dicen «pantalla» observan las secciones que construye el resolvedor, no el playbook visible: ese playbook cuenta un paso por pestaña y no repite la cuenta compartida. Una reserva ya confirmada no se reinterpreta. Una licencia de operación sin alcance sigue pudiendo coincidir con el establecimiento y con el guía. Los documentos nuevos de tours siguen fuera hasta la firma de Políticas, Finanzas y Operaciones Tours.
