-- Canonical policy contract:
-- Policy owns preset/metadata, CancellationTier owns cancellation brackets,
-- and PolicyRule stores only category-specific parameters not represented elsewhere.

DELETE FROM PolicyRule
WHERE ruleKey IN (
	'cancellationPreset',
	'stayLengthType',
	'freeCancellationUntilDaysBeforeArrival',
	'gracePeriodHoursAfterBooking',
	'refundBasis',
	'hostPayoutBasis',
	'refundTiers'
);

-- Materialize the canonical non-duplicated cancellation parameters for existing presets.
INSERT INTO PolicyRule (id, policyId, ruleKey, ruleValue)
SELECT lower(hex(randomblob(16))), p.id, 'stayLengthThresholdNights', 28
FROM Policy p
JOIN PolicyGroup pg ON pg.id = p.groupId
WHERE p.status = 'active'
	AND pg.category = 'Cancellation'
	AND p.policyPresetKey IN (
		'flexible', 'moderate', 'limited', 'firm', 'strict', 'long_term', 'non_refundable'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM PolicyRule pr
		WHERE pr.policyId = p.id
			AND pr.ruleKey = 'stayLengthThresholdNights'
	);

INSERT INTO PolicyRule (id, policyId, ruleKey, ruleValue)
SELECT lower(hex(randomblob(16))), p.id, 'maxStayNights', 27
FROM Policy p
JOIN PolicyGroup pg ON pg.id = p.groupId
WHERE p.status = 'active'
	AND pg.category = 'Cancellation'
	AND p.policyPresetKey IN ('flexible', 'moderate', 'limited', 'firm', 'strict')
	AND NOT EXISTS (
		SELECT 1
		FROM PolicyRule pr
		WHERE pr.policyId = p.id
			AND pr.ruleKey = 'maxStayNights'
	);

INSERT INTO PolicyRule (id, policyId, ruleKey, ruleValue)
SELECT lower(hex(randomblob(16))), p.id, 'minStayNights', 28
FROM Policy p
JOIN PolicyGroup pg ON pg.id = p.groupId
WHERE p.status = 'active'
	AND pg.category = 'Cancellation'
	AND p.policyPresetKey = 'long_term'
	AND NOT EXISTS (
		SELECT 1
		FROM PolicyRule pr
		WHERE pr.policyId = p.id
			AND pr.ruleKey = 'minStayNights'
	);

INSERT INTO PolicyRule (id, policyId, ruleKey, ruleValue)
SELECT lower(hex(randomblob(16))), p.id, 'gracePeriodRequiresDaysBeforeArrival', 2
FROM Policy p
JOIN PolicyGroup pg ON pg.id = p.groupId
WHERE p.status = 'active'
	AND pg.category = 'Cancellation'
	AND p.policyPresetKey IN ('flexible', 'moderate', 'limited', 'firm', 'strict', 'long_term')
	AND NOT EXISTS (
		SELECT 1
		FROM PolicyRule pr
		WHERE pr.policyId = p.id
			AND pr.ruleKey = 'gracePeriodRequiresDaysBeforeArrival'
	);

INSERT INTO PolicyRule (id, policyId, ruleKey, ruleValue)
SELECT
	lower(hex(randomblob(16))),
	p.id,
	'taxesFeesBasis',
	CASE
		WHEN p.policyPresetKey = 'non_refundable' THEN json_quote('non_refundable')
		ELSE json_quote('pro_rated')
	END
FROM Policy p
JOIN PolicyGroup pg ON pg.id = p.groupId
WHERE p.status = 'active'
	AND pg.category = 'Cancellation'
	AND p.policyPresetKey IN (
		'flexible', 'moderate', 'limited', 'firm', 'strict', 'long_term', 'non_refundable'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM PolicyRule pr
		WHERE pr.policyId = p.id
			AND pr.ruleKey = 'taxesFeesBasis'
	);

INSERT INTO PolicyRule (id, policyId, ruleKey, ruleValue)
SELECT
	lower(hex(randomblob(16))),
	p.id,
	'taxRefundProration',
	CASE
		WHEN p.policyPresetKey = 'non_refundable' THEN json_quote('none')
		ELSE json_quote('same_as_room_refund')
	END
FROM Policy p
JOIN PolicyGroup pg ON pg.id = p.groupId
WHERE p.status = 'active'
	AND pg.category = 'Cancellation'
	AND p.policyPresetKey IN (
		'flexible', 'moderate', 'limited', 'firm', 'strict', 'long_term', 'non_refundable'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM PolicyRule pr
		WHERE pr.policyId = p.id
			AND pr.ruleKey = 'taxRefundProration'
	);

-- Keep one tier per policy and threshold before enforcing persistent uniqueness.
DELETE FROM CancellationTier
WHERE id NOT IN (
	SELECT MIN(id)
	FROM CancellationTier
	GROUP BY policyId, daysBeforeArrival
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cancellation_tier_policy_day
	ON CancellationTier (policyId, daysBeforeArrival);

DROP TRIGGER IF EXISTS policy_rule_reject_duplicate_contract_source_insert;
CREATE TRIGGER policy_rule_reject_duplicate_contract_source_insert
BEFORE INSERT ON PolicyRule
FOR EACH ROW
WHEN NEW.ruleKey IN (
	'cancellationPreset',
	'stayLengthType',
	'freeCancellationUntilDaysBeforeArrival',
	'gracePeriodHoursAfterBooking',
	'refundBasis',
	'hostPayoutBasis',
	'refundTiers'
)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_RULE_DUPLICATES_CANONICAL_CONTRACT_SOURCE');
END;

DROP TRIGGER IF EXISTS policy_rule_reject_duplicate_contract_source_update;
CREATE TRIGGER policy_rule_reject_duplicate_contract_source_update
BEFORE UPDATE OF ruleKey, ruleValue ON PolicyRule
FOR EACH ROW
WHEN NEW.ruleKey IN (
	'cancellationPreset',
	'stayLengthType',
	'freeCancellationUntilDaysBeforeArrival',
	'gracePeriodHoursAfterBooking',
	'refundBasis',
	'hostPayoutBasis',
	'refundTiers'
)
BEGIN
	SELECT RAISE(ABORT, 'POLICY_RULE_DUPLICATES_CANONICAL_CONTRACT_SOURCE');
END;

-- Rank preset groups by active usage. The group already serving assignments wins.
DROP TABLE IF EXISTS _PolicyPresetDuplicateMap;
CREATE TEMP TABLE _PolicyPresetDuplicateMap AS
WITH latest_active_policy AS (
	SELECT
		pg.id AS groupId,
		pg.ownerProviderId,
		pg.category,
		p.id AS policyId,
		p.policyPresetKey,
		ROW_NUMBER() OVER (
			PARTITION BY pg.id
			ORDER BY p.version DESC, p.id DESC
		) AS versionRank
	FROM PolicyGroup pg
	JOIN Policy p ON p.groupId = pg.id
	WHERE p.status = 'active'
		AND p.policyPresetKey IS NOT NULL
),
ranked_groups AS (
	SELECT
		groupId,
		ownerProviderId,
		category,
		policyId,
		policyPresetKey,
		ROW_NUMBER() OVER (
			PARTITION BY ownerProviderId, category, policyPresetKey
			ORDER BY
				(
					SELECT COUNT(*)
					FROM PolicyAssignment pa
					WHERE pa.policyGroupId = latest_active_policy.groupId
						AND pa.isActive = 1
				) DESC,
				groupId
		) AS canonicalRank
	FROM latest_active_policy
	WHERE versionRank = 1
)
SELECT
	duplicate.groupId AS duplicateGroupId,
	canonical.groupId AS canonicalGroupId,
	duplicate.policyId AS duplicatePolicyId,
	canonical.policyId AS canonicalPolicyId
FROM ranked_groups duplicate
JOIN ranked_groups canonical
	ON canonical.ownerProviderId = duplicate.ownerProviderId
	AND canonical.category = duplicate.category
	AND canonical.policyPresetKey = duplicate.policyPresetKey
	AND canonical.canonicalRank = 1
WHERE duplicate.canonicalRank > 1;

UPDATE PolicyAssignment
SET policyGroupId = (
	SELECT canonicalGroupId
	FROM _PolicyPresetDuplicateMap map
	WHERE map.duplicateGroupId = PolicyAssignment.policyGroupId
)
WHERE policyGroupId IN (
	SELECT duplicateGroupId
	FROM _PolicyPresetDuplicateMap
);

UPDATE PolicyAuditLog
SET policyGroupId = (
	SELECT canonicalGroupId
	FROM _PolicyPresetDuplicateMap map
	WHERE map.duplicateGroupId = PolicyAuditLog.policyGroupId
)
WHERE policyGroupId IN (
	SELECT duplicateGroupId
	FROM _PolicyPresetDuplicateMap
);

UPDATE PolicyAuditLog
SET policyId = (
	SELECT canonicalPolicyId
	FROM _PolicyPresetDuplicateMap map
	WHERE map.duplicatePolicyId = PolicyAuditLog.policyId
)
WHERE policyId IN (
	SELECT duplicatePolicyId
	FROM _PolicyPresetDuplicateMap
);

UPDATE BookingPolicySnapshot
SET policyId = (
	SELECT canonicalPolicyId
	FROM _PolicyPresetDuplicateMap map
	WHERE map.duplicatePolicyId = BookingPolicySnapshot.policyId
)
WHERE policyId IN (
	SELECT duplicatePolicyId
	FROM _PolicyPresetDuplicateMap
);

UPDATE PolicyExceptionRule
SET scopeId = (
	SELECT canonicalPolicyId
	FROM _PolicyPresetDuplicateMap map
	WHERE map.duplicatePolicyId = PolicyExceptionRule.scopeId
)
WHERE scope = 'policy'
	AND scopeId IN (
		SELECT duplicatePolicyId
		FROM _PolicyPresetDuplicateMap
	);

UPDATE PolicyExceptionRule
SET scopeId = (
	SELECT canonicalGroupId
	FROM _PolicyPresetDuplicateMap map
	WHERE map.duplicateGroupId = PolicyExceptionRule.scopeId
)
WHERE scope = 'policy_group'
	AND scopeId IN (
		SELECT duplicateGroupId
		FROM _PolicyPresetDuplicateMap
	);

INSERT INTO PolicyAuditLog (
	id,
	eventType,
	policyId,
	policyGroupId,
	beforeJson,
	afterJson,
	createdAt
)
SELECT
	lower(hex(randomblob(16))),
	'preset_group_deduplicated',
	canonicalPolicyId,
	canonicalGroupId,
	json_object(
		'duplicatePolicyId', duplicatePolicyId,
		'duplicateGroupId', duplicateGroupId
	),
	json_object(
		'canonicalPolicyId', canonicalPolicyId,
		'canonicalGroupId', canonicalGroupId
	),
	unixepoch() * 1000
FROM _PolicyPresetDuplicateMap;

DELETE FROM CancellationTier
WHERE policyId IN (
	SELECT p.id
	FROM Policy p
	WHERE p.groupId IN (
		SELECT duplicateGroupId
		FROM _PolicyPresetDuplicateMap
	)
);

DELETE FROM PolicyRule
WHERE policyId IN (
	SELECT p.id
	FROM Policy p
	WHERE p.groupId IN (
		SELECT duplicateGroupId
		FROM _PolicyPresetDuplicateMap
	)
);

DELETE FROM Policy
WHERE groupId IN (
	SELECT duplicateGroupId
	FROM _PolicyPresetDuplicateMap
);

DELETE FROM PolicyGroup
WHERE id IN (
	SELECT duplicateGroupId
	FROM _PolicyPresetDuplicateMap
);

DROP TABLE _PolicyPresetDuplicateMap;
