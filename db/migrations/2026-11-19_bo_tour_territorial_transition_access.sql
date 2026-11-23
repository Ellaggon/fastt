-- Defines a bundle-specific capability. No users or general admin roles receive it automatically.
INSERT INTO "InternalPermission" ("key", "label", "description", "isSensitive")
VALUES ('commercial_policy.bo_tour_territorial_transition.apply', 'Activar el paquete territorial BO Tours',
        'Solo permite aplicar bo-tour-territorial-redesign-v1 mediante su transaccion coordinada y MFA.', TRUE)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "InternalRole" ("id", "key", "label", "description")
VALUES ('internal_role_bo_tour_territorial_transition', 'bo_tour_territorial_transition',
        'Transicion territorial BO Tours', 'Acceso exclusivo al paquete territorial BO Tours; no concede publicacion ni retiro generales.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "InternalRolePermission" ("roleId", "permissionKey")
SELECT "id", 'commercial_policy.bo_tour_territorial_transition.apply'
FROM "InternalRole" WHERE "key" = 'bo_tour_territorial_transition'
ON CONFLICT DO NOTHING;
