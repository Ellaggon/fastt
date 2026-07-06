-- Persistent integrity for base and date-specific policy assignments.
-- Ranges are inclusive and belong to one contractual slot:
-- scope + scopeId + category + channel.

-- Retire malformed legacy rows before enabling strict write guards.
UPDATE PolicyAssignment
SET isActive = 0
WHERE isActive = 1
	AND (
		(effectiveFrom IS NULL AND effectiveTo IS NOT NULL)
		OR (effectiveFrom IS NOT NULL AND effectiveTo IS NULL)
		OR (
			effectiveFrom IS NOT NULL
			AND effectiveTo IS NOT NULL
			AND effectiveFrom > effectiveTo
		)
	);

-- Keep the newest active base assignment if legacy data contains duplicates.
WITH ranked_base AS (
	SELECT
		id,
		ROW_NUMBER() OVER (
			PARTITION BY scope, scopeId, category, COALESCE(channel, '__default__')
			ORDER BY COALESCE(createdAt, 0) DESC, id DESC
		) AS position
	FROM PolicyAssignment
	WHERE isActive = 1
		AND effectiveFrom IS NULL
		AND effectiveTo IS NULL
)
UPDATE PolicyAssignment
SET isActive = 0
WHERE id IN (
	SELECT id
	FROM ranked_base
	WHERE position > 1
);

-- Retire older overlapping exceptions left by pre-guard writes.
UPDATE PolicyAssignment AS current_assignment
SET isActive = 0
WHERE current_assignment.isActive = 1
	AND current_assignment.effectiveFrom IS NOT NULL
	AND current_assignment.effectiveTo IS NOT NULL
	AND EXISTS (
		SELECT 1
		FROM PolicyAssignment AS newer_assignment
		WHERE newer_assignment.id <> current_assignment.id
			AND newer_assignment.isActive = 1
			AND newer_assignment.scope = current_assignment.scope
			AND newer_assignment.scopeId = current_assignment.scopeId
			AND newer_assignment.category = current_assignment.category
			AND COALESCE(newer_assignment.channel, '__default__')
				= COALESCE(current_assignment.channel, '__default__')
			AND newer_assignment.effectiveFrom IS NOT NULL
			AND newer_assignment.effectiveTo IS NOT NULL
			AND newer_assignment.effectiveFrom <= current_assignment.effectiveTo
			AND newer_assignment.effectiveTo >= current_assignment.effectiveFrom
			AND (
				COALESCE(newer_assignment.createdAt, 0)
					> COALESCE(current_assignment.createdAt, 0)
				OR (
					COALESCE(newer_assignment.createdAt, 0)
						= COALESCE(current_assignment.createdAt, 0)
					AND newer_assignment.id > current_assignment.id
				)
			)
	);

CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_assignment_one_active_base
	ON PolicyAssignment (scope, scopeId, category, COALESCE(channel, '__default__'))
	WHERE isActive = 1
		AND effectiveFrom IS NULL
		AND effectiveTo IS NULL;

DROP TRIGGER IF EXISTS policy_assignment_validate_range_insert;
CREATE TRIGGER policy_assignment_validate_range_insert
BEFORE INSERT ON PolicyAssignment
FOR EACH ROW
WHEN
	(NEW.effectiveFrom IS NULL AND NEW.effectiveTo IS NOT NULL)
	OR (NEW.effectiveFrom IS NOT NULL AND NEW.effectiveTo IS NULL)
	OR (
		NEW.effectiveFrom IS NOT NULL
		AND NEW.effectiveTo IS NOT NULL
		AND NEW.effectiveFrom > NEW.effectiveTo
	)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_ASSIGNMENT_INVALID_EFFECTIVE_RANGE');
END;

DROP TRIGGER IF EXISTS policy_assignment_validate_range_update;
CREATE TRIGGER policy_assignment_validate_range_update
BEFORE UPDATE OF effectiveFrom, effectiveTo ON PolicyAssignment
FOR EACH ROW
WHEN
	(NEW.effectiveFrom IS NULL AND NEW.effectiveTo IS NOT NULL)
	OR (NEW.effectiveFrom IS NOT NULL AND NEW.effectiveTo IS NULL)
	OR (
		NEW.effectiveFrom IS NOT NULL
		AND NEW.effectiveTo IS NOT NULL
		AND NEW.effectiveFrom > NEW.effectiveTo
	)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_ASSIGNMENT_INVALID_EFFECTIVE_RANGE');
END;

DROP TRIGGER IF EXISTS policy_assignment_prevent_overlap_insert;
CREATE TRIGGER policy_assignment_prevent_overlap_insert
BEFORE INSERT ON PolicyAssignment
FOR EACH ROW
WHEN NEW.isActive = 1
	AND NEW.effectiveFrom IS NOT NULL
	AND NEW.effectiveTo IS NOT NULL
	AND EXISTS (
		SELECT 1
		FROM PolicyAssignment AS existing
		WHERE existing.isActive = 1
			AND existing.scope = NEW.scope
			AND existing.scopeId = NEW.scopeId
			AND existing.category = NEW.category
			AND COALESCE(existing.channel, '__default__')
				= COALESCE(NEW.channel, '__default__')
			AND existing.effectiveFrom IS NOT NULL
			AND existing.effectiveTo IS NOT NULL
			AND existing.effectiveFrom <= NEW.effectiveTo
			AND existing.effectiveTo >= NEW.effectiveFrom
	)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_ASSIGNMENT_ACTIVE_RANGE_OVERLAP');
END;

DROP TRIGGER IF EXISTS policy_assignment_prevent_overlap_update;
CREATE TRIGGER policy_assignment_prevent_overlap_update
BEFORE UPDATE OF scope, scopeId, category, channel, effectiveFrom, effectiveTo, isActive
	ON PolicyAssignment
FOR EACH ROW
WHEN NEW.isActive = 1
	AND NEW.effectiveFrom IS NOT NULL
	AND NEW.effectiveTo IS NOT NULL
	AND EXISTS (
		SELECT 1
		FROM PolicyAssignment AS existing
		WHERE existing.id <> NEW.id
			AND existing.isActive = 1
			AND existing.scope = NEW.scope
			AND existing.scopeId = NEW.scopeId
			AND existing.category = NEW.category
			AND COALESCE(existing.channel, '__default__')
				= COALESCE(NEW.channel, '__default__')
			AND existing.effectiveFrom IS NOT NULL
			AND existing.effectiveTo IS NOT NULL
			AND existing.effectiveFrom <= NEW.effectiveTo
			AND existing.effectiveTo >= NEW.effectiveFrom
	)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_ASSIGNMENT_ACTIVE_RANGE_OVERLAP');
END;
