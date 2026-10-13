-- Additive discovery classification. Historical categories, evidence and bookings stay intact.
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "classificationKind" text NOT NULL DEFAULT 'legacy';
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "parentCategoryId" text REFERENCES "ProductCategory"("id");
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "searchAliasesJson" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "ProductCategoryLink" ADD COLUMN IF NOT EXISTS "assignmentKind" text NOT NULL DEFAULT 'legacy';
ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "primaryActivityCategoryId" text REFERENCES "ProductCategory"("id");
ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "activityContractVersion" integer NOT NULL DEFAULT 0;
ALTER TABLE "Tour" ALTER COLUMN "activityContractVersion" SET DEFAULT 1;
ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "classificationRevision" integer NOT NULL DEFAULT 0;
ALTER TABLE "ProviderCommercialLine" ADD COLUMN IF NOT EXISTS "businessKinds" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "ProviderCommercialLine" ADD COLUMN IF NOT EXISTS "businessKindsUpdatedAt" timestamptz;
DO $$ BEGIN
 ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_kind_check" CHECK ("classificationKind" IN ('legacy','family','activity') AND (("classificationKind" = 'activity') = ("parentCategoryId" IS NOT NULL)));
 ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_aliases_check" CHECK (jsonb_typeof("searchAliasesJson") = 'array' AND jsonb_array_length("searchAliasesJson") <= 20);
 ALTER TABLE "ProductCategoryLink" ADD CONSTRAINT "ProductCategoryLink_assignment_check" CHECK ("assignmentKind" IN ('legacy','additional_theme'));
 ALTER TABLE "Tour" ADD CONSTRAINT "Tour_activity_contract_check" CHECK ("activityContractVersion" IN (0,1) AND ("activityContractVersion" = 1 OR "primaryActivityCategoryId" IS NULL) AND "classificationRevision" >= 0);
 ALTER TABLE "ProviderCommercialLine" ADD CONSTRAINT "ProviderCommercialLine_businessKinds_check" CHECK (cardinality("businessKinds") <= 10 AND "businessKinds" <@ ARRAY['operator','creative_studio','school','food_business','producer','cultural_center','wellness_studio','sports_operator','science_center','other']::text[] AND array_position("businessKinds", NULL) IS NULL);
END $$;
CREATE INDEX IF NOT EXISTS "ProductCategory_parent_idx" ON "ProductCategory"("parentCategoryId");
CREATE INDEX IF NOT EXISTS "Tour_primaryActivity_idx" ON "Tour"("primaryActivityCategoryId");

CREATE OR REPLACE FUNCTION fastt_guard_activity_taxonomy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "ProductCategory";
BEGIN
 -- Serialize taxonomy mutations; the hierarchy is exactly family -> activity.
 PERFORM pg_advisory_xact_lock(73421012);
 IF NEW."classificationKind" = 'activity' THEN
  SELECT * INTO parent FROM "ProductCategory" WHERE id = NEW."parentCategoryId" FOR SHARE;
  IF parent.id IS NULL OR parent."classificationKind" <> 'family' OR parent.vertical <> NEW.vertical OR parent."dataClass" <> NEW."dataClass" THEN
   RAISE EXCEPTION 'activity_parent_invalid';
  END IF;
 END IF;
 IF TG_OP = 'UPDATE' AND (NEW."classificationKind", NEW.vertical, NEW."parentCategoryId", NEW."dataClass") IS DISTINCT FROM (OLD."classificationKind", OLD.vertical, OLD."parentCategoryId", OLD."dataClass") THEN
  IF EXISTS (SELECT 1 FROM "ProductCategory" WHERE "parentCategoryId" = OLD.id) OR EXISTS (SELECT 1 FROM "Tour" WHERE "primaryActivityCategoryId" = OLD.id) OR EXISTS (SELECT 1 FROM "ProductCategoryLink" WHERE "categoryId" = OLD.id) THEN
   RAISE EXCEPTION 'referenced_taxonomy_structure_immutable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "trg_ProductCategory_activity_taxonomy" BEFORE INSERT OR UPDATE ON "ProductCategory" FOR EACH ROW EXECUTE FUNCTION fastt_guard_activity_taxonomy();

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
 IF TG_OP = 'UPDATE' THEN
  NEW."classificationRevision" := OLD."classificationRevision" + CASE WHEN (NEW."primaryActivityCategoryId",NEW."experienceFormat",NEW."activityContractVersion") IS DISTINCT FROM (OLD."primaryActivityCategoryId",OLD."experienceFormat",OLD."activityContractVersion") THEN 1 ELSE 0 END;
 ELSE NEW."classificationRevision" := 0;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "trg_Tour_activity_selection" BEFORE INSERT OR UPDATE ON "Tour" FOR EACH ROW EXECUTE FUNCTION fastt_guard_activity_selection();
CREATE OR REPLACE FUNCTION fastt_guard_additional_theme() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."assignmentKind" = 'additional_theme' AND NOT EXISTS (SELECT 1 FROM "ProductCategory" WHERE id = NEW."categoryId" AND "classificationKind" = 'family' AND vertical = 'tour' AND "dataClass" = 'production' AND "isActive") THEN RAISE EXCEPTION 'additional_theme_invalid'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "trg_ProductCategoryLink_additional_theme" BEFORE INSERT OR UPDATE ON "ProductCategoryLink" FOR EACH ROW EXECUTE FUNCTION fastt_guard_additional_theme();

INSERT INTO "ProductCategory" (id,slug,name,vertical,"classificationKind","parentCategoryId","searchAliasesJson","sortOrder") VALUES
('exp:family:culture','experience-culture','Cultura y patrimonio','tour','family',NULL,'["cultural", "city-tour"]'::jsonb,0),
('exp:family:arts','experience-arts','Arte y artesanía','tour','family',NULL,'["art-design"]'::jsonb,1),
('exp:family:food','experience-food','Gastronomía y bebidas','tour','family',NULL,'["gastronomy"]'::jsonb,2),
('exp:family:music-dance','experience-music-dance','Música y danza','tour','family',NULL,'[]'::jsonb,3),
('exp:family:photography','experience-photography','Fotografía y creación audiovisual','tour','family',NULL,'[]'::jsonb,4),
('exp:family:nature-rural','experience-nature-rural','Naturaleza y vida rural','tour','family',NULL,'["nature", "wildlife", "trekking"]'::jsonb,5),
('exp:family:sports-adventure','experience-sports-adventure','Deporte y aventura','tour','family',NULL,'["adventure", "water-activities", "ski", "cruise"]'::jsonb,6),
('exp:family:wellness','experience-wellness','Bienestar y movimiento','tour','family',NULL,'["wellness"]'::jsonb,7),
('exp:family:science','experience-science','Ciencia y tecnología','tour','family',NULL,'[]'::jsonb,8),
('exp:activity:urban-walk','activity-urban-walk','Recorrido urbano','tour','activity','exp:family:culture','[]'::jsonb,0),
('exp:activity:heritage-visit','activity-heritage-visit','Visita patrimonial','tour','activity','exp:family:culture','[]'::jsonb,1),
('exp:activity:museum-visit','activity-museum-visit','Visita a museo','tour','activity','exp:family:culture','[]'::jsonb,2),
('exp:activity:ceramics','activity-ceramics','Cerámica','tour','activity','exp:family:arts','[]'::jsonb,100),
('exp:activity:painting','activity-painting','Pintura','tour','activity','exp:family:arts','[]'::jsonb,101),
('exp:activity:weaving','activity-weaving','Tejido','tour','activity','exp:family:arts','[]'::jsonb,102),
('exp:activity:jewelry','activity-jewelry','Joyería','tour','activity','exp:family:arts','[]'::jsonb,103),
('exp:activity:floral-art','activity-floral-art','Arte floral','tour','activity','exp:family:arts','[]'::jsonb,104),
('exp:activity:cooking','activity-cooking','Cocina','tour','activity','exp:family:food','[]'::jsonb,200),
('exp:activity:baking','activity-baking','Panadería','tour','activity','exp:family:food','[]'::jsonb,201),
('exp:activity:coffee','activity-coffee','Café','tour','activity','exp:family:food','[]'::jsonb,202),
('exp:activity:chocolate','activity-chocolate','Chocolate','tour','activity','exp:family:food','[]'::jsonb,203),
('exp:activity:product-tasting','activity-product-tasting','Degustación de productos','tour','activity','exp:family:food','[]'::jsonb,204),
('exp:activity:dance','activity-dance','Danza','tour','activity','exp:family:music-dance','[]'::jsonb,300),
('exp:activity:music-instrument','activity-music-instrument','Instrumento musical','tour','activity','exp:family:music-dance','[]'::jsonb,301),
('exp:activity:singing','activity-singing','Canto','tour','activity','exp:family:music-dance','[]'::jsonb,302),
('exp:activity:photography','activity-photography','Fotografía','tour','activity','exp:family:photography','[]'::jsonb,400),
('exp:activity:audiovisual','activity-audiovisual','Producción audiovisual','tour','activity','exp:family:photography','[]'::jsonb,401),
('exp:activity:hiking','activity-hiking','Senderismo','tour','activity','exp:family:nature-rural','[]'::jsonb,500),
('exp:activity:nature-observation','activity-nature-observation','Observación de naturaleza','tour','activity','exp:family:nature-rural','[]'::jsonb,501),
('exp:activity:farm-visit','activity-farm-visit','Visita a finca','tour','activity','exp:family:nature-rural','[]'::jsonb,502),
('exp:activity:gardening','activity-gardening','Jardinería','tour','activity','exp:family:nature-rural','[]'::jsonb,503),
('exp:activity:cycling','activity-cycling','Ciclismo','tour','activity','exp:family:sports-adventure','[]'::jsonb,600),
('exp:activity:climbing','activity-climbing','Escalada','tour','activity','exp:family:sports-adventure','[]'::jsonb,601),
('exp:activity:water-sport','activity-water-sport','Actividades acuáticas','tour','activity','exp:family:sports-adventure','[]'::jsonb,602),
('exp:activity:snow-sport','activity-snow-sport','Actividades de nieve','tour','activity','exp:family:sports-adventure','[]'::jsonb,603),
('exp:activity:yoga','activity-yoga','Yoga','tour','activity','exp:family:wellness','[]'::jsonb,700),
('exp:activity:movement','activity-movement','Movimiento y estiramiento','tour','activity','exp:family:wellness','[]'::jsonb,701),
('exp:activity:astronomy','activity-astronomy','Astronomía','tour','activity','exp:family:science','[]'::jsonb,800),
('exp:activity:robotics','activity-robotics','Robótica','tour','activity','exp:family:science','[]'::jsonb,801),
('exp:activity:digital-making','activity-digital-making','Fabricación digital','tour','activity','exp:family:science','[]'::jsonb,802)
ON CONFLICT (vertical,slug) DO NOTHING;
