-- Additional theme edits use the classification revision.
CREATE OR REPLACE FUNCTION fastt_guard_activity_selection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE activity "ProductCategory";
BEGIN
 IF TG_OP = 'INSERT' AND NEW."activityContractVersion" <> 1 THEN RAISE EXCEPTION 'activity_legacy_insert_forbidden'; END IF;
 IF TG_OP = 'UPDATE' AND NEW."activityContractVersion" < OLD."activityContractVersion" THEN RAISE EXCEPTION 'activity_contract_downgrade_forbidden'; END IF;
 IF NEW."primaryActivityCategoryId" IS NOT NULL THEN
  SELECT * INTO activity FROM "ProductCategory" WHERE id = NEW."primaryActivityCategoryId" FOR SHARE;
  IF activity.id IS NULL OR activity."classificationKind" <> 'activity' OR activity.vertical <> 'tour' OR activity."dataClass" <> 'production' THEN RAISE EXCEPTION 'primary_activity_invalid'; END IF;
  IF NOT activity."isActive" AND (TG_OP = 'INSERT' OR NEW."primaryActivityCategoryId" IS DISTINCT FROM OLD."primaryActivityCategoryId") THEN RAISE EXCEPTION 'primary_activity_inactive'; END IF;
 END IF;
 IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1 THEN
  NEW."classificationRevision" := OLD."classificationRevision" + 1;
 ELSIF TG_OP = 'UPDATE' THEN
  NEW."classificationRevision" := OLD."classificationRevision" + CASE WHEN (NEW."primaryActivityCategoryId",NEW."experienceFormat",NEW."activityContractVersion") IS DISTINCT FROM (OLD."primaryActivityCategoryId",OLD."experienceFormat",OLD."activityContractVersion") THEN 1 ELSE 0 END;
 ELSE NEW."classificationRevision" := 0;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER "trg_Tour_activity_selection" BEFORE INSERT OR UPDATE ON "Tour" FOR EACH ROW EXECUTE FUNCTION fastt_guard_activity_selection();

-- Theme changes participate in the same revision as format and primary activity.
CREATE OR REPLACE FUNCTION fastt_revise_experience_themes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND (NEW."assignmentKind", NEW."categoryId", NEW."productId") IS NOT DISTINCT FROM (OLD."assignmentKind", OLD."categoryId", OLD."productId") THEN RETURN NEW; END IF;
 IF TG_OP <> 'INSERT' AND OLD."assignmentKind" = 'additional_theme' THEN
  UPDATE "Tour" SET "classificationRevision" = "classificationRevision" + 1 WHERE "productId" = OLD."productId";
 END IF;
 IF TG_OP <> 'DELETE' AND NEW."assignmentKind" = 'additional_theme' AND (TG_OP <> 'UPDATE' OR OLD."assignmentKind" <> 'additional_theme' OR OLD."productId" <> NEW."productId") THEN
  UPDATE "Tour" SET "classificationRevision" = "classificationRevision" + 1 WHERE "productId" = NEW."productId";
 END IF;
 RETURN COALESCE(NEW, OLD);
END $$;
CREATE OR REPLACE TRIGGER "trg_ProductCategoryLink_theme_revision" AFTER INSERT OR UPDATE OR DELETE ON "ProductCategoryLink" FOR EACH ROW EXECUTE FUNCTION fastt_revise_experience_themes();
