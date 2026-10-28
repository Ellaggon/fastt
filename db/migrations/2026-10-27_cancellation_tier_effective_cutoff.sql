-- Hour-based tour tiers may share daysBeforeArrival. Keep one effective cutoff per policy.
CREATE UNIQUE INDEX IF NOT EXISTS "CancellationTier_policyId_leadHours_unique"
ON "CancellationTier" ("policyId", (coalesce("hoursBeforeDeparture", "daysBeforeArrival"::bigint * 24)));

DROP INDEX IF EXISTS "CancellationTier_policyId_daysBeforeArrival_unique";
