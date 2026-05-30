-- Vertical maturity:
-- Package owns structured itinerary/includes/excludes.
-- Tour owns structured meeting point/itinerary/safety/guide.
-- Limousine becomes a first-class Product vertical extension.

BEGIN TRANSACTION;
PRAGMA foreign_keys = OFF;

CREATE TABLE "__Tour_new" (
	"productId" TEXT PRIMARY KEY NOT NULL REFERENCES "Product" ("id"),
	"duration" TEXT,
	"difficultyLevel" TEXT,
	"meetingPointJson" JSON,
	"itineraryJson" JSON,
	"safetyJson" JSON,
	"guideJson" JSON
);

INSERT INTO "__Tour_new" (
	"productId",
	"duration",
	"difficultyLevel",
	"itineraryJson",
	"guideJson"
)
SELECT
	"productId",
	"duration",
	"difficultyLevel",
	CASE
		WHEN "includes" IS NOT NULL OR "excludes" IS NOT NULL THEN json_object(
			'includes', COALESCE("includes", ''),
			'excludes', COALESCE("excludes", '')
		)
		ELSE NULL
	END,
	CASE
		WHEN "guideLanguages" IS NOT NULL THEN json_object('languages', "guideLanguages")
		ELSE NULL
	END
FROM "Tour";

DROP TABLE "Tour";
ALTER TABLE "__Tour_new" RENAME TO "Tour";

CREATE TABLE "__Package_new" (
	"productId" TEXT PRIMARY KEY NOT NULL REFERENCES "Product" ("id"),
	"days" INTEGER,
	"nights" INTEGER,
	"itineraryJson" JSON,
	"includesJson" JSON,
	"excludesJson" JSON
);

INSERT INTO "__Package_new" (
	"productId",
	"days",
	"nights",
	"itineraryJson"
)
SELECT
	"productId",
	"days",
	"nights",
	CASE
		WHEN "itinerary" IS NOT NULL THEN json_array(json_object('day', NULL, 'title', 'Itinerario', 'description', "itinerary"))
		ELSE NULL
	END
FROM "Package";

DROP TABLE "Package";
ALTER TABLE "__Package_new" RENAME TO "Package";

CREATE TABLE IF NOT EXISTS "Limousine" (
	"productId" TEXT PRIMARY KEY NOT NULL REFERENCES "Product" ("id"),
	"vehicleProfileJson" JSON,
	"pickupJson" JSON,
	"dropoffJson" JSON,
	"passengerCapacity" INTEGER,
	"luggageCapacity" INTEGER
);

PRAGMA foreign_keys = ON;
COMMIT;
