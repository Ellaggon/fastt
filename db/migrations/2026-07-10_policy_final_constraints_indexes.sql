-- Final indexes and persistent constraints for the canonical policy contract.
-- SQLite/Turso keeps commercial dates as YYYY-MM-DD TEXT; invariants that Astro DB
-- cannot express as CHECK constraints are enforced with triggers.

-- Normalize duplicate policy versions before enforcing per-group version uniqueness.
WITH ranked_policy_versions AS (
	SELECT
		id,
		groupId,
		ROW_NUMBER() OVER (
			PARTITION BY groupId
			ORDER BY COALESCE(version, 0), id
		) AS normalizedVersion
	FROM Policy
)
UPDATE Policy
SET version = (
	SELECT normalizedVersion
	FROM ranked_policy_versions ranked
	WHERE ranked.id = Policy.id
)
WHERE EXISTS (
	SELECT 1
	FROM ranked_policy_versions ranked
	WHERE ranked.id = Policy.id
		AND COALESCE(Policy.version, 0) <> ranked.normalizedVersion
);

-- Keep one value per policy rule key. NULL keys are treated as malformed legacy
-- metadata and are removed because all retained policy parameters need names.
DELETE FROM PolicyRule
WHERE ruleKey IS NULL
	OR trim(ruleKey) = '';

DELETE FROM PolicyRule
WHERE id NOT IN (
	SELECT MIN(id)
	FROM PolicyRule
	GROUP BY policyId, ruleKey
);

-- Retire malformed tiers before final tier guards.
DELETE FROM CancellationTier
WHERE policyId IS NULL
	OR daysBeforeArrival IS NULL
	OR daysBeforeArrival < 0
	OR penaltyType NOT IN ('percentage', 'fixed', 'nights', 'none')
	OR (
		penaltyType <> 'none'
		AND penaltyAmount IS NOT NULL
		AND penaltyAmount < 0
	);

CREATE INDEX IF NOT EXISTS idx_policy_group_owner_category
	ON PolicyGroup (ownerProviderId, category);

CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_group_version_unique
	ON Policy (groupId, version);

CREATE INDEX IF NOT EXISTS idx_policy_group_status_version
	ON Policy (groupId, status, version);

CREATE INDEX IF NOT EXISTS idx_policy_group_status_effective_dates
	ON Policy (groupId, status, effectiveFrom, effectiveTo);

CREATE INDEX IF NOT EXISTS idx_policy_group_preset_status
	ON Policy (groupId, policyPresetKey, status);

CREATE INDEX IF NOT EXISTS idx_policy_assignment_resolution_range
	ON PolicyAssignment (
		scope,
		scopeId,
		category,
		isActive,
		effectiveFrom,
		effectiveTo
	);

CREATE INDEX IF NOT EXISTS idx_policy_assignment_group_active
	ON PolicyAssignment (policyGroupId, isActive);

CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_rule_policy_key_unique
	ON PolicyRule (policyId, ruleKey);

CREATE INDEX IF NOT EXISTS idx_policy_exception_context_priority
	ON PolicyExceptionRule (scope, scopeId, isActive, priority);

CREATE INDEX IF NOT EXISTS idx_policy_exception_category_active
	ON PolicyExceptionRule (category, isActive);

DROP TRIGGER IF EXISTS policy_group_category_validate_insert;
CREATE TRIGGER policy_group_category_validate_insert
BEFORE INSERT ON PolicyGroup
FOR EACH ROW
WHEN NEW.category NOT IN ('Cancellation', 'Payment', 'CheckIn', 'NoShow')
BEGIN
	SELECT RAISE(ABORT, 'POLICY_GROUP_INVALID_CATEGORY');
END;

DROP TRIGGER IF EXISTS policy_group_category_validate_update;
CREATE TRIGGER policy_group_category_validate_update
BEFORE UPDATE OF category ON PolicyGroup
FOR EACH ROW
WHEN NEW.category NOT IN ('Cancellation', 'Payment', 'CheckIn', 'NoShow')
BEGIN
	SELECT RAISE(ABORT, 'POLICY_GROUP_INVALID_CATEGORY');
END;

DROP TRIGGER IF EXISTS policy_assignment_scope_validate_insert;
CREATE TRIGGER policy_assignment_scope_validate_insert
BEFORE INSERT ON PolicyAssignment
FOR EACH ROW
WHEN NEW.scope NOT IN ('product', 'variant', 'rate_plan')
BEGIN
	SELECT RAISE(ABORT, 'POLICY_ASSIGNMENT_INVALID_SCOPE');
END;

DROP TRIGGER IF EXISTS policy_assignment_scope_validate_update;
CREATE TRIGGER policy_assignment_scope_validate_update
BEFORE UPDATE OF scope ON PolicyAssignment
FOR EACH ROW
WHEN NEW.scope NOT IN ('product', 'variant', 'rate_plan')
BEGIN
	SELECT RAISE(ABORT, 'POLICY_ASSIGNMENT_INVALID_SCOPE');
END;

DROP TRIGGER IF EXISTS policy_assignment_category_validate_insert;
CREATE TRIGGER policy_assignment_category_validate_insert
BEFORE INSERT ON PolicyAssignment
FOR EACH ROW
WHEN NEW.category NOT IN ('Cancellation', 'Payment', 'CheckIn', 'NoShow')
BEGIN
	SELECT RAISE(ABORT, 'POLICY_ASSIGNMENT_INVALID_CATEGORY');
END;

DROP TRIGGER IF EXISTS policy_assignment_category_validate_update;
CREATE TRIGGER policy_assignment_category_validate_update
BEFORE UPDATE OF category ON PolicyAssignment
FOR EACH ROW
WHEN NEW.category NOT IN ('Cancellation', 'Payment', 'CheckIn', 'NoShow')
BEGIN
	SELECT RAISE(ABORT, 'POLICY_ASSIGNMENT_INVALID_CATEGORY');
END;

DROP TRIGGER IF EXISTS policy_version_validate_insert;
CREATE TRIGGER policy_version_validate_insert
BEFORE INSERT ON Policy
FOR EACH ROW
WHEN NEW.version IS NULL OR NEW.version < 1
BEGIN
	SELECT RAISE(ABORT, 'POLICY_INVALID_VERSION');
END;

DROP TRIGGER IF EXISTS policy_version_validate_update;
CREATE TRIGGER policy_version_validate_update
BEFORE UPDATE OF version ON Policy
FOR EACH ROW
WHEN NEW.version IS NULL OR NEW.version < 1
BEGIN
	SELECT RAISE(ABORT, 'POLICY_INVALID_VERSION');
END;

DROP TRIGGER IF EXISTS policy_rule_key_validate_insert;
CREATE TRIGGER policy_rule_key_validate_insert
BEFORE INSERT ON PolicyRule
FOR EACH ROW
WHEN NEW.ruleKey IS NULL OR trim(NEW.ruleKey) = ''
BEGIN
	SELECT RAISE(ABORT, 'POLICY_RULE_KEY_REQUIRED');
END;

DROP TRIGGER IF EXISTS policy_rule_key_validate_update;
CREATE TRIGGER policy_rule_key_validate_update
BEFORE UPDATE OF ruleKey ON PolicyRule
FOR EACH ROW
WHEN NEW.ruleKey IS NULL OR trim(NEW.ruleKey) = ''
BEGIN
	SELECT RAISE(ABORT, 'POLICY_RULE_KEY_REQUIRED');
END;

DROP TRIGGER IF EXISTS cancellation_tier_validate_insert;
CREATE TRIGGER cancellation_tier_validate_insert
BEFORE INSERT ON CancellationTier
FOR EACH ROW
WHEN NEW.daysBeforeArrival IS NULL
	OR NEW.daysBeforeArrival < 0
	OR NEW.penaltyType NOT IN ('percentage', 'fixed', 'nights', 'none')
	OR (
		NEW.penaltyType <> 'none'
		AND NEW.penaltyAmount IS NOT NULL
		AND NEW.penaltyAmount < 0
	)
BEGIN
	SELECT RAISE(ABORT, 'CANCELLATION_TIER_INVALID');
END;

DROP TRIGGER IF EXISTS cancellation_tier_validate_update;
CREATE TRIGGER cancellation_tier_validate_update
BEFORE UPDATE OF daysBeforeArrival, penaltyType, penaltyAmount ON CancellationTier
FOR EACH ROW
WHEN NEW.daysBeforeArrival IS NULL
	OR NEW.daysBeforeArrival < 0
	OR NEW.penaltyType NOT IN ('percentage', 'fixed', 'nights', 'none')
	OR (
		NEW.penaltyType <> 'none'
		AND NEW.penaltyAmount IS NOT NULL
		AND NEW.penaltyAmount < 0
	)
BEGIN
	SELECT RAISE(ABORT, 'CANCELLATION_TIER_INVALID');
END;

DROP TRIGGER IF EXISTS policy_exception_scope_validate_insert;
CREATE TRIGGER policy_exception_scope_validate_insert
BEFORE INSERT ON PolicyExceptionRule
FOR EACH ROW
WHEN NEW.scope NOT IN ('global', 'product', 'variant', 'rate_plan')
	OR (NEW.scope = 'global' AND NEW.scopeId IS NOT NULL)
	OR (NEW.scope <> 'global' AND (NEW.scopeId IS NULL OR trim(NEW.scopeId) = ''))
BEGIN
	SELECT RAISE(ABORT, 'POLICY_EXCEPTION_INVALID_SCOPE');
END;

DROP TRIGGER IF EXISTS policy_exception_scope_validate_update;
CREATE TRIGGER policy_exception_scope_validate_update
BEFORE UPDATE OF scope, scopeId ON PolicyExceptionRule
FOR EACH ROW
WHEN NEW.scope NOT IN ('global', 'product', 'variant', 'rate_plan')
	OR (NEW.scope = 'global' AND NEW.scopeId IS NOT NULL)
	OR (NEW.scope <> 'global' AND (NEW.scopeId IS NULL OR trim(NEW.scopeId) = ''))
BEGIN
	SELECT RAISE(ABORT, 'POLICY_EXCEPTION_INVALID_SCOPE');
END;

DROP TRIGGER IF EXISTS policy_exception_category_validate_insert;
CREATE TRIGGER policy_exception_category_validate_insert
BEFORE INSERT ON PolicyExceptionRule
FOR EACH ROW
WHEN NEW.category IS NOT NULL
	AND NEW.category NOT IN ('Cancellation', 'Payment', 'CheckIn', 'NoShow')
BEGIN
	SELECT RAISE(ABORT, 'POLICY_EXCEPTION_INVALID_CATEGORY');
END;

DROP TRIGGER IF EXISTS policy_exception_category_validate_update;
CREATE TRIGGER policy_exception_category_validate_update
BEFORE UPDATE OF category ON PolicyExceptionRule
FOR EACH ROW
WHEN NEW.category IS NOT NULL
	AND NEW.category NOT IN ('Cancellation', 'Payment', 'CheckIn', 'NoShow')
BEGIN
	SELECT RAISE(ABORT, 'POLICY_EXCEPTION_INVALID_CATEGORY');
END;

DROP TRIGGER IF EXISTS policy_exception_effective_dates_insert;
CREATE TRIGGER policy_exception_effective_dates_insert
BEFORE INSERT ON PolicyExceptionRule
FOR EACH ROW
WHEN
	(NEW.effectiveFrom IS NULL AND NEW.effectiveTo IS NOT NULL)
	OR (NEW.effectiveFrom IS NOT NULL AND NEW.effectiveTo IS NULL)
	OR (
		NEW.effectiveFrom IS NOT NULL
		AND (
			length(NEW.effectiveFrom) <> 10
			OR date(NEW.effectiveFrom) IS NULL
			OR date(NEW.effectiveFrom) <> NEW.effectiveFrom
		)
	)
	OR (
		NEW.effectiveTo IS NOT NULL
		AND (
			length(NEW.effectiveTo) <> 10
			OR date(NEW.effectiveTo) IS NULL
			OR date(NEW.effectiveTo) <> NEW.effectiveTo
		)
	)
	OR (
		NEW.effectiveFrom IS NOT NULL
		AND NEW.effectiveTo IS NOT NULL
		AND NEW.effectiveFrom > NEW.effectiveTo
	)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_EXCEPTION_INVALID_EFFECTIVE_RANGE');
END;

DROP TRIGGER IF EXISTS policy_exception_effective_dates_update;
CREATE TRIGGER policy_exception_effective_dates_update
BEFORE UPDATE OF effectiveFrom, effectiveTo ON PolicyExceptionRule
FOR EACH ROW
WHEN
	(NEW.effectiveFrom IS NULL AND NEW.effectiveTo IS NOT NULL)
	OR (NEW.effectiveFrom IS NOT NULL AND NEW.effectiveTo IS NULL)
	OR (
		NEW.effectiveFrom IS NOT NULL
		AND (
			length(NEW.effectiveFrom) <> 10
			OR date(NEW.effectiveFrom) IS NULL
			OR date(NEW.effectiveFrom) <> NEW.effectiveFrom
		)
	)
	OR (
		NEW.effectiveTo IS NOT NULL
		AND (
			length(NEW.effectiveTo) <> 10
			OR date(NEW.effectiveTo) IS NULL
			OR date(NEW.effectiveTo) <> NEW.effectiveTo
		)
	)
	OR (
		NEW.effectiveFrom IS NOT NULL
		AND NEW.effectiveTo IS NOT NULL
		AND NEW.effectiveFrom > NEW.effectiveTo
	)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_EXCEPTION_INVALID_EFFECTIVE_RANGE');
END;
