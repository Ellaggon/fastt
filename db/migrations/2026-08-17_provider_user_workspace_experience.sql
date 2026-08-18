-- Workspace presentation is personal to each provider membership, never a
-- provider-wide setting. Preserve the historical provider preference only as
-- the initial value for existing members during this migration.
ALTER TABLE "ProviderUser"
	ADD COLUMN "workspaceExperience" text NOT NULL DEFAULT 'essential';

ALTER TABLE "ProviderUser"
	ADD COLUMN "workspaceExperienceUpdatedAt" timestamp with time zone;

UPDATE "ProviderUser" AS membership
SET "workspaceExperience" = CASE
	WHEN COALESCE(profile."professionalToolsEnabled", false) THEN 'professional'
	ELSE 'essential'
END
FROM "ProviderProfile" AS profile
WHERE profile."providerId" = membership."providerId";

ALTER TABLE "ProviderUser"
	ADD CONSTRAINT "ProviderUser_workspaceExperience_check"
	CHECK ("workspaceExperience" IN ('essential', 'professional'));
