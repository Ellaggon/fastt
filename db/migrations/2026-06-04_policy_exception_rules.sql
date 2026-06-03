-- CAPA 6 platform/legal policy overrides resolved before final refund/payout calculation.
CREATE TABLE IF NOT EXISTS PolicyExceptionRule (
	id TEXT PRIMARY KEY NOT NULL,
	type TEXT NOT NULL CHECK (
		type IN (
			'major_disruptive_event',
			'rebooking_refund',
			'host_cancellation',
			'local_law',
			'support_manual_override'
		)
	),
	scope TEXT NOT NULL DEFAULT 'global',
	scopeId TEXT,
	category TEXT,
	priority INTEGER NOT NULL DEFAULT 100,
	isActive INTEGER NOT NULL DEFAULT 1,
	effectiveFrom TEXT,
	effectiveTo TEXT,
	reason TEXT,
	actionJson JSON NOT NULL,
	createdAt INTEGER DEFAULT (unixepoch() * 1000),
	createdBy TEXT
);

CREATE INDEX IF NOT EXISTS idx_policy_exception_rule_lookup
	ON PolicyExceptionRule (scope, scopeId, category, type, isActive);

CREATE INDEX IF NOT EXISTS idx_policy_exception_rule_effective
	ON PolicyExceptionRule (effectiveFrom, effectiveTo);
