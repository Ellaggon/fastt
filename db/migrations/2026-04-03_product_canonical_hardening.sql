-- CAPA 2 FINALIZATION: canonical Product schema hardening
-- Goals:
-- 1) Drop Product.description (legacy)
-- 2) Enforce FK + ON DELETE CASCADE for ProductContent/ProductLocation/ProductStatus
-- 3) Keep data intact using SQLite-safe table rebuild strategy

-- Pre-check: invariant requested before migration
SELECT COUNT(*) AS product_content_description_nulls
FROM ProductContent
WHERE description IS NULL;

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- 1) Rebuild Product without legacy description
CREATE TABLE Product_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  productType TEXT NOT NULL,
  creationDate TEXT NOT NULL,
  lastUpdated TEXT NOT NULL,
  providerId TEXT,
  destinationId TEXT NOT NULL,
  FOREIGN KEY (providerId) REFERENCES Provider(id),
  FOREIGN KEY (destinationId) REFERENCES Destination(id)
);

INSERT INTO Product_new (id, name, productType, creationDate, lastUpdated, providerId, destinationId)
SELECT id, name, productType, creationDate, lastUpdated, providerId, destinationId
FROM Product;

DROP TABLE Product;
ALTER TABLE Product_new RENAME TO Product;

-- 2) Rebuild ProductContent with FK cascade
CREATE TABLE ProductContent_new (
  productId TEXT PRIMARY KEY,
  description TEXT,
  highlightsJson JSON,
  rules TEXT,
  seoJson JSON,
  FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE
);

INSERT INTO ProductContent_new (productId, description, highlightsJson, rules, seoJson)
SELECT productId, description, highlightsJson, rules, seoJson
FROM ProductContent;

DROP TABLE ProductContent;
ALTER TABLE ProductContent_new RENAME TO ProductContent;

-- 3) Rebuild ProductLocation with FK cascade
CREATE TABLE ProductLocation_new (
  productId TEXT PRIMARY KEY,
  address TEXT,
  lat REAL,
  lng REAL,
  FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE
);

INSERT INTO ProductLocation_new (productId, address, lat, lng)
SELECT productId, address, lat, lng
FROM ProductLocation;

DROP TABLE ProductLocation;
ALTER TABLE ProductLocation_new RENAME TO ProductLocation;

-- 4) Rebuild ProductStatus with FK cascade
CREATE TABLE ProductStatus_new (
  productId TEXT PRIMARY KEY,
  state TEXT DEFAULT 'draft',
  validationErrorsJson JSON,
  FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE
);

INSERT INTO ProductStatus_new (productId, state, validationErrorsJson)
SELECT productId, state, validationErrorsJson
FROM ProductStatus;

DROP TABLE ProductStatus;
ALTER TABLE ProductStatus_new RENAME TO ProductStatus;

COMMIT;
PRAGMA foreign_keys = ON;

-- Post-check orphan safety
SELECT COUNT(*) AS product_content_orphans
FROM ProductContent pc
LEFT JOIN Product p ON p.id = pc.productId
WHERE p.id IS NULL;

SELECT COUNT(*) AS product_location_orphans
FROM ProductLocation pl
LEFT JOIN Product p ON p.id = pl.productId
WHERE p.id IS NULL;

SELECT COUNT(*) AS product_status_orphans
FROM ProductStatus ps
LEFT JOIN Product p ON p.id = ps.productId
WHERE p.id IS NULL;
