-- Command Center Phase 1: IAM, append-only audit, sensitive-data access and idempotency.
-- Existing email allowlists remain an explicitly temporary compatibility path until
-- an owner has been assigned in InternalUserRole.

CREATE TABLE IF NOT EXISTS "InternalRole" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"key" TEXT NOT NULL UNIQUE,
	"label" TEXT NOT NULL,
	"description" TEXT,
	"isSystem" BOOLEAN NOT NULL DEFAULT TRUE,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "InternalRole_key_format_check" CHECK ("key" ~ '^[a-z][a-z0-9_.-]{2,95}$')
);

CREATE TABLE IF NOT EXISTS "InternalPermission" (
	"key" TEXT PRIMARY KEY NOT NULL,
	"label" TEXT NOT NULL,
	"description" TEXT,
	"isSensitive" BOOLEAN NOT NULL DEFAULT FALSE,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "InternalPermission_key_format_check" CHECK ("key" ~ '^[a-z][a-z0-9_.-]{2,127}$')
);

CREATE TABLE IF NOT EXISTS "InternalRolePermission" (
	"roleId" TEXT NOT NULL REFERENCES "InternalRole"("id") ON DELETE CASCADE,
	"permissionKey" TEXT NOT NULL REFERENCES "InternalPermission"("key") ON DELETE CASCADE,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY ("roleId", "permissionKey")
);

CREATE TABLE IF NOT EXISTS "InternalUserRole" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
	"roleId" TEXT NOT NULL REFERENCES "InternalRole"("id") ON DELETE CASCADE,
	"scopeType" TEXT NOT NULL DEFAULT 'global',
	"scopeId" TEXT,
	"status" TEXT NOT NULL DEFAULT 'active',
	"expiresAt" TIMESTAMPTZ,
	"grantedByUserId" TEXT REFERENCES "User"("id"),
	"revokedAt" TIMESTAMPTZ,
	"revokedByUserId" TEXT REFERENCES "User"("id"),
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "InternalUserRole_scope_shape_check" CHECK (("scopeType" = 'global' AND "scopeId" IS NULL) OR ("scopeType" <> 'global' AND "scopeId" IS NOT NULL)),
	CONSTRAINT "InternalUserRole_status_check" CHECK ("status" IN ('active', 'revoked', 'expired'))
);
CREATE INDEX IF NOT EXISTS "InternalUserRole_user_status_idx" ON "InternalUserRole" ("userId", "status");
CREATE INDEX IF NOT EXISTS "InternalUserRole_role_status_idx" ON "InternalUserRole" ("roleId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "InternalUserRole_active_unique" ON "InternalUserRole" ("userId", "roleId", "scopeType", "scopeId") WHERE "status" = 'active';

CREATE TABLE IF NOT EXISTS "InternalSecuritySession" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
	"sessionFingerprint" TEXT NOT NULL UNIQUE,
	"mfaVerifiedAt" TIMESTAMPTZ,
	"reauthenticatedAt" TIMESTAMPTZ,
	"expiresAt" TIMESTAMPTZ NOT NULL,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "InternalSecuritySession_user_expires_idx" ON "InternalSecuritySession" ("userId", "expiresAt");

CREATE TABLE IF NOT EXISTS "AuditEvent" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"requestId" TEXT NOT NULL,
	"actorUserId" TEXT REFERENCES "User"("id"),
	"actorRoleKeysJson" JSONB,
	"providerId" TEXT REFERENCES "Provider"("id"),
	"action" TEXT NOT NULL,
	"entityType" TEXT NOT NULL,
	"entityId" TEXT,
	"outcome" TEXT NOT NULL DEFAULT 'succeeded',
	"riskLevel" TEXT NOT NULL DEFAULT 'low',
	"beforeJson" JSONB,
	"afterJson" JSONB,
	"contextJson" JSONB,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "AuditEvent_outcome_check" CHECK ("outcome" IN ('attempted', 'succeeded', 'denied', 'failed')),
	CONSTRAINT "AuditEvent_risk_check" CHECK ("riskLevel" IN ('low', 'medium', 'high', 'critical'))
);
CREATE INDEX IF NOT EXISTS "AuditEvent_request_created_idx" ON "AuditEvent" ("requestId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_actor_created_idx" ON "AuditEvent" ("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_provider_created_idx" ON "AuditEvent" ("providerId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_entity_created_idx" ON "AuditEvent" ("entityType", "entityId", "createdAt");

CREATE TABLE IF NOT EXISTS "SensitiveDataAccessEvent" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"auditEventId" TEXT REFERENCES "AuditEvent"("id"),
	"requestId" TEXT NOT NULL,
	"actorUserId" TEXT REFERENCES "User"("id"),
	"providerId" TEXT REFERENCES "Provider"("id"),
	"resourceType" TEXT NOT NULL,
	"resourceId" TEXT,
	"accessType" TEXT NOT NULL,
	"reason" TEXT NOT NULL,
	"fieldsJson" JSONB,
	"success" BOOLEAN NOT NULL DEFAULT TRUE,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "SensitiveDataAccessEvent_type_check" CHECK ("accessType" IN ('reveal', 'download', 'export'))
);
CREATE INDEX IF NOT EXISTS "SensitiveDataAccessEvent_actor_created_idx" ON "SensitiveDataAccessEvent" ("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "SensitiveDataAccessEvent_resource_created_idx" ON "SensitiveDataAccessEvent" ("resourceType", "resourceId", "createdAt");

CREATE TABLE IF NOT EXISTS "CommandIdempotency" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"scope" TEXT NOT NULL,
	"key" TEXT NOT NULL,
	"requestHash" TEXT NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'started',
	"responseJson" JSONB,
	"actorUserId" TEXT REFERENCES "User"("id"),
	"requestId" TEXT NOT NULL,
	"expiresAt" TIMESTAMPTZ NOT NULL,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "CommandIdempotency_status_check" CHECK ("status" IN ('started', 'succeeded', 'failed')),
	CONSTRAINT "CommandIdempotency_scope_key_unique" UNIQUE ("scope", "key")
);
CREATE INDEX IF NOT EXISTS "CommandIdempotency_expires_idx" ON "CommandIdempotency" ("expiresAt");

-- Preserve the newest open assignment and close only historical duplicates before
-- the partial unique index makes the invariant database-enforced.
WITH ranked AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "providerId", "domain", "entityId"
		ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
	) AS position
	FROM "ProviderComplianceAssignment"
	WHERE "status" = 'open'
)
UPDATE "ProviderComplianceAssignment" assignment
SET "status" = 'canceled',
	"notes" = concat_ws(E'\n', assignment."notes", '[phase1] duplicate open assignment closed during invariant migration'),
	"updatedAt" = CURRENT_TIMESTAMP
FROM ranked
WHERE assignment."id" = ranked."id" AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderComplianceAssignment_open_unique"
	ON "ProviderComplianceAssignment" ("providerId", "domain", "entityId")
	WHERE "status" = 'open';

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProviderComplianceAssignment_domain_check') THEN
		ALTER TABLE "ProviderComplianceAssignment"
			ADD CONSTRAINT "ProviderComplianceAssignment_domain_check"
			CHECK ("domain" IN ('verification', 'fiscal', 'documents', 'payments')) NOT VALID;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProviderComplianceAssignment_status_check') THEN
		ALTER TABLE "ProviderComplianceAssignment"
			ADD CONSTRAINT "ProviderComplianceAssignment_status_check"
			CHECK ("status" IN ('open', 'done', 'canceled')) NOT VALID;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProviderComplianceAssignment_sla_hours_check') THEN
		ALTER TABLE "ProviderComplianceAssignment"
			ADD CONSTRAINT "ProviderComplianceAssignment_sla_hours_check"
			CHECK ("slaHours" BETWEEN 1 AND 168) NOT VALID;
	END IF;
END;
$$;

INSERT INTO "InternalRole" ("id", "key", "label", "description") VALUES
	('internal_role_case_agent', 'case_agent', 'Agente de casos', 'Lee y propone decisiones en casos asignados.'),
	('internal_role_fiscal_reviewer', 'fiscal_reviewer', 'Revisor fiscal', 'Revisa fiscalidad; no puede decidir pagos.'),
	('internal_role_payments_reviewer', 'payments_reviewer', 'Revisor de pagos', 'Revisa cuentas y pagos; no puede revisar fiscalidad.'),
	('internal_role_risk_approver', 'risk_approver', 'Aprobador de riesgo', 'Aprueba como segundo actor cuando exista maker distinto.'),
	('internal_role_auditor', 'auditor', 'Auditor', 'Solo lectura de evidencia y auditoría.'),
	('internal_role_policy_admin', 'policy_admin', 'Administrador de políticas', 'Edita políticas; publicación crítica exige segundo actor.'),
	('internal_role_access_admin', 'access_admin', 'Administrador de accesos', 'Gestiona roles y accesos bajo control reforzado.'),
	('internal_role_platform_admin', 'platform_admin', 'Administrador de plataforma', 'Acceso de emergencia sin permisos de negocio implícitos.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "InternalPermission" ("key", "label", "isSensitive") VALUES
	('internal.admin.access', 'Acceso interno general', FALSE),
	('provider.compliance.read', 'Leer cola de cumplimiento', FALSE),
	('provider.document.review', 'Revisar documentos', TRUE),
	('provider.fiscal.review', 'Revisar fiscalidad', TRUE),
	('provider.payment.review', 'Revisar cuenta de pago', TRUE),
	('provider.verification.review', 'Revisar verificación', TRUE),
	('case.assign', 'Asignar casos', FALSE),
	('case.decision.propose', 'Proponer decisión', TRUE),
	('case.decision.approve_high_risk', 'Aprobar alto riesgo', TRUE),
	('audit.read', 'Leer auditoría', TRUE),
	('audit.export', 'Exportar auditoría', TRUE),
	('sensitive_data.reveal', 'Revelar datos sensibles', TRUE),
	('sensitive_data.download', 'Descargar datos sensibles', TRUE),
	('policy.edit', 'Editar política', TRUE),
	('policy.publish', 'Publicar política', TRUE),
	('access.manage', 'Gestionar accesos', TRUE),
	('payout.release', 'Liberar payout', TRUE)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "InternalRolePermission" ("roleId", "permissionKey")
SELECT roles."id", permissions."key"
FROM "InternalRole" roles
JOIN "InternalPermission" permissions ON (roles."key", permissions."key") IN (
	('case_agent', 'internal.admin.access'), ('case_agent', 'provider.compliance.read'), ('case_agent', 'provider.document.review'), ('case_agent', 'sensitive_data.reveal'), ('case_agent', 'case.assign'), ('case_agent', 'case.decision.propose'),
	('fiscal_reviewer', 'internal.admin.access'), ('fiscal_reviewer', 'provider.compliance.read'), ('fiscal_reviewer', 'provider.fiscal.review'), ('fiscal_reviewer', 'case.decision.propose'),
	('payments_reviewer', 'internal.admin.access'), ('payments_reviewer', 'provider.compliance.read'), ('payments_reviewer', 'provider.payment.review'), ('payments_reviewer', 'case.decision.propose'),
	('risk_approver', 'internal.admin.access'), ('risk_approver', 'provider.compliance.read'), ('risk_approver', 'case.decision.approve_high_risk'),
	('auditor', 'internal.admin.access'), ('auditor', 'provider.compliance.read'), ('auditor', 'audit.read'),
	('policy_admin', 'internal.admin.access'), ('policy_admin', 'policy.edit'), ('policy_admin', 'policy.publish'), ('policy_admin', 'audit.read'),
	('access_admin', 'internal.admin.access'), ('access_admin', 'access.manage'), ('access_admin', 'audit.read'),
	('platform_admin', 'internal.admin.access')
)
ON CONFLICT DO NOTHING;
