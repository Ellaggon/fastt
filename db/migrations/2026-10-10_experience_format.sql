-- Additive classification. No names, evidence scopes, inventory or booking snapshots change.
ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "experienceFormat" text;
-- Only rows already present receive legacy contract 0. Future inserts require classification to publish.
ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "formatContractVersion" integer NOT NULL DEFAULT 0;
ALTER TABLE "Tour" ALTER COLUMN "formatContractVersion" SET DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE "Tour" ADD CONSTRAINT "Tour_experienceFormat_check"
    CHECK ("experienceFormat" IS NULL OR "experienceFormat" IN ('guided_tour', 'workshop', 'class', 'tasting'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Tour" ADD CONSTRAINT "Tour_formatContractVersion_check"
    CHECK ("formatContractVersion" IN (0, 1) AND ("formatContractVersion" = 1 OR "experienceFormat" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION fastt_guard_experience_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."formatContractVersion" <> 1 THEN
    RAISE EXCEPTION 'experience_legacy_contract_insert_forbidden';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."formatContractVersion" < OLD."formatContractVersion" THEN
    RAISE EXCEPTION 'experience_contract_downgrade_forbidden';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "trg_Tour_experience_contract" ON "Tour";
CREATE TRIGGER "trg_Tour_experience_contract" BEFORE INSERT OR UPDATE ON "Tour"
  FOR EACH ROW EXECUTE FUNCTION fastt_guard_experience_contract();

-- Format-specific policies are a new versioned contract, never an edit of a signed tuple.
CREATE OR REPLACE FUNCTION fastt_guard_experience_policy_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('published', 'retired') AND NEW."contextJson" IS DISTINCT FROM OLD."contextJson" THEN
    RAISE EXCEPTION 'approved_policy_context_immutable';
  END IF;
  IF NEW."contextJson" ? 'contextVersion' THEN
    IF (NEW."contextJson"->>'contextVersion') NOT IN ('1', '2') THEN
      RAISE EXCEPTION 'experience_policy_context_version_invalid';
    END IF;
  ELSIF NEW."contextJson" ? 'experienceFormats' THEN
    RAISE EXCEPTION 'experience_policy_context_version_required';
  END IF;
  IF NEW."contextJson"->>'contextVersion' = '2' THEN
    IF jsonb_typeof(NEW."contextJson"->'experienceFormats') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'experience_policy_formats_missing';
    END IF;
    IF jsonb_array_length(NEW."contextJson"->'experienceFormats') = 0 THEN
      RAISE EXCEPTION 'experience_policy_formats_missing';
    END IF;
    FOR entry IN SELECT * FROM jsonb_array_elements(NEW."contextJson"->'experienceFormats') LOOP
      IF entry NOT IN ('"guided_tour"'::jsonb, '"workshop"'::jsonb, '"class"'::jsonb, '"tasting"'::jsonb) THEN
        RAISE EXCEPTION 'experience_policy_format_invalid';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "trg_CompliancePolicyVersion_experience_context" ON "CompliancePolicyVersion";
CREATE TRIGGER "trg_CompliancePolicyVersion_experience_context" BEFORE INSERT OR UPDATE OF "contextJson", "status" ON "CompliancePolicyVersion"
  FOR EACH ROW EXECUTE FUNCTION fastt_guard_experience_policy_context();
