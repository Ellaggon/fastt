-- Service carried only the same code already owned by the versioned service registry.
-- ProductService keeps product-specific commercial configuration; its serviceId is a
-- validated registry code, not a foreign key to an otherwise empty lookup table.

ALTER TABLE "ProductService"
	DROP CONSTRAINT IF EXISTS "ProductService_serviceId_fk";

DROP TABLE "Service";
