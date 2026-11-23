INSERT INTO "InternalPermission" ("key", "label", "description", "isSensitive")
VALUES ('commercial_policy.retire', 'Retirar versiones comerciales de Tours',
        'Retira versiones comerciales publicadas de Tours sin borrar su historial.', TRUE)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "InternalRole" ("id", "key", "label", "description")
VALUES ('internal_role_commercial_policy_retirement', 'commercial_policy_retirement',
        'Retiro de políticas comerciales de Tours', 'Permite retirar versiones comerciales de Tours.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "InternalRolePermission" ("roleId", "permissionKey")
SELECT "id", 'commercial_policy.retire'
FROM "InternalRole" WHERE "key" IN ('commercial_policy_retirement', 'policy_admin')
ON CONFLICT DO NOTHING;

INSERT INTO "InternalPermission" ("key", "label", "isSensitive")
VALUES ('commercial_policy.la_paz_cleanup.retire', 'Retirar duplicados de Tours La Paz', TRUE)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "InternalRole" ("id", "key", "label")
VALUES ('internal_role_la_paz_policy_cleanup', 'la_paz_policy_cleanup', 'Retiro acotado de duplicados La Paz')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "InternalRolePermission" ("roleId", "permissionKey")
SELECT "id", 'commercial_policy.la_paz_cleanup.retire'
FROM "InternalRole" WHERE "key" = 'la_paz_policy_cleanup'
ON CONFLICT DO NOTHING;
