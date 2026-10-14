-- Apply only after the application serving compatibility-filtered forms is deployed.
CREATE OR REPLACE FUNCTION fastt_guard_additional_theme() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE activity "ProductCategory";
BEGIN
 IF TG_OP = 'UPDATE' AND (NEW."assignmentKind",NEW."categoryId",NEW."productId") IS NOT DISTINCT FROM (OLD."assignmentKind",OLD."categoryId",OLD."productId") THEN RETURN NEW; END IF;
 IF NEW."assignmentKind" = 'additional_theme' THEN
  SELECT a.* INTO activity FROM "Tour" t JOIN "ProductCategory" a ON a.id=t."primaryActivityCategoryId" WHERE t."productId"=NEW."productId" FOR SHARE OF a;
  IF activity.id IS NULL OR NOT activity."isActive" OR NEW."categoryId" = activity."parentCategoryId" OR NOT (NEW."categoryId" = ANY(activity."allowedAdditionalThemeIds")) OR NOT EXISTS (SELECT 1 FROM "ProductCategory" WHERE id=NEW."categoryId" AND "classificationKind"='family' AND vertical=activity.vertical AND "dataClass"=activity."dataClass" AND "isActive") THEN RAISE EXCEPTION 'additional_theme_incompatible'; END IF;
 END IF;
 RETURN NEW;
END $$;
