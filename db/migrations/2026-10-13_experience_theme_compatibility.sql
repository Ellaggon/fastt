-- Expand first; deploy the compatible client before the separate enforcement migration.
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "allowedAdditionalThemeIds" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "themeCompatibilityRevision" integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION fastt_guard_theme_compatibility() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE family "ProductCategory";
BEGIN
 PERFORM pg_advisory_xact_lock(73421012);
 IF TG_OP = 'DELETE' THEN
  IF EXISTS (SELECT 1 FROM "ProductCategory" WHERE OLD.id = ANY("allowedAdditionalThemeIds")) THEN RAISE EXCEPTION 'theme_family_referenced'; END IF;
  RETURN OLD;
 END IF;
 IF NEW."themeCompatibilityRevision" < 0 OR array_position(NEW."allowedAdditionalThemeIds",NULL) IS NOT NULL OR cardinality(NEW."allowedAdditionalThemeIds") > 8 OR cardinality(NEW."allowedAdditionalThemeIds") <> (SELECT count(DISTINCT id) FROM unnest(NEW."allowedAdditionalThemeIds") id) THEN RAISE EXCEPTION 'theme_compatibility_invalid'; END IF;
 IF cardinality(NEW."allowedAdditionalThemeIds") > 0 AND NEW."classificationKind" <> 'activity' THEN RAISE EXCEPTION 'theme_compatibility_activity_required'; END IF;
 FOR family IN SELECT * FROM "ProductCategory" WHERE id = ANY(NEW."allowedAdditionalThemeIds") FOR SHARE LOOP
  IF family."classificationKind" <> 'family' OR family.vertical <> NEW.vertical OR family."dataClass" <> NEW."dataClass" OR family.id = NEW."parentCategoryId" THEN RAISE EXCEPTION 'theme_compatibility_family_invalid'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM "ProductCategory" WHERE id = ANY(NEW."allowedAdditionalThemeIds")) <> cardinality(NEW."allowedAdditionalThemeIds") THEN RAISE EXCEPTION 'theme_compatibility_missing_family'; END IF;
 IF TG_OP = 'UPDATE' THEN
  IF (NEW."classificationKind",NEW.vertical,NEW."dataClass") IS DISTINCT FROM (OLD."classificationKind",OLD.vertical,OLD."dataClass") AND EXISTS (SELECT 1 FROM "ProductCategory" WHERE OLD.id = ANY("allowedAdditionalThemeIds")) THEN RAISE EXCEPTION 'theme_family_structure_referenced'; END IF;
  NEW."themeCompatibilityRevision" := OLD."themeCompatibilityRevision" + CASE WHEN (NEW."allowedAdditionalThemeIds",NEW."isActive",NEW."parentCategoryId") IS DISTINCT FROM (OLD."allowedAdditionalThemeIds",OLD."isActive",OLD."parentCategoryId") THEN 1 ELSE 0 END;
 ELSE NEW."themeCompatibilityRevision" := 0; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER "trg_ProductCategory_theme_compatibility" BEFORE INSERT OR UPDATE OR DELETE ON "ProductCategory" FOR EACH ROW EXECUTE FUNCTION fastt_guard_theme_compatibility();
-- Narrow, descriptive relationships; selection remains explicit, never automatic.
UPDATE "ProductCategory" SET "allowedAdditionalThemeIds" = ARRAY['exp:family:arts'] WHERE id = 'exp:activity:museum-visit';
UPDATE "ProductCategory" SET "allowedAdditionalThemeIds" = ARRAY['exp:family:food'] WHERE id = 'exp:activity:farm-visit';
UPDATE "ProductCategory" SET "allowedAdditionalThemeIds" = ARRAY['exp:family:nature-rural'] WHERE id = 'exp:activity:photography';
