-- Early-stage cleanup: remove legacy contractual rate-plan fields and financial shadows.
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS RatePlanTemplate_new (
	id TEXT PRIMARY KEY NOT NULL,
	name TEXT NOT NULL,
	description TEXT,
	createdAt INTEGER
);

INSERT INTO RatePlanTemplate_new (id, name, description, createdAt)
SELECT id, name, description, createdAt
FROM RatePlanTemplate;

DROP TABLE RatePlanTemplate;
ALTER TABLE RatePlanTemplate_new RENAME TO RatePlanTemplate;

DROP TABLE IF EXISTS FinancialShadowRecord;

PRAGMA foreign_keys = ON;
