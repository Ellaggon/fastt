PRAGMA foreign_keys = OFF;

CREATE TABLE Variant_new (
  id TEXT PRIMARY KEY NOT NULL,
  productId TEXT NOT NULL REFERENCES Product(id),
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL,
  status TEXT,
  createdAt NUMERIC,
  confirmationType TEXT NOT NULL DEFAULT 'instant',
  externalCode TEXT,
  isActive INTEGER NOT NULL DEFAULT 1
);

INSERT INTO Variant_new (
  id,
  productId,
  name,
  description,
  kind,
  status,
  createdAt,
  confirmationType,
  externalCode,
  isActive
)
SELECT
  id,
  productId,
  name,
  description,
  COALESCE(NULLIF(kind, ''), NULLIF(entityType, ''), 'hotel_room') AS kind,
  status,
  createdAt,
  COALESCE(confirmationType, 'instant') AS confirmationType,
  externalCode,
  COALESCE(isActive, 1) AS isActive
FROM Variant;

DROP TABLE Variant;
ALTER TABLE Variant_new RENAME TO Variant;

PRAGMA foreign_keys = ON;
