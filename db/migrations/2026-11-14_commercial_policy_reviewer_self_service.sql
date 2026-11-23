INSERT INTO "InternalPermission" ("key", "label", "description", "isSensitive")
VALUES ('commercial_policy.reviewer_access.request', 'Solicitar acceso temporal de ratificación',
        'Permite solicitar roles temporales de ratificación para la propia cuenta con MFA.', TRUE)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "InternalRole" ("id", "key", "label", "description")
VALUES ('internal_role_commercial_reviewer_self_service', 'commercial_reviewer_self_service',
        'Autoservicio de ratificación comercial', 'Autoriza solicitar acceso temporal para la propia cuenta.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "InternalRolePermission" ("roleId", "permissionKey")
SELECT "id", 'commercial_policy.reviewer_access.request'
FROM "InternalRole" WHERE "key" = 'commercial_reviewer_self_service'
ON CONFLICT DO NOTHING;
