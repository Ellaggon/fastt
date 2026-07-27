-- Phase 4: formalize external_calendars connection rollup ownership.
-- Backfill legacy null connectionId rows, then require connectionId on every feed.
-- Due scheduling remains calendar-level; connection schedule fields are rollup/display only.

-- Ensure each provider with calendars has an external_calendars connection.
INSERT INTO "ProviderIntegrationConnection" (
	"id",
	"providerId",
	"connectorKey",
	"displayName",
	"isPrimary",
	"status",
	"mode",
	"scopesJson",
	"syncEnabled",
	"createdAt",
	"updatedAt"
)
SELECT
	gen_random_uuid()::text,
	c."providerId",
	'external_calendars',
	'Calendarios externos',
	TRUE,
	'pending',
	'production',
	'["calendar:import"]'::jsonb,
	FALSE,
	NOW(),
	NOW()
FROM (
	SELECT DISTINCT "providerId"
	FROM "ProviderExternalCalendar"
) AS c
WHERE NOT EXISTS (
	SELECT 1
	FROM "ProviderIntegrationConnection" AS conn
	WHERE
		conn."providerId" = c."providerId"
		AND conn."connectorKey" = 'external_calendars'
);

UPDATE "ProviderExternalCalendar" AS calendar
SET "connectionId" = primary_conn."id",
	"updatedAt" = NOW()
FROM (
	SELECT DISTINCT ON ("providerId")
		"id",
		"providerId"
	FROM "ProviderIntegrationConnection"
	WHERE "connectorKey" = 'external_calendars'
	ORDER BY "providerId", "isPrimary" DESC, "updatedAt" DESC
) AS primary_conn
WHERE
	calendar."providerId" = primary_conn."providerId"
	AND calendar."connectionId" IS NULL;

ALTER TABLE "ProviderExternalCalendar"
	ALTER COLUMN "connectionId" SET NOT NULL;
