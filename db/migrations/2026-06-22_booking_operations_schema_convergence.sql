-- Booking operations convergence before production clients.
-- Removes currency-specific totals, makes ownership direct, separates operational
-- state from contractual status, and gives snapshot children real integrity.

PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

CREATE TABLE "Booking_new" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL,
	"userId" TEXT,
	"ratePlanId" TEXT NOT NULL,
	"bookingDate" INTEGER NOT NULL DEFAULT (unixepoch()),
	"checkInDate" TEXT NOT NULL,
	"checkOutDate" TEXT NOT NULL,
	"numAdults" INTEGER NOT NULL DEFAULT 1,
	"numChildren" INTEGER NOT NULL DEFAULT 0,
	"totalAmount" REAL NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'draft',
	"operationalStatus" TEXT NOT NULL DEFAULT 'pending_arrival'
		CHECK ("operationalStatus" IN ('pending_arrival', 'checked_in', 'checked_out', 'no_show', 'cancelled', 'untracked')),
	"checkedInAt" INTEGER,
	"checkedInBy" TEXT,
	"checkedOutAt" INTEGER,
	"checkedOutBy" TEXT,
	"noShowAt" INTEGER,
	"noShowBy" TEXT,
	"notes" TEXT,
	"currency" TEXT NOT NULL,
	"source" TEXT NOT NULL DEFAULT 'web',
	"confirmedAt" INTEGER,
	"guestEmailSnapshot" TEXT,
	"guestNameSnapshot" TEXT,
	"guestContactSnapshotJson" TEXT,
	"lifecycleAuditJson" TEXT,
	"refundHandoffSnapshotJson" TEXT,
	"contractSnapshotVersion" TEXT,
	FOREIGN KEY ("providerId") REFERENCES "Provider" ("id"),
	FOREIGN KEY ("userId") REFERENCES "User" ("id"),
	FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan" ("id"),
	FOREIGN KEY ("checkedInBy") REFERENCES "User" ("id"),
	FOREIGN KEY ("checkedOutBy") REFERENCES "User" ("id"),
	FOREIGN KEY ("noShowBy") REFERENCES "User" ("id")
);

INSERT INTO "Booking_new" (
	"id", "providerId", "userId", "ratePlanId", "bookingDate", "checkInDate", "checkOutDate",
	"numAdults", "numChildren", "totalAmount", "status", "operationalStatus", "notes",
	"currency", "source", "confirmedAt", "guestEmailSnapshot", "guestNameSnapshot",
	"guestContactSnapshotJson", "lifecycleAuditJson", "refundHandoffSnapshotJson",
	"contractSnapshotVersion"
)
SELECT
	b."id",
	(SELECT p."providerId"
	 FROM "BookingRoomDetail" d
	 JOIN "Variant" v ON v."id" = d."variantId"
	 JOIN "Product" p ON p."id" = v."productId"
	 WHERE d."bookingId" = b."id"
	 LIMIT 1),
	b."userId",
	b."ratePlanId",
	b."bookingDate",
	CASE
		WHEN typeof(b."checkInDate") = 'integer' AND b."checkInDate" > 100000000000
			THEN strftime('%Y-%m-%d', b."checkInDate" / 1000, 'unixepoch')
		WHEN typeof(b."checkInDate") = 'integer'
			THEN strftime('%Y-%m-%d', b."checkInDate", 'unixepoch')
		ELSE substr(CAST(b."checkInDate" AS TEXT), 1, 10)
	END,
	CASE
		WHEN typeof(b."checkOutDate") = 'integer' AND b."checkOutDate" > 100000000000
			THEN strftime('%Y-%m-%d', b."checkOutDate" / 1000, 'unixepoch')
		WHEN typeof(b."checkOutDate") = 'integer'
			THEN strftime('%Y-%m-%d', b."checkOutDate", 'unixepoch')
		ELSE substr(CAST(b."checkOutDate" AS TEXT), 1, 10)
	END,
	b."numAdults",
	b."numChildren",
	COALESCE(
		CASE WHEN upper(COALESCE(b."currency", 'USD')) = 'BOB' THEN b."totalAmountBOB" ELSE b."totalAmountUSD" END,
		(SELECT SUM(d."totalPrice") FROM "BookingRoomDetail" d WHERE d."bookingId" = b."id"),
		0
	),
	b."status",
	CASE WHEN lower(COALESCE(b."status", '')) = 'cancelled' THEN 'cancelled' ELSE 'untracked' END,
	b."notes",
	upper(COALESCE(NULLIF(b."currency", ''), CASE WHEN b."totalAmountBOB" IS NOT NULL THEN 'BOB' ELSE 'USD' END)),
	b."source",
	b."confirmedAt",
	NULL,
	NULL,
	NULL,
	NULL,
	NULL,
	NULL
FROM "Booking" b;

CREATE TABLE "BookingRoomDetail_new" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"bookingId" TEXT NOT NULL,
	"variantId" TEXT NOT NULL,
	"ratePlanId" TEXT NOT NULL,
	"checkIn" TEXT NOT NULL,
	"checkOut" TEXT NOT NULL,
	"adults" INTEGER NOT NULL,
	"children" INTEGER NOT NULL,
	"subtotalAmount" REAL NOT NULL,
	"taxAmount" REAL NOT NULL,
	"totalAmount" REAL NOT NULL,
	"pricingBreakdownJson" TEXT,
	"providerIdSnapshot" TEXT,
	"productIdSnapshot" TEXT,
	"productNameSnapshot" TEXT,
	"variantNameSnapshot" TEXT,
	"ratePlanNameSnapshot" TEXT,
	"occupancySnapshotJson" TEXT,
	"createdAt" INTEGER NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id"),
	FOREIGN KEY ("variantId") REFERENCES "Variant" ("id"),
	FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan" ("id")
);

INSERT INTO "BookingRoomDetail_new" (
	"id", "bookingId", "variantId", "ratePlanId", "checkIn", "checkOut", "adults", "children",
	"subtotalAmount", "taxAmount", "totalAmount", "pricingBreakdownJson", "providerIdSnapshot",
	"productIdSnapshot", "productNameSnapshot", "variantNameSnapshot", "ratePlanNameSnapshot",
	"occupancySnapshotJson", "createdAt"
)
SELECT
	d."id", d."bookingId", d."variantId", d."ratePlanId", d."checkIn", d."checkOut", d."adults", d."children",
	d."basePrice", d."taxes", d."totalPrice", d."pricingBreakdownJson",
	p."providerId", p."id", p."name", v."name", NULL, NULL, d."createdAt"
FROM "BookingRoomDetail" d
LEFT JOIN "Variant" v ON v."id" = d."variantId"
LEFT JOIN "Product" p ON p."id" = v."productId";

CREATE TABLE "BookingPolicySnapshot_new" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"bookingId" TEXT NOT NULL,
	"category" TEXT NOT NULL,
	"policyId" TEXT,
	"policySnapshotJson" TEXT NOT NULL,
	"createdAt" INTEGER,
	FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id")
);

INSERT INTO "BookingPolicySnapshot_new" (
	"id", "bookingId", "category", "policyId", "policySnapshotJson", "createdAt"
)
SELECT
	p."id",
	p."bookingId",
	COALESCE(NULLIF(p."category", ''), 'cancellation'),
	p."policyId",
	COALESCE(
		p."policySnapshotJson",
		json_object(
			'category', COALESCE(NULLIF(p."category", ''), 'cancellation'),
			'policyId', p."policyId",
			'source', 'booking_operations_schema_convergence'
		)
	),
	p."createdAt"
FROM "BookingPolicySnapshot" p
WHERE p.rowid = (
	SELECT p2.rowid
	FROM "BookingPolicySnapshot" p2
	WHERE p2."bookingId" = p."bookingId"
		AND COALESCE(NULLIF(p2."category", ''), 'cancellation')
			= COALESCE(NULLIF(p."category", ''), 'cancellation')
	ORDER BY COALESCE(p2."createdAt", 0) DESC, p2.rowid DESC
	LIMIT 1
);

CREATE TABLE "BookingTaxFee_new" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"bookingId" TEXT NOT NULL,
	"name" TEXT,
	"breakdownJson" TEXT NOT NULL,
	"totalAmount" REAL NOT NULL,
	"createdAt" INTEGER NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id")
);

INSERT INTO "BookingTaxFee_new" (
	"id", "bookingId", "name", "breakdownJson", "totalAmount", "createdAt"
)
SELECT "id", "bookingId", "name", COALESCE("breakdownJson", '{}'), "totalAmount", "createdAt"
FROM "BookingTaxFee";

DROP TABLE "BookingPolicySnapshot";
DROP TABLE "BookingTaxFee";
DROP TABLE "BookingRoomDetail";
DROP TABLE "Booking";

ALTER TABLE "Booking_new" RENAME TO "Booking";
ALTER TABLE "BookingRoomDetail_new" RENAME TO "BookingRoomDetail";
ALTER TABLE "BookingPolicySnapshot_new" RENAME TO "BookingPolicySnapshot";
ALTER TABLE "BookingTaxFee_new" RENAME TO "BookingTaxFee";

CREATE INDEX "Booking_provider_status_checkin_idx"
	ON "Booking" ("providerId", "status", "checkInDate");
CREATE INDEX "Booking_provider_operation_checkout_idx"
	ON "Booking" ("providerId", "operationalStatus", "checkOutDate");
CREATE INDEX "Booking_rate_plan_idx" ON "Booking" ("ratePlanId");
CREATE INDEX "BookingRoomDetail_booking_idx" ON "BookingRoomDetail" ("bookingId");
CREATE INDEX "BookingRoomDetail_variant_idx" ON "BookingRoomDetail" ("variantId");
CREATE INDEX "BookingRoomDetail_rate_plan_idx" ON "BookingRoomDetail" ("ratePlanId");
CREATE UNIQUE INDEX "BookingPolicySnapshot_booking_category_uq"
	ON "BookingPolicySnapshot" ("bookingId", "category");
CREATE INDEX "BookingTaxFee_booking_idx" ON "BookingTaxFee" ("bookingId");

COMMIT;
PRAGMA foreign_keys = ON;
