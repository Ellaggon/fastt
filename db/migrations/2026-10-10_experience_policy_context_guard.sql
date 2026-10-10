-- Tighten versioned contexts without changing any stored policy or approval.
CREATE OR REPLACE FUNCTION fastt_guard_experience_policy_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('published', 'retired') AND NEW."contextJson" IS DISTINCT FROM OLD."contextJson" THEN
    RAISE EXCEPTION 'approved_policy_context_immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('published', 'retired') AND NEW."status" NOT IN ('published', 'retired') THEN
    RAISE EXCEPTION 'approved_policy_status_downgrade_forbidden';
  END IF;
  IF NEW."contextJson" ? 'experienceFormats' AND (NEW."contextJson"->>'contextVersion') IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'experience_policy_context_version_required';
  END IF;
  IF NEW."contextJson" ? 'contextVersion' THEN
    IF (NEW."contextJson"->>'contextVersion') IS NULL OR (NEW."contextJson"->>'contextVersion') NOT IN ('1', '2') THEN
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
