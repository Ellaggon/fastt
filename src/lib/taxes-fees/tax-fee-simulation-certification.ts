import { createHash } from "node:crypto"

type CertifiableTaxFeeDefinition = {
	id: string
	code: string
	name: string
	kind: string
	calculationType: string
	value: number | string
	currency: string | null
	inclusionType: string
	appliesPer: string
	effectiveFrom: Date | string | null
	effectiveTo: Date | string | null
	jurisdictionJson: unknown | null
}

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue)
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, item]) => [key, stableValue(item)])
		)
	}
	return value
}

function dateValue(value: Date | string | null) {
	if (!value) return null
	return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

/** A simulation certifies this exact saved fiscal definition, never browser-only form state. */
export function taxFeeDefinitionFingerprint(definition: CertifiableTaxFeeDefinition) {
	const snapshot = stableValue({
		id: definition.id,
		code: definition.code,
		name: definition.name,
		kind: definition.kind,
		calculationType: definition.calculationType,
		value: Number(definition.value),
		currency: definition.currency ?? null,
		inclusionType: definition.inclusionType,
		appliesPer: definition.appliesPer,
		effectiveFrom: dateValue(definition.effectiveFrom),
		effectiveTo: dateValue(definition.effectiveTo),
		jurisdictionJson: definition.jurisdictionJson ?? null,
	})
	return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")
}
