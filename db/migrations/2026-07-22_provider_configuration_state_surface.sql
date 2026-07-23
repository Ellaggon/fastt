ALTER TABLE "ProviderConfigurationState"
	ADD COLUMN IF NOT EXISTS "readinessJson" jsonb,
	ADD COLUMN IF NOT EXISTS "countsJson" jsonb;

CREATE OR REPLACE FUNCTION fastt_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW."updatedAt" = now();
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProviderConfigurationState_touch_updatedAt" ON "ProviderConfigurationState";
CREATE TRIGGER "trg_ProviderConfigurationState_touch_updatedAt"
BEFORE UPDATE ON "ProviderConfigurationState"
FOR EACH ROW
EXECUTE FUNCTION fastt_touch_updated_at();
