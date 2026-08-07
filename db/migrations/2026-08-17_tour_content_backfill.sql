-- Tour content backfill (Fase 1, cierre):
-- 1) durationMinutes desde duration texto (heurística espejo de parseDurationMinutes)
-- 2) includesJson sembrado desde itineraryJson legacy cuando includes está vacío
-- Idempotente: solo toca filas con el destino vacío.

-- 1) duration text -> durationMinutes (horas, días, minutos; decimal con coma o punto)
UPDATE "Tour"
SET "durationMinutes" = CASE
	WHEN substring(lower(btrim("duration")) from '(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hora|horas)') IS NOT NULL
		THEN round(replace(substring(lower(btrim("duration")) from '(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hora|horas)'), ',', '.')::numeric * 60)::int
	WHEN substring(lower(btrim("duration")) from '(\d+(?:[.,]\d+)?)\s*(?:d|día|dias|días|day|days)') IS NOT NULL
		THEN round(replace(substring(lower(btrim("duration")) from '(\d+(?:[.,]\d+)?)\s*(?:d|día|dias|días|day|days)'), ',', '.')::numeric * 1440)::int
	WHEN substring(lower(btrim("duration")) from '(\d+)\s*(?:m|min|mins|minuto|minutos)') IS NOT NULL
		THEN substring(lower(btrim("duration")) from '(\d+)\s*(?:m|min|mins|minuto|minutos)')::int
	ELSE "durationMinutes"
END
WHERE "durationMinutes" IS NULL
	AND "duration" IS NOT NULL
	AND btrim("duration") <> '';

-- 2) includes MVP desde itinerary legacy.
-- Soporta ambos shapes de itinerario:
--   actual: [{ step, description }]  ·  legacy: ["paso como string"]
UPDATE "Tour" t
SET "includesJson" = sub.derived
FROM (
	SELECT x."productId", jsonb_agg(x.d) AS derived
	FROM (
		SELECT tr."productId",
			CASE
				WHEN jsonb_typeof(elem) = 'object' THEN btrim(elem->>'description')
				WHEN jsonb_typeof(elem) = 'string' THEN btrim(elem #>> '{}')
				ELSE NULL
			END AS d
		FROM "Tour" tr, jsonb_array_elements(tr."itineraryJson") elem
		WHERE jsonb_typeof(tr."itineraryJson") = 'array'
	) x
	WHERE coalesce(x.d, '') <> ''
	GROUP BY x."productId"
) sub
WHERE sub."productId" = t."productId"
	AND (t."includesJson" IS NULL OR t."includesJson" = 'null'::jsonb OR t."includesJson" = '[]'::jsonb);
