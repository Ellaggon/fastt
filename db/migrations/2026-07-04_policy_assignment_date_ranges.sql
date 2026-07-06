-- Date-specific commercial policy assignments.
-- A base assignment has no dates. Dated assignments layer over it and the
-- newest applicable assignment wins for the guest's check-in date.

ALTER TABLE PolicyAssignment ADD COLUMN effectiveFrom TEXT;
ALTER TABLE PolicyAssignment ADD COLUMN effectiveTo TEXT;
ALTER TABLE PolicyAssignment ADD COLUMN createdAt INTEGER;

UPDATE PolicyAssignment
SET createdAt = unixepoch() * 1000
WHERE createdAt IS NULL;

DROP INDEX IF EXISTS idx_policy_assignment_one_active_scope_category_channel;

CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_assignment_one_active_base
	ON PolicyAssignment (scope, scopeId, category, COALESCE(channel, '__default__'))
	WHERE isActive = 1
		AND effectiveFrom IS NULL
		AND effectiveTo IS NULL;

CREATE INDEX IF NOT EXISTS idx_policy_assignment_effective_range
	ON PolicyAssignment (
		scope,
		scopeId,
		category,
		COALESCE(channel, '__default__'),
		isActive,
		effectiveFrom,
		effectiveTo,
		createdAt
	);
