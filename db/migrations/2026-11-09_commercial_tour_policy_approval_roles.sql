-- Keep commercial-tour ratification separate from general policy editing and
-- from document/payment review. Assignment is deliberate and auditable.

INSERT INTO "InternalPermission" ("key", "label", "description", "isSensitive") VALUES
  ('commercial_policy.policy.approve', 'Ratificar política comercial', 'Firma el componente de Políticas de una versión comercial.', TRUE),
  ('commercial_policy.finance.approve', 'Ratificar condición financiera comercial', 'Firma el componente de Finanzas de una versión comercial.', TRUE),
  ('commercial_policy.tour_operations.approve', 'Ratificar operación de tours', 'Firma el componente de Operaciones Tours de una versión comercial.', TRUE)
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "isSensitive" = EXCLUDED."isSensitive";

INSERT INTO "InternalRole" ("id", "key", "label", "description") VALUES
  ('internal_role_commercial_policy_reviewer', 'commercial_policy_reviewer', 'Revisor de política comercial', 'Ratifica el componente de Políticas de versiones comerciales.'),
  ('internal_role_commercial_finance_reviewer', 'commercial_finance_reviewer', 'Revisor financiero comercial', 'Ratifica el componente financiero de versiones comerciales.'),
  ('internal_role_tour_operations_reviewer', 'tour_operations_reviewer', 'Revisor de Operaciones Tours', 'Ratifica el componente operativo de tours de versiones comerciales.')
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description";

INSERT INTO "InternalRolePermission" ("roleId", "permissionKey")
SELECT roles."id", permissions."key"
FROM "InternalRole" roles
JOIN "InternalPermission" permissions ON (roles."key", permissions."key") IN (
  ('commercial_policy_reviewer', 'commercial_policy.policy.approve'),
  ('commercial_finance_reviewer', 'commercial_policy.finance.approve'),
  ('tour_operations_reviewer', 'commercial_policy.tour_operations.approve')
)
ON CONFLICT DO NOTHING;
