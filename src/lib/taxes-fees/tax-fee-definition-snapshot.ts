import { z } from "zod"

const ruleSchema = z.object({
	code: z.string().min(1),
	name: z.string().min(1),
	kind: z.enum(["tax", "fee"]),
	calculationType: z.enum(["percentage", "fixed"]),
	value: z.coerce.number().positive(),
	currency: z.string().nullable(),
	inclusionType: z.enum(["included", "excluded"]),
	appliesPer: z.enum(["stay", "night", "guest", "guest_night"]),
	priority: z.coerce.number().int(),
	jurisdiction: z.unknown().nullable(),
	effectiveFrom: z.string().datetime().nullable(),
	effectiveTo: z.string().datetime().nullable(),
})

const versionedSnapshotSchema = z.object({
	schemaVersion: z.literal(2),
	rule: ruleSchema,
})

const legacySnapshotSchema = ruleSchema

export type TaxFeeDefinitionSnapshot = z.infer<typeof versionedSnapshotSchema>

export function createTaxFeeDefinitionSnapshot(
	rule: z.infer<typeof ruleSchema>
): TaxFeeDefinitionSnapshot {
	return { schemaVersion: 2, rule: ruleSchema.parse(rule) }
}

/** Legacy v1 snapshots are normalized only at the boundary; new writes are always v2. */
export function parseTaxFeeDefinitionSnapshot(value: unknown): TaxFeeDefinitionSnapshot | null {
	const versioned = versionedSnapshotSchema.safeParse(value)
	if (versioned.success) return versioned.data
	const legacy = legacySnapshotSchema.safeParse(value)
	return legacy.success ? { schemaVersion: 2, rule: legacy.data } : null
}
