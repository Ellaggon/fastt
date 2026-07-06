-- Final policy integrity:
-- - every policy group belongs to an existing provider;
-- - assignment category always matches its group;
-- - policy lifecycle excludes the unused template state;
-- - legal/support overrides live in PolicyExceptionRule, not Policy JSON flags.

UPDATE PolicyGroup
SET ownerProviderId = (
	SELECT product.providerId
	FROM PolicyAssignment assignment
	JOIN Product product
		ON assignment.scope = 'product'
		AND assignment.scopeId = product.id
	WHERE assignment.policyGroupId = PolicyGroup.id
		AND product.providerId IS NOT NULL
		AND trim(product.providerId) <> ''
	ORDER BY assignment.isActive DESC, assignment.id
	LIMIT 1
)
WHERE ownerProviderId IS NULL
	OR trim(ownerProviderId) = ''
	OR NOT EXISTS (
		SELECT 1
		FROM Provider
		WHERE Provider.id = PolicyGroup.ownerProviderId
	);

UPDATE PolicyGroup
SET ownerProviderId = (
	SELECT product.providerId
	FROM PolicyAssignment assignment
	JOIN Variant variant
		ON assignment.scope = 'variant'
		AND assignment.scopeId = variant.id
	JOIN Product product ON product.id = variant.productId
	WHERE assignment.policyGroupId = PolicyGroup.id
		AND product.providerId IS NOT NULL
		AND trim(product.providerId) <> ''
	ORDER BY assignment.isActive DESC, assignment.id
	LIMIT 1
)
WHERE ownerProviderId IS NULL
	OR trim(ownerProviderId) = ''
	OR NOT EXISTS (
		SELECT 1
		FROM Provider
		WHERE Provider.id = PolicyGroup.ownerProviderId
	);

UPDATE PolicyGroup
SET ownerProviderId = (
	SELECT product.providerId
	FROM PolicyAssignment assignment
	JOIN RatePlan rate_plan
		ON assignment.scope = 'rate_plan'
		AND assignment.scopeId = rate_plan.id
	JOIN Variant variant ON variant.id = rate_plan.variantId
	JOIN Product product ON product.id = variant.productId
	WHERE assignment.policyGroupId = PolicyGroup.id
		AND product.providerId IS NOT NULL
		AND trim(product.providerId) <> ''
	ORDER BY assignment.isActive DESC, assignment.id
	LIMIT 1
)
WHERE ownerProviderId IS NULL
	OR trim(ownerProviderId) = ''
	OR NOT EXISTS (
		SELECT 1
		FROM Provider
		WHERE Provider.id = PolicyGroup.ownerProviderId
	);

-- An unassigned historical group can only be attributed automatically when the
-- workspace has exactly one provider. Ambiguous ownership must stop deployment.
UPDATE PolicyGroup
SET ownerProviderId = (SELECT id FROM Provider ORDER BY id LIMIT 1)
WHERE (
		ownerProviderId IS NULL
		OR trim(ownerProviderId) = ''
		OR NOT EXISTS (
			SELECT 1
			FROM Provider
			WHERE Provider.id = PolicyGroup.ownerProviderId
		)
	)
	AND (SELECT COUNT(*) FROM Provider) = 1;

DROP TABLE IF EXISTS _PolicyOwnerIntegrity;
CREATE TEMP TABLE _PolicyOwnerIntegrity (
	invalidOwners INTEGER NOT NULL CHECK (invalidOwners = 0)
);
INSERT INTO _PolicyOwnerIntegrity (invalidOwners)
SELECT COUNT(*)
FROM PolicyGroup policy_group
WHERE policy_group.ownerProviderId IS NULL
	OR trim(policy_group.ownerProviderId) = ''
	OR NOT EXISTS (
		SELECT 1
		FROM Provider
		WHERE Provider.id = policy_group.ownerProviderId
	);
DROP TABLE _PolicyOwnerIntegrity;

-- The group owns the category. Repair denormalized assignment values first.
UPDATE PolicyAssignment
SET category = (
	SELECT policy_group.category
	FROM PolicyGroup policy_group
	WHERE policy_group.id = PolicyAssignment.policyGroupId
)
WHERE EXISTS (
	SELECT 1
	FROM PolicyGroup policy_group
	WHERE policy_group.id = PolicyAssignment.policyGroupId
		AND policy_group.category <> PolicyAssignment.category
);

UPDATE Policy
SET status = 'draft'
WHERE status = 'template';

DROP TRIGGER IF EXISTS policy_group_require_owner_insert;
CREATE TRIGGER policy_group_require_owner_insert
BEFORE INSERT ON PolicyGroup
FOR EACH ROW
WHEN NEW.ownerProviderId IS NULL
	OR trim(NEW.ownerProviderId) = ''
	OR NOT EXISTS (
		SELECT 1
		FROM Provider
		WHERE Provider.id = NEW.ownerProviderId
	)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_GROUP_OWNER_REQUIRED');
END;

DROP TRIGGER IF EXISTS policy_group_require_owner_update;
CREATE TRIGGER policy_group_require_owner_update
BEFORE UPDATE OF ownerProviderId ON PolicyGroup
FOR EACH ROW
WHEN NEW.ownerProviderId IS NULL
	OR trim(NEW.ownerProviderId) = ''
	OR NOT EXISTS (
		SELECT 1
		FROM Provider
		WHERE Provider.id = NEW.ownerProviderId
	)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_GROUP_OWNER_REQUIRED');
END;

DROP TRIGGER IF EXISTS policy_assignment_category_matches_group_insert;
CREATE TRIGGER policy_assignment_category_matches_group_insert
BEFORE INSERT ON PolicyAssignment
FOR EACH ROW
WHEN NOT EXISTS (
	SELECT 1
	FROM PolicyGroup
	WHERE PolicyGroup.id = NEW.policyGroupId
		AND PolicyGroup.category = NEW.category
)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_ASSIGNMENT_CATEGORY_MISMATCH');
END;

DROP TRIGGER IF EXISTS policy_assignment_category_matches_group_update;
CREATE TRIGGER policy_assignment_category_matches_group_update
BEFORE UPDATE OF policyGroupId, category ON PolicyAssignment
FOR EACH ROW
WHEN NOT EXISTS (
	SELECT 1
	FROM PolicyGroup
	WHERE PolicyGroup.id = NEW.policyGroupId
		AND PolicyGroup.category = NEW.category
)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_ASSIGNMENT_CATEGORY_MISMATCH');
END;

DROP TRIGGER IF EXISTS policy_group_category_consistent_update;
CREATE TRIGGER policy_group_category_consistent_update
BEFORE UPDATE OF category ON PolicyGroup
FOR EACH ROW
WHEN EXISTS (
	SELECT 1
	FROM PolicyAssignment
	WHERE PolicyAssignment.policyGroupId = NEW.id
		AND PolicyAssignment.category <> NEW.category
)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_GROUP_CATEGORY_HAS_ASSIGNMENTS');
END;

DROP TRIGGER IF EXISTS policy_status_validate_insert;
CREATE TRIGGER policy_status_validate_insert
BEFORE INSERT ON Policy
FOR EACH ROW
WHEN NEW.status NOT IN ('draft', 'active', 'archived')
BEGIN
	SELECT RAISE(ABORT, 'POLICY_INVALID_STATUS');
END;

DROP TRIGGER IF EXISTS policy_status_validate_update;
CREATE TRIGGER policy_status_validate_update
BEFORE UPDATE OF status ON Policy
FOR EACH ROW
WHEN NEW.status NOT IN ('draft', 'active', 'archived')
BEGIN
	SELECT RAISE(ABORT, 'POLICY_INVALID_STATUS');
END;

ALTER TABLE Policy DROP COLUMN legalOverrideFlags;
