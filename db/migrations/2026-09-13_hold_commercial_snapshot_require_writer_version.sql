-- Historical rows were classified as legacy by the preceding migration. From
-- this point, every new Hold must explicitly choose a commercial contract.
-- Current writers provide hold_commercial_snapshot_v1; an old deployment is
-- rejected instead of silently creating a cache-dependent hold.
ALTER TABLE "Hold"
	ALTER COLUMN "commercialSnapshotVersion" DROP DEFAULT;
