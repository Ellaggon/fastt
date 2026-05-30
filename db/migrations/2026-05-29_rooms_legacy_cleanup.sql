-- Rooms v2 cleanup:
-- VariantRoomProfile / VariantRoomBed / VariantRoomAmenity are the canonical room tables.
-- ProductLocation is the canonical location table for every Product vertical.

BEGIN TRANSACTION;
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS "HotelRoomAmenity";
DROP TABLE IF EXISTS "HotelRoomType";

CREATE TABLE "__Hotel_new" (
	"productId" TEXT PRIMARY KEY NOT NULL REFERENCES "Product" ("id"),
	"stars" INTEGER,
	"phone" TEXT,
	"email" TEXT,
	"website" TEXT
);

INSERT INTO "__Hotel_new" ("productId", "stars", "phone", "email", "website")
SELECT "productId", "stars", "phone", "email", "website"
FROM "Hotel";

DROP TABLE "Hotel";
ALTER TABLE "__Hotel_new" RENAME TO "Hotel";

PRAGMA foreign_keys = ON;
COMMIT;
