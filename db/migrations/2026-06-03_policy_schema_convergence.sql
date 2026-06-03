-- CAPA 6 final schema convergence for provider-owned policies and immutable booking snapshots.
PRAGMA foreign_keys = OFF;

-- 1) Backfill PolicyGroup.ownerProviderId from existing assignments.
UPDATE PolicyGroup
SET ownerProviderId = (
	SELECT p.providerId
	FROM PolicyAssignment pa
	JOIN Product p ON pa.scope = 'product' AND pa.scopeId = p.id
	WHERE pa.policyGroupId = PolicyGroup.id
		AND p.providerId IS NOT NULL
	ORDER BY pa.isActive DESC, pa.id ASC
	LIMIT 1
)
WHERE ownerProviderId IS NULL
	OR trim(ownerProviderId) = '';

UPDATE PolicyGroup
SET ownerProviderId = (
	SELECT p.providerId
	FROM PolicyAssignment pa
	JOIN Variant v ON pa.scope = 'variant' AND pa.scopeId = v.id
	JOIN Product p ON v.productId = p.id
	WHERE pa.policyGroupId = PolicyGroup.id
		AND p.providerId IS NOT NULL
	ORDER BY pa.isActive DESC, pa.id ASC
	LIMIT 1
)
WHERE ownerProviderId IS NULL
	OR trim(ownerProviderId) = '';

UPDATE PolicyGroup
SET ownerProviderId = (
	SELECT p.providerId
	FROM PolicyAssignment pa
	JOIN RatePlan rp ON pa.scope = 'rate_plan' AND pa.scopeId = rp.id
	JOIN Variant v ON rp.variantId = v.id
	JOIN Product p ON v.productId = p.id
	WHERE pa.policyGroupId = PolicyGroup.id
		AND p.providerId IS NOT NULL
	ORDER BY pa.isActive DESC, pa.id ASC
	LIMIT 1
)
WHERE ownerProviderId IS NULL
	OR trim(ownerProviderId) = '';

-- Remaining rows are historical/global or orphaned rows. Keep them explicit so NOT NULL can hold.
UPDATE PolicyGroup
SET ownerProviderId = 'legacy-unowned-provider'
WHERE ownerProviderId IS NULL
	OR trim(ownerProviderId) = '';

CREATE TABLE IF NOT EXISTS PolicyGroup_new (
	id TEXT PRIMARY KEY NOT NULL,
	category TEXT NOT NULL,
	ownerProviderId TEXT NOT NULL
);

INSERT INTO PolicyGroup_new (id, category, ownerProviderId)
SELECT id, category, ownerProviderId
FROM PolicyGroup;

DROP TABLE PolicyGroup;
ALTER TABLE PolicyGroup_new RENAME TO PolicyGroup;

-- 2) Denormalize category on assignments so the active uniqueness invariant can live in DB.
ALTER TABLE PolicyAssignment
	ADD COLUMN category TEXT;

UPDATE PolicyAssignment
SET category = (
	SELECT pg.category
	FROM PolicyGroup pg
	WHERE pg.id = PolicyAssignment.policyGroupId
	LIMIT 1
)
WHERE category IS NULL
	OR trim(category) = '';

UPDATE PolicyAssignment
SET category = 'Other'
WHERE category IS NULL
	OR trim(category) = '';

CREATE TABLE IF NOT EXISTS PolicyAssignment_new (
	id TEXT PRIMARY KEY NOT NULL,
	policyGroupId TEXT NOT NULL REFERENCES PolicyGroup(id),
	category TEXT NOT NULL,
	scope TEXT NOT NULL,
	scopeId TEXT NOT NULL,
	channel TEXT,
	isActive INTEGER NOT NULL DEFAULT 1
);

INSERT INTO PolicyAssignment_new (
	id,
	policyGroupId,
	category,
	scope,
	scopeId,
	channel,
	isActive
)
SELECT
	id,
	policyGroupId,
	category,
	scope,
	scopeId,
	channel,
	COALESCE(isActive, 1)
FROM PolicyAssignment;

DROP TABLE PolicyAssignment;
ALTER TABLE PolicyAssignment_new RENAME TO PolicyAssignment;

CREATE INDEX IF NOT EXISTS idx_policy_assignment_lookup
	ON PolicyAssignment (scope, scopeId, category, channel, isActive);

-- Keep one active assignment per contractual slot before enforcing the invariant.
UPDATE PolicyAssignment
SET isActive = 0
WHERE isActive = 1
	AND id NOT IN (
		SELECT MIN(id)
		FROM PolicyAssignment
		WHERE isActive = 1
		GROUP BY scope, scopeId, category, COALESCE(channel, '__default__')
	);

CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_assignment_one_active_scope_category_channel
	ON PolicyAssignment (scope, scopeId, category, COALESCE(channel, '__default__'))
	WHERE isActive = 1;

-- 3) Remove legacy booking snapshot columns after canonical policySnapshotJson convergence.
CREATE TABLE IF NOT EXISTS BookingPolicySnapshot_new (
	id TEXT PRIMARY KEY NOT NULL,
	bookingId TEXT NOT NULL,
	category TEXT NOT NULL,
	policyId TEXT,
	policySnapshotJson JSON NOT NULL,
	createdAt INTEGER
);

INSERT INTO BookingPolicySnapshot_new (
	id,
	bookingId,
	category,
	policyId,
	policySnapshotJson,
	createdAt
)
SELECT
	id,
	bookingId,
	COALESCE(category, policyType, 'policy') AS category,
	policyId,
	COALESCE(
		policySnapshotJson,
		json_object(
			'category', COALESCE(category, policyType, 'policy'),
			'policyId', policyId,
			'description', description,
			'cancellation', cancellationJson,
			'source', 'legacy_booking_policy_snapshot'
		)
	) AS policySnapshotJson,
	createdAt
FROM BookingPolicySnapshot;

DROP TABLE BookingPolicySnapshot;
ALTER TABLE BookingPolicySnapshot_new RENAME TO BookingPolicySnapshot;

CREATE INDEX IF NOT EXISTS idx_booking_policy_snapshot_booking
	ON BookingPolicySnapshot (bookingId);

PRAGMA foreign_keys = ON;
