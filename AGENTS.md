# Guía de documentación para agentes

Antes de modificar el proyecto:

1. Lee `README.md` y después `docs/README.md`.
2. Abre únicamente el índice del dominio relacionado con la tarea.
3. Considera fuente vigente sólo un documento con `Status: active`.
4. Consulta ADRs para decisiones estructurales y runbooks para operaciones.
5. Usa certificaciones y `docs/archive/` como evidencia histórica, no como especificación actual.
6. Verifica siempre las rutas de código y pruebas enlazadas; el código prevalece si una evidencia fechada quedó obsoleta.

## Control de admisión documental

Antes de crear, renombrar o ampliar sustancialmente un Markdown bajo `docs/`, lee
[`docs/DOCUMENTATION_POLICY.md`](docs/DOCUMENTATION_POLICY.md) y busca primero la fuente
canónica existente. La decisión predeterminada es actualizar esa fuente o responder en la
conversación.

No agregues un Markdown por cada análisis, fase o sesión. Un archivo nuevo sólo se admite
cuando será una especificación canónica, un ADR, un runbook repetible, una certificación que
deba conservar evidencia o un índice. El archivo debe tener lector futuro, acción concreta,
responsable, fuente verificable, enlace desde un índice y condición de revisión.

Los resúmenes de sesión, cierres de fase, planes consumidos, inventarios temporales y copias de
información del código se mantienen en la conversación o se integran en la fuente canónica.
No se crean archivos con nombres como `phase-*-closeout.md`, `session-summary.md` o
`implementation-report.md`.

Todo documento durable debe declarar los metadatos definidos por la política. Si reemplaza otro
documento, registra `Supersedes` y elimina o archiva la fuente anterior en el mismo cambio.
Ejecuta `pnpm run check:docs` al modificar documentación y `pnpm run check:docs:staged` antes
de confirmar cambios.
