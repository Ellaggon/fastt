-- Workspace presentation belongs to a ProviderUser membership. These columns
-- were superseded by ProviderUser.workspaceExperience in 2026-08-17 and must
-- not be reused as provider-wide configuration.
ALTER TABLE "ProviderProfile"
	DROP COLUMN IF EXISTS "professionalToolsUpdatedBy";

ALTER TABLE "ProviderProfile"
	DROP COLUMN IF EXISTS "professionalToolsUpdatedAt";

ALTER TABLE "ProviderProfile"
	DROP COLUMN IF EXISTS "professionalToolsEnabled";
