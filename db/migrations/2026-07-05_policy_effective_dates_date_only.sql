-- Policy effective ranges represent local commercial dates, never UTC instants.
-- Keep TEXT storage for Astro DB/Turso and enforce canonical YYYY-MM-DD values.

DROP TRIGGER IF EXISTS policy_assignment_validate_range_insert;
DROP TRIGGER IF EXISTS policy_assignment_validate_range_update;
DROP TRIGGER IF EXISTS policy_assignment_prevent_overlap_insert;
DROP TRIGGER IF EXISTS policy_assignment_prevent_overlap_update;

-- Convert parseable legacy timestamps before enabling strict date-only guards.
UPDATE Policy
SET
	effectiveFrom = CASE
		WHEN effectiveFrom IS NOT NULL AND date(effectiveFrom) IS NOT NULL
			THEN date(effectiveFrom)
		ELSE effectiveFrom
	END,
	effectiveTo = CASE
		WHEN effectiveTo IS NOT NULL AND date(effectiveTo) IS NOT NULL
			THEN date(effectiveTo)
		ELSE effectiveTo
	END;

UPDATE PolicyAssignment
SET
	effectiveFrom = CASE
		WHEN effectiveFrom IS NOT NULL AND date(effectiveFrom) IS NOT NULL
			THEN date(effectiveFrom)
		ELSE effectiveFrom
	END,
	effectiveTo = CASE
		WHEN effectiveTo IS NOT NULL AND date(effectiveTo) IS NOT NULL
			THEN date(effectiveTo)
		ELSE effectiveTo
	END;

-- Invalid active policies must never participate in contractual resolution.
UPDATE Policy
SET
	status = 'archived',
	effectiveFrom = NULL,
	effectiveTo = NULL
WHERE
	(
		effectiveFrom IS NOT NULL
		AND (
			length(effectiveFrom) <> 10
			OR date(effectiveFrom) IS NULL
			OR date(effectiveFrom) <> effectiveFrom
		)
	)
	OR (
		effectiveTo IS NOT NULL
		AND (
			length(effectiveTo) <> 10
			OR date(effectiveTo) IS NULL
			OR date(effectiveTo) <> effectiveTo
		)
	)
	OR (
		effectiveFrom IS NOT NULL
		AND effectiveTo IS NOT NULL
		AND effectiveFrom > effectiveTo
	);

-- Malformed assignments are retired rather than broadened into base assignments.
UPDATE PolicyAssignment
SET isActive = 0
WHERE
	(effectiveFrom IS NULL AND effectiveTo IS NOT NULL)
	OR (effectiveFrom IS NOT NULL AND effectiveTo IS NULL)
	OR (
		effectiveFrom IS NOT NULL
		AND (
			length(effectiveFrom) <> 10
			OR date(effectiveFrom) IS NULL
			OR date(effectiveFrom) <> effectiveFrom
		)
	)
	OR (
		effectiveTo IS NOT NULL
		AND (
			length(effectiveTo) <> 10
			OR date(effectiveTo) IS NULL
			OR date(effectiveTo) <> effectiveTo
		)
	)
	OR (
		effectiveFrom IS NOT NULL
		AND effectiveTo IS NOT NULL
		AND effectiveFrom > effectiveTo
	);

-- Date normalization can expose same-day overlaps from legacy timestamps.
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

DROP TRIGGER IF EXISTS policy_validate_effective_dates_insert;
CREATE TRIGGER policy_validate_effective_dates_insert
BEFORE INSERT ON Policy
FOR EACH ROW
WHEN
	(
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
	SELECT RAISE(ABORT, 'POLICY_INVALID_EFFECTIVE_DATE_RANGE');
END;

DROP TRIGGER IF EXISTS policy_validate_effective_dates_update;
CREATE TRIGGER policy_validate_effective_dates_update
BEFORE UPDATE OF effectiveFrom, effectiveTo ON Policy
FOR EACH ROW
WHEN
	(
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
	SELECT RAISE(ABORT, 'POLICY_INVALID_EFFECTIVE_DATE_RANGE');
END;

CREATE TRIGGER policy_assignment_validate_range_insert
BEFORE INSERT ON PolicyAssignment
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
	SELECT RAISE(ABORT, 'POLICY_ASSIGNMENT_INVALID_EFFECTIVE_RANGE');
END;

CREATE TRIGGER policy_assignment_validate_range_update
BEFORE UPDATE OF effectiveFrom, effectiveTo ON PolicyAssignment
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
	SELECT RAISE(ABORT, 'POLICY_ASSIGNMENT_INVALID_EFFECTIVE_RANGE');
END;

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
