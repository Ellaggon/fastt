-- This project has no public customers yet. Remove the short-lived alias
-- compatibility layer and retain canonicalPath as the sole public route form.
DROP TRIGGER IF EXISTS "trg_GeoPlace_preserve_route_alias" ON "GeoPlace";
DROP FUNCTION IF EXISTS fastt_preserve_geo_place_route_alias();

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

-- Rebuild every path from the hierarchy before removing the old compatibility
-- table. This makes the migration deterministic even if an earlier preview
-- migration stored a stale path.
WITH RECURSIVE route_tree AS (
	SELECT root."id", root."slug" AS "canonicalPath"
	FROM "GeoPlace" root
	WHERE root."parentId" IS NULL
	UNION ALL
	SELECT child."id", parent."canonicalPath" || '/' || child."slug"
	FROM "GeoPlace" child
	INNER JOIN route_tree parent ON parent."id" = child."parentId"
)
UPDATE "GeoPlace" place
SET "canonicalPath" = route_tree."canonicalPath"
FROM route_tree
WHERE place."id" = route_tree."id"
	AND place."canonicalPath" IS DISTINCT FROM route_tree."canonicalPath";

DROP TABLE IF EXISTS "GeoPlaceRouteAlias";

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

DROP TRIGGER IF EXISTS "trg_GeoPlace_propagate_canonical_path" ON "GeoPlace";
CREATE TRIGGER "trg_GeoPlace_propagate_canonical_path"
AFTER UPDATE ON "GeoPlace"
FOR EACH ROW
WHEN (OLD."canonicalPath" IS DISTINCT FROM NEW."canonicalPath")
EXECUTE FUNCTION fastt_propagate_geo_place_canonical_path();
