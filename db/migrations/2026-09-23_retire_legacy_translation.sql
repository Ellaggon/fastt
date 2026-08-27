-- Translation was a polymorphic, unreferenced localization table. Current
-- localized content uses explicit domain contracts (for example GeoPlaceContent).
DO $$
BEGIN
	IF to_regclass('public."Translation"') IS NOT NULL
		AND EXISTS (SELECT 1 FROM "Translation") THEN
		RAISE EXCEPTION 'TRANSLATION_RETIRED_TABLE_CONTAINS_DATA';
	END IF;
END;
$$;

DROP TABLE IF EXISTS "Translation";
