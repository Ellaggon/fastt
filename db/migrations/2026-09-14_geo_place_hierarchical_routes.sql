-- GeoPlace.slug becomes a sibling-level route segment. canonicalPath is the
-- only public geographic identity; no legacy route aliases are retained.
ALTER TABLE "GeoPlace"
	ADD COLUMN IF NOT EXISTS "canonicalPath" text;

DO $$
BEGIN
	IF EXISTS (
		WITH normalized AS (
			SELECT
				"id",
				"parentId",
				trim(BOTH '-' FROM regexp_replace(lower(trim("slug")), '[^a-z0-9]+', '-', 'g')) AS "slug"
			FROM "GeoPlace"
		)
		SELECT 1
		FROM normalized
		GROUP BY "parentId", "slug"
		HAVING count(*) > 1 OR bool_or("slug" = '')
	) THEN
		RAISE EXCEPTION 'GEO_PLACE_ROUTE_SEGMENT_NORMALIZATION_COLLISION';
	END IF;
END $$;

-- The old global constraint is intentionally retired before normalizing: identical
-- segments are valid under different parents (for example two cities named La Paz).
DROP INDEX IF EXISTS "GeoPlace_slug_unique";

UPDATE "GeoPlace"
SET "slug" = trim(BOTH '-' FROM regexp_replace(lower(trim("slug")), '[^a-z0-9]+', '-', 'g'));

WITH RECURSIVE route_tree AS (
	SELECT root."id", lower(trim(root."slug")) AS "canonicalPath"
	FROM "GeoPlace" root
	WHERE root."parentId" IS NULL
	UNION ALL
	SELECT child."id", parent."canonicalPath" || '/' || lower(trim(child."slug"))
	FROM "GeoPlace" child
	INNER JOIN route_tree parent ON parent."id" = child."parentId"
)
UPDATE "GeoPlace" place
SET "canonicalPath" = route_tree."canonicalPath"
FROM route_tree
WHERE place."id" = route_tree."id"
	AND place."canonicalPath" IS NULL;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "GeoPlace" WHERE "canonicalPath" IS NULL OR "canonicalPath" = '') THEN
		RAISE EXCEPTION 'GEO_PLACE_CANONICAL_PATH_BACKFILL_INCOMPLETE';
	END IF;
END $$;

ALTER TABLE "GeoPlace"
	ALTER COLUMN "canonicalPath" SET NOT NULL,
	ADD CONSTRAINT "GeoPlace_canonicalPath_format_check"
	CHECK ("canonicalPath" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*$');

CREATE UNIQUE INDEX IF NOT EXISTS "GeoPlace_canonicalPath_unique"
	ON "GeoPlace" ("canonicalPath");
CREATE UNIQUE INDEX IF NOT EXISTS "GeoPlace_parent_slug_unique"
	ON "GeoPlace" ("parentId", "slug") NULLS NOT DISTINCT;

CREATE OR REPLACE FUNCTION fastt_derive_geo_place_canonical_path()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	parent_path text;
BEGIN
	NEW."slug" := trim(BOTH '-' FROM regexp_replace(lower(trim(NEW."slug")), '[^a-z0-9]+', '-', 'g'));
	IF NEW."slug" !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
		RAISE EXCEPTION 'GEO_PLACE_INVALID_ROUTE_SEGMENT';
	END IF;
	IF NEW."parentId" IS NULL THEN
		NEW."canonicalPath" := NEW."slug";
	ELSE
		IF NEW."parentId" = NEW."id" THEN RAISE EXCEPTION 'GEO_PLACE_PARENT_CANNOT_BE_SELF'; END IF;
		IF TG_OP = 'UPDATE' AND EXISTS (
			WITH RECURSIVE descendants AS (
				SELECT "id" FROM "GeoPlace" WHERE "parentId" = NEW."id"
				UNION ALL
				SELECT child."id" FROM "GeoPlace" child
				INNER JOIN descendants parent ON child."parentId" = parent."id"
			)
			SELECT 1 FROM descendants WHERE "id" = NEW."parentId"
		) THEN RAISE EXCEPTION 'GEO_PLACE_HIERARCHY_CYCLE'; END IF;
		SELECT "canonicalPath" INTO parent_path FROM "GeoPlace" WHERE "id" = NEW."parentId";
		IF parent_path IS NULL THEN RAISE EXCEPTION 'GEO_PLACE_PARENT_NOT_FOUND'; END IF;
		NEW."canonicalPath" := parent_path || '/' || NEW."slug";
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_propagate_geo_place_canonical_path()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF OLD."canonicalPath" IS DISTINCT FROM NEW."canonicalPath" THEN
		UPDATE "GeoPlace" child
		SET "canonicalPath" = NEW."canonicalPath" || '/' || child."slug"
		WHERE child."parentId" = NEW."id"
			AND child."canonicalPath" IS DISTINCT FROM NEW."canonicalPath" || '/' || child."slug";
	END IF;
	RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS "trg_GeoPlace_derive_canonical_path" ON "GeoPlace";
CREATE TRIGGER "trg_GeoPlace_derive_canonical_path"
BEFORE INSERT OR UPDATE OF "slug", "parentId", "canonicalPath" ON "GeoPlace"
FOR EACH ROW
EXECUTE FUNCTION fastt_derive_geo_place_canonical_path();

DROP TRIGGER IF EXISTS "trg_GeoPlace_propagate_canonical_path" ON "GeoPlace";
CREATE TRIGGER "trg_GeoPlace_propagate_canonical_path"
AFTER UPDATE ON "GeoPlace"
FOR EACH ROW
WHEN (OLD."canonicalPath" IS DISTINCT FROM NEW."canonicalPath")
EXECUTE FUNCTION fastt_propagate_geo_place_canonical_path();
