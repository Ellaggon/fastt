-- Promote legacy current snapshots to the canonical append-only schema. The
-- historical version remains untouched; only a new release and pointer are
-- created. New installations already write schemaVersion 2 through the
-- canonical publication service, so this migration is intentionally data-only.

DO $$
DECLARE
	definition record;
	next_version integer;
	new_version_id text;
	old_snapshot jsonb;
	new_snapshot jsonb;
BEGIN
	FOR definition IN
		SELECT d.*, v."snapshotJson" AS current_snapshot
		FROM "TaxFeeDefinition" d
		JOIN "TaxFeeDefinitionVersion" v ON v."id" = d."currentVersionId"
		WHERE COALESCE(v."snapshotJson" ->> 'schemaVersion', '') <> '2'
		FOR UPDATE OF d
	LOOP
		SELECT COALESCE(MAX(v."version"), 0) + 1
		INTO next_version
		FROM "TaxFeeDefinitionVersion" v
		WHERE v."taxFeeDefinitionId" = definition."id";

		new_version_id := 'tfv_snapshot_v2_' || md5(definition."id" || definition."currentVersionId");
		old_snapshot := definition.current_snapshot;
		new_snapshot := jsonb_build_object(
			'schemaVersion', 2,
			'rule', jsonb_build_object(
				'code', definition."code",
				'name', definition."name",
				'kind', definition."kind",
				'calculationType', definition."calculationType",
				'value', definition."value",
				'currency', definition."currency",
				'inclusionType', definition."inclusionType",
				'appliesPer', definition."appliesPer",
				'priority', definition."priority",
				'jurisdiction', definition."jurisdictionJson",
				'effectiveFrom', CASE
					WHEN definition."effectiveFrom" IS NULL THEN NULL
					ELSE to_char(
						definition."effectiveFrom" AT TIME ZONE 'UTC',
						'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
					)
				END,
				'effectiveTo', CASE
					WHEN definition."effectiveTo" IS NULL THEN NULL
					ELSE to_char(
						definition."effectiveTo" AT TIME ZONE 'UTC',
						'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
					)
				END
			)
		);

		INSERT INTO "TaxFeeDefinitionVersion" (
			"id", "taxFeeDefinitionId", "version", "publicationState",
			"snapshotJson", "createdByUserId", "createdAt"
		)
		VALUES (
			new_version_id,
			definition."id",
			next_version,
			CASE WHEN definition."effectiveFrom" > CURRENT_TIMESTAMP THEN 'scheduled' ELSE 'published' END,
			new_snapshot,
			NULL,
			CURRENT_TIMESTAMP
		);

		UPDATE "TaxFeeDefinition"
		SET "currentVersionId" = new_version_id,
			"updatedAt" = CURRENT_TIMESTAMP
		WHERE "id" = definition."id";

		INSERT INTO "FiscalActivityEvent" (
			"id", "providerId", "eventType", "definitionId", "definitionVersionId",
			"actorRole", "correlationId", "result", "riskLevel",
			"beforeJson", "afterJson", "contextJson", "createdAt"
		)
		VALUES (
			'tfa_snapshot_v2_' || md5(definition."id" || definition."currentVersionId"),
			definition."providerId",
			'definition_snapshot_schema_migrated',
			definition."id",
			new_version_id,
			'system_migration',
			'tax_snapshot_v2_' || md5(definition."id" || definition."currentVersionId"),
			'succeeded',
			'low',
			old_snapshot,
			new_snapshot,
			jsonb_build_object(
				'fromSchemaVersion', COALESCE(old_snapshot ->> 'schemaVersion', '1'),
				'toSchemaVersion', 2,
				'preservedVersionId', definition."currentVersionId"
			),
			CURRENT_TIMESTAMP
		);
	END LOOP;
END;
$$;
