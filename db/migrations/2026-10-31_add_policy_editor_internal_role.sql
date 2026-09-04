-- Minimal policy authoring role. Deliberately excludes policy.publish so a
-- single operator can prepare or reject drafts but cannot publish a policy.
INSERT INTO "InternalRole" ("id", "key", "label", "description")
VALUES (
	'internal_role_policy_editor',
	'policy_editor',
	'Editor de políticas',
	'Crea, consulta y rechaza borradores de política; no puede aprobar, activar ni publicar.'
)
ON CONFLICT ("key") DO UPDATE
SET
	"label" = EXCLUDED."label",
	"description" = EXCLUDED."description";

INSERT INTO "InternalRolePermission" ("roleId", "permissionKey")
SELECT roles."id", permissions."key"
FROM "InternalRole" roles
JOIN "InternalPermission" permissions
	ON roles."key" = 'policy_editor'
	AND permissions."key" = 'policy.edit'
ON CONFLICT DO NOTHING;
