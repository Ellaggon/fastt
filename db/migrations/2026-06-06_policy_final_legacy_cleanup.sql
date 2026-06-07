-- Final early-stage policy cleanup: DTO-only resolver and canonical tax/fee snapshots.
-- BookingTaxFee no longer stores per-line legacy JSON; the canonical breakdownJson carries the
-- full calculation snapshot and name provides the human label.

CREATE TABLE IF NOT EXISTS BookingTaxFee_new (
	id TEXT PRIMARY KEY NOT NULL,
	bookingId TEXT NOT NULL,
	name TEXT,
	breakdownJson JSON NOT NULL,
	totalAmount REAL NOT NULL,
	createdAt INTEGER DEFAULT (unixepoch() * 1000)
);

INSERT INTO BookingTaxFee_new (
	id,
	bookingId,
	name,
	breakdownJson,
	totalAmount,
	createdAt
)
SELECT
	id,
	bookingId,
	'Taxes and fees snapshot' AS name,
	breakdownJson,
	totalAmount,
	createdAt
FROM BookingTaxFee;

DROP TABLE BookingTaxFee;
ALTER TABLE BookingTaxFee_new RENAME TO BookingTaxFee;

CREATE INDEX IF NOT EXISTS idx_BookingTaxFee_bookingId
	ON BookingTaxFee (bookingId);
