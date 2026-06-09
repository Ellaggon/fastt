-- Keep professional-tool disclosure as a provider profile preference.
ALTER TABLE "ProviderProfile"
	ADD COLUMN "professionalToolsEnabled" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ProviderProfile"
	ADD COLUMN "professionalToolsUpdatedAt" INTEGER;

ALTER TABLE "ProviderProfile"
	ADD COLUMN "professionalToolsUpdatedBy" TEXT;
