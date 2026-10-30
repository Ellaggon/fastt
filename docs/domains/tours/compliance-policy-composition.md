# Composición de políticas de cumplimiento

Status: active
Document type: canonical
Owner: Engineering / Compliance
Last verified: 2026-10-29
Scope: composición, sustitución y diagnóstico de políticas comerciales de experiencias
Source of truth: src/lib/commercial-policy/composition.ts y evaluate.ts
Related code/tests: tests/unit/policy-composition.test.ts; tests/postgres/policy-composition.test.ts
Review trigger: cambio del contrato, firmas, cobertura territorial o activación en otro entorno

## Persistencia y compatibilidad

El contrato 3 reside en CompliancePolicyVersion.contextJson; no se añade otra tabla de relaciones
ni se duplica el contenido firmado. composition declara función, familia, cobertura requerida y
referencias explícitas a versiones sustituidas. Los triggers PostgreSQL protegen las referencias,
el contexto, los requisitos y las dimensiones del conjunto después de la firma. Los contratos
históricos conservan su formato y selección integral; no se dividen ni se reclasifican al migrar.

Esta decisión reutiliza persistencia existente y no amplía las excepciones de tablas de Tours.
La migración instala funciones y triggers; no publica políticas ni concede admisión comercial.

## Semántica

Cada ámbito necesita una admisión única y todas las familias declaradas. Las políticas de
requisitos aplicables se acumulan. Dos versiones del mismo conjunto no adquieren prioridad por
fecha o número: requieren una sustitución explícita o producen conflicto. Las sustituciones se
resuelven por territorio, conservando obligaciones fuera de su alcance. Referencias desconocidas,
ciclos y sucesores rivales fallan cerrados. Un predecesor vencido conserva su identidad histórica.
Retirar un sucesor sin otro reemplazo vigente está prohibido; no reactiva una política anterior.
La sustitución conserva su efecto de supresión después del vencimiento del sucesor. Restaurar
una base requiere otra versión aprobada; un hueco de vigencia bloquea, no revive requisitos viejos.

El inicio es inclusivo y el final exclusivo. Una política puede estar aprobada y programada sin
estar vigente. El evaluador emite versiones, sustituciones, familias pendientes y conflictos.
La simulación usa el mismo evaluador sobre contexto y evidencias actuales a la fecha indicada;
no es reconstrucción histórica ni ejecuta publicación, aprobación o cobro.

## Explicación compartida

El diagnóstico conserva fecha de evaluación, identidad compuesta del requisito y resultados de
alternativas por sujeto. La cobertura explicativa distingue comprobada, parcial y desconocida;
no concede capacidades ni convierte falta de configuración en prohibición legal. Las superficies
comparten la clasificación de hallazgos en findings.ts y priorizan tareas resolubles del proveedor
sin ocultar esperas de Fastt. Los comandos siguen reevaluando hechos actuales; el diagnóstico
presentado por el navegador nunca autoriza una operación. Los contratos históricos mantienen
su evaluación integral y no adquieren trazas territoriales inventadas.

Las superficies de listado y publicación abren un ámbito de lectura efímero con AsyncLocalStorage.
Dentro de ese ámbito se comparten promesas de titular, documentos, líneas, acuerdo, políticas,
reglas, aprobaciones y geografía cuando sus claves coinciden. Cada experiencia conserva su
evaluación independiente. No hay caché global ni reutilización entre peticiones; los comandos
fuera del ámbito leen de nuevo. Las pruebas de commercial-read-scope verifican aislamiento de
proveedores y peticiones concurrentes, coalescencia y recuperación después de errores.
La simulación descarta respuestas si cambia la selección y permite reintentar tras un fallo.

## Gobierno y evidencia

Lectura y ratificación comparten parser de selectores, condiciones y requisitos. Cada firma
registra en auditoría la huella del contrato evaluado, sin inventar firmas históricas. Los
requisitos nuevos componibles referencian definiciones documentales publicadas; admiten paquetes
completos alternativos y selección explícita del titular, guías, operador o recursos declarados.
No se retira una definición que todavía sostiene políticas publicadas no finalizadas.

Crear un borrador o aplicar la migración no habilita una operación. Se conservan las tres áreas
de aprobación existentes y los controles independientes de proveedor, acuerdo y preparación.
Producción requiere su propia revisión y operación de migración; las pruebas aisladas no la
autorizan. Las reservas y sus snapshots no se modifican.
