# Política de documentación

Status: active  
Document type: governance  
Owner: Engineering  
Last verified: 2026-09-22  
Scope: admisión, estructura, mantenimiento y retiro de documentación del repositorio  
Source of truth: `AGENTS.md`, este documento y `scripts/check-documentation-governance.mjs`  
Related code/tests: `package.json`, `.husky/pre-commit`, `.github/workflows/architecture-guardrails.yml`  
Review trigger: cambio de estructura documental o de la validación automática

## Principio

La documentación existe para permitir una decisión o una operación futura. Un análisis que sólo
explica el trabajo de una sesión pertenece a la conversación. Antes de crear un archivo, buscar en
`docs/README.md`, el índice del dominio y el contenido existente. Si el asunto ya tiene fuente
canónica, se actualiza esa fuente.

## Control de admisión

Un Markdown nuevo debe cumplir al menos uno de estos propósitos:

| Tipo            | Propósito durable                                                | Ubicación                        |
| --------------- | ---------------------------------------------------------------- | -------------------------------- |
| `governance`    | Definir cómo se administra la documentación                      | `docs/`                          |
| `canonical`     | Definir el contrato o comportamiento vigente de un dominio       | `docs/domains/<dominio>/`        |
| `decision`      | Conservar una decisión estructural, alternativas y consecuencias | `docs/engineering/adr/`          |
| `runbook`       | Guiar una operación repetible, verificable y recuperable         | `docs/runbooks/`                 |
| `certification` | Conservar evidencia fechada y resultados reproducibles           | `docs/certifications/<dominio>/` |
| `archive`       | Preservar contexto histórico que ya no es normativo              | `docs/archive/`                  |
| `index`         | Dar una ruta de lectura y señalar fuentes vigentes               | `README.md` del área             |

No se crea un documento para:

- resumir una sesión, PR o implementación;
- declarar el cierre de una fase;
- guardar un plan que dejará de ser útil al ejecutarse;
- copiar código, esquemas, pruebas o respuestas que ya son la fuente real;
- registrar un inventario temporal que puede quedar en el issue o en la conversación;
- evitar editar o consolidar una fuente existente.

## Decisión previa obligatoria

Antes de agregar el archivo, quien lo crea debe poder identificar:

1. El lector que volverá a consultarlo.
2. La decisión o acción que permitirá ejecutar.
3. La razón por la que no corresponde actualizar otro documento.
4. La fuente verificable y el responsable de mantenerlo.
5. El índice desde el que será descubierto.
6. El evento que obliga a revisarlo, reemplazarlo o archivarlo.

Si falta una respuesta, no se crea el archivo.

## Encabezado mínimo

Los documentos durables, salvo `AGENTS.md` y el `README.md` raíz, usan claves visibles al inicio:

```md
Status: active | draft | superseded | archived | <estado de certificación>
Document type: governance | canonical | decision | runbook | certification | archive | index
Owner: <equipo responsable>
Last verified: YYYY-MM-DD
Scope: <qué cubre y qué permite resolver>
Source of truth: <código, contrato o fuente verificable>
Related code/tests: <rutas concretas>
Review trigger: <evento que exige revisión o archivo>
Supersedes: <ruta anterior, cuando corresponda>
```

Los índices pueden omitir `Related code/tests`. Los ADR existentes conservan su formato histórico;
los nuevos deben seguir además las secciones exigidas por `docs/engineering/adr/README.md`.

## Tamaño y división

El objetivo es mantener cada documento por debajo de 12 KiB. Superar ese tamaño no justifica
fragmentarlo por fases: primero se eliminan cronologías, duplicación y evidencia vencida. Sólo se
divide cuando las partes tienen distinto propósito, lector o ciclo de mantenimiento. Un documento
nuevo de más de 16 KiB es rechazado por la validación automática.

Las certificaciones pueden enlazar artefactos grandes; no deben incrustar logs completos. El
archivo histórico no se usa para eludir estas reglas.

## Mantenimiento

- Toda fuente vigente debe estar enlazada desde `docs/README.md` o desde el `README.md` de su área.
- Una certificación demuestra lo observado en una fecha; nunca redefine el contrato vigente.
- Al reemplazar una fuente, actualizar enlaces y registrar `Supersedes` en el mismo cambio.
- El documento reemplazado se elimina si Git conserva evidencia suficiente; sólo se archiva cuando
  su contexto sigue siendo necesario para operar, auditar o investigar una regresión.
- Al tocar un documento heredado, consolidar la parte modificada cuando sea razonable. La deuda
  histórica no exige reescribir archivos ajenos al cambio.

## Validación

```bash
pnpm run check:docs
pnpm run check:docs:staged
```

El primer comando revisa cambios locales y archivos sin seguimiento. El segundo revisa exactamente
lo preparado para commit. CI aplica las mismas reglas a los Markdown agregados o modificados en el
cambio. La validación exige metadata y ubicación en archivos nuevos, comprueba su indexación,
rechaza nombres efímeros y detecta enlaces locales rotos.
