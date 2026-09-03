# FASTT — Fase 1: fundaciones de seguridad y datos

**Versión:** 1.0  
**Fecha:** 2026-09-03  
**Estado de código:** implementado y validado localmente  
**Estado de base de datos:** migración preparada; requiere aplicación controlada  
**Depende de:** `docs/command-center/phase-0-contract.md`

## 1. Resultado ejecutivo

La Fase 1 sustituye la idea de un “superadmin” por una fundación que permite asignar permisos internos específicos, limitarlos por scope, registrar decisiones y accesos sensibles, y preparar reautenticación/MFA sin bloquear el estado actual de FASTT.

La implementación es deliberadamente evolutiva. El allowlist de correos actual sigue funcionando como compatibilidad temporal, pero las rutas críticas ya consultan permisos concretos cuando existen asignaciones IAM. La desactivación del fallback será una decisión operacional posterior, no un cambio silencioso de código.

## 2. Diagnóstico del estado anterior

### 2.1 Fortalezas existentes

- Autenticación mediante Supabase y usuario local sincronizado.
- Rutas `/admin/**` separadas de la experiencia de proveedores.
- `ProviderAuditLog` con actor, snapshots y riesgo para varios cambios sensibles.
- Idempotencia localizada en pricing, reglas comerciales, refunds e integraciones.
- Asignaciones de cumplimiento con SLA y dominios de verificación, fiscalidad, documentos y pagos.
- Esquema PostgreSQL/Drizzle centralizado y migraciones versionadas.

### 2.2 Brechas que impedían crecer con seguridad

| Brecha                                                          | Riesgo                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| `internal_admin` dependía de una lista de emails                | cualquier administrador tenía implícitamente todos los poderes |
| no había roles, permisos ni scopes internos persistidos         | imposible separar fiscalidad, pagos, riesgo y auditoría        |
| no existía registro genérico de decisiones internas             | auditoría fragmentada por dominio                              |
| no existía log de reveal/download/export de PII                 | exposición sensible no reconstruible                           |
| MFA/reauth no tenía un contrato de sesión interno               | no era posible exigir step-up de forma verificable             |
| idempotencia no era reutilizable entre comandos                 | riesgo de duplicados en nuevos casework flows                  |
| la unicidad de assignment abierto era solo lógica de aplicación | condiciones de carrera podían abrir duplicados                 |

## 3. Decisiones de arquitectura

### 3.1 IAM basado en datos

Se añadieron cinco entidades:

| Entidad                   | Función                                           |
| ------------------------- | ------------------------------------------------- |
| `InternalRole`            | catálogo de roles internos                        |
| `InternalPermission`      | catálogo de acciones atómicas                     |
| `InternalRolePermission`  | permisos otorgados a un rol                       |
| `InternalUserRole`        | asignación de rol, scope, expiración y revocación |
| `InternalSecuritySession` | evidencia de MFA/reauth reciente por sesión       |

Los scopes disponibles son `global`, `provider` y `country`. Una asignación global no necesita `scopeId`; una asignación acotada lo exige.

### 3.2 Roles iniciales

`case_agent`, `fiscal_reviewer`, `payments_reviewer`, `risk_approver`, `auditor`, `policy_admin`, `access_admin` y `platform_admin`.

Estos roles no son títulos decorativos. La base de permisos impide, por ejemplo, que `fiscal_reviewer` reciba `provider.payment.review` o `payout.release`; `auditor` solo recibe lectura de auditoría; y `risk_approver` queda separado de quien propone una decisión de alto riesgo.

### 3.3 Compatibilidad temporal

Mientras `FASTT_INTERNAL_AUTH_ALLOWLIST_FALLBACK` no sea `false`, un email configurado como admin puede continuar operando como antes si aún no existen tablas IAM o no hay asignación activa. Esta salida existe exclusivamente para desplegar sin cortar operaciones.

La condición de retiro es:

1. migración aplicada;
2. responsable actual asignado explícitamente al rol mínimo necesario;
3. rutas críticas probadas con IAM;
4. procedure de break-glass definido;
5. `FASTT_INTERNAL_AUTH_ALLOWLIST_FALLBACK=false` desplegado.

## 4. Controles implementados

### 4.1 Autorización server-side

`src/lib/auth/internal-authorization.ts` resuelve un principal IAM desde la base de datos y comprueba permisos y scopes en servidor.

Las rutas existentes ya migradas son:

| Ruta                   | Permiso requerido              |
| ---------------------- | ------------------------------ |
| cola de cumplimiento   | `provider.compliance.read`     |
| asignar cumplimiento   | `case.assign`                  |
| revisar documento      | `provider.document.review`     |
| revisar fiscalidad     | `provider.fiscal.review`       |
| revisar pago           | `provider.payment.review`      |
| revisar verificación   | `provider.verification.review` |
| ver documento sensible | `sensitive_data.reveal`        |

El wrapper histórico `requireInternalAdmin` ahora usa `internal.admin.access`; no continúa evaluando directamente el email.

### 4.2 Separación de funciones

`assertSeparationOfDuties` rechaza maker/checker iguales o incompletos. Aún no se conecta a una tabla de decisiones porque esa tabla corresponde al núcleo de casos de la Fase 2; queda lista para que ese comando la use.

En el régimen actual de una sola persona:

- una revisión estándar de bajo riesgo puede ser operada por el responsable;
- un override crítico, high risk, liberación de payout o publicación de regla crítica no puede tener aprobación ficticia;
- esas acciones se bloquean, se delegan al PSP o requieren tercero identificado hasta incorporar un segundo actor.

### 4.3 Auditoría y redacción

Se añadieron `AuditEvent` y `SensitiveDataAccessEvent`.

- `AuditEvent` registra request ID, actor, roles, proveedor, acción, entidad, resultado, riesgo y snapshots redactados.
- `SensitiveDataAccessEvent` registra reveal, download o export, motivo, recurso y campos expuestos.
- La redacción es recursiva y cubre secretos, tokens, credenciales, endpoints, cuentas, routing, SWIFT, biometría y cifrado.
- La revisión de verificación ya emite `AuditEvent` y devuelve `X-Request-ID`.
- El preview de documentos exige un motivo y registra un evento de datos sensibles antes de devolver la URL firmada.

### 4.4 Idempotencia y correlación

`src/lib/commands/command-idempotency.ts` ofrece una reserva central por `scope + key` y hash canónico del payload. Un reintento con el mismo payload se reproduce; una misma key con payload diferente lanza conflicto. Un registro de comando guarda estado, respuesta, actor, request ID y expiración.

`requestIdFromRequest` acepta IDs seguros de cliente o genera UUID. Es el contrato de correlación para las nuevas rutas; su adopción se extenderá gradualmente al resto de comandos internos.

### 4.5 Integridad de datos

La migración:

- crea las tablas IAM, auditoría, acceso sensible e idempotencia;
- agrega controles de dominio, estado y rango de SLA para assignments;
- conserva el assignment abierto más reciente y cancela los duplicados históricos con una nota de migración;
- crea el índice parcial único que impide más de un assignment abierto para el mismo proveedor, dominio y entidad;
- siembra roles y permisos, pero no asigna usuarios privilegiados automáticamente.

No se elimina historia. El cierre de duplicados conserva los registros y deja una razón explícita.

## 5. Estrategia de despliegue

### Etapa A — Preproducción

1. Aplicar `db/migrations/2026-10-25_command_center_phase1_security_foundations.sql` en entorno aislado.
2. Verificar que no haya errores en constraints o índices.
3. Crear una asignación explícita de `case_agent` o la combinación mínima necesaria para el responsable actual.
4. Probar que fiscalidad no habilita pagos y auditoría no habilita mutaciones.
5. Confirmar que el preview documental conserva su log de acceso.

### Etapa B — Producción con compatibilidad

1. Aplicar la migración mediante el runner de migraciones.
2. Asignar al responsable actual los roles mínimos; no asignar `platform_admin` como rol operativo. El helper idempotente es `pnpm access:grant-internal-role --email=<correo> --role=case_agent`.
3. Mantener el fallback de allowlist durante una ventana de observación corta.
4. Comparar autorizaciones efectivas de rutas migradas contra la operación esperada.
5. Revisar `AuditEvent` y `SensitiveDataAccessEvent` diariamente durante el piloto.

### Etapa C — Corte de allowlist

1. Confirmar que toda cuenta interna activa posee al menos un `InternalUserRole` válido.
2. Crear un procedimiento de break-glass con caducidad, auditoría y revisión posterior.
3. Desplegar `FASTT_INTERNAL_AUTH_ALLOWLIST_FALLBACK=false`.
4. Alertar sobre intentos `403` inesperados y sobre uso de permisos sensibles.
5. Mantener un rollback de configuración, no un bypass de permisos.

## 6. Evidencia de validación realizada

- `astro check` pasó sin errores nuevos; existen advertencias históricas no relacionadas.
- Pruebas unitarias de IAM, scope, maker-checker, redacción, request ID e idempotencia: 9/9 aprobadas.
- Prueba de fachada DB: aprobada.
- La nueva migración pasó el parser del runner en modo `--dry-run` con 25 sentencias.
- Se regeneró `db/postgres/0001_initial_schema.sql` desde el esquema Drizzle; contiene 125 tablas y las nuevas restricciones.

## 7. Gate de Fase 1

| Criterio                                | Estado                                                   |
| --------------------------------------- | -------------------------------------------------------- |
| revisor fiscal no puede decidir payout  | cubierto por roles, permisos y pruebas                   |
| auditor no puede mutar                  | cubierto por permisos y pruebas                          |
| maker no puede aprobar su propia acción | helper implementado; integración total queda para Fase 2 |
| una sola asignación abierta             | índice parcial y deduplicación en migración              |
| auditoría de decisión nueva             | implementada en verificación; adopción gradual pendiente |
| acceso sensible auditado                | implementado en preview de documentos                    |
| MFA/reauth verificable                  | tabla y guard implementados; falta ceremonia UI/IdP      |

## 8. Gaps residuales y siguiente trabajo

1. **Aplicar migración:** el código no cambia la base de datos por sí mismo. Debe realizarse en preproducción y producción controlada.
2. **Asignar roles al responsable actual:** la migración siembra catálogo, no privilegios de usuario. Esto evita escalamientos silenciosos.
3. **MFA y reauth:** `requireRecentInternalAuthentication` ya valida una sesión elevada, pero aún falta conectar el flujo real de Supabase MFA/reauth que escriba `InternalSecuritySession`. No debe activarse el enforcement de step-up hasta completar ese flujo.
4. **Adopción de request ID/auditoría:** verificación y preview documental lo usan; los demás comandos internos deben migrarse por dominio durante Fase 2.
5. **Idempotencia:** existe el servicio central, pero los comandos heredados continúan con sus propios mecanismos. El primer consumidor natural será `ComplianceCase` en Fase 2.
6. **Separación dinámica:** el helper está listo, pero solo la futura tabla de propuestas/aprobaciones podrá impedir maker-checker a nivel de persistencia.
7. **Retención:** las nuevas tablas requieren jobs de retención, `legal_hold`, particionado y export controlado en Fase 5.
8. **Auditoría append-only:** la aplicación no expone mutaciones, pero para garantía fuerte se recomienda restringir UPDATE/DELETE a nivel de rol PostgreSQL y/o trigger antes de go-live público.

## 9. Conclusión

La Fase 1 ya elimina el principal bloqueo arquitectónico: las nuevas capacidades no tienen por qué crecer sobre el superadmin por email. FASTT dispone de un modelo de autorización granular, trazabilidad transversal y controles de integridad suficientes para comenzar la Fase 2 de casos y políticas de forma segura.

El gate queda **técnicamente preparado pero operacionalmente condicionado** a aplicar la migración, asignar roles explícitos y completar la integración real de MFA/reauth antes de activar acciones sensibles con dinero o alto riesgo.
