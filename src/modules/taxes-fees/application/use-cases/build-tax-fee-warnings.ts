import type { TaxFeeDefinition } from "../../domain/tax-fee.types"

export type TaxFeeWarning = {
	code: "duplicate_code" | "high_percentage" | "overlapping_taxes"
	message: string
	meta?: Record<string, unknown>
}

const HIGH_PERCENTAGE_THRESHOLD = 50

export function buildTaxFeeWarnings(definitions: TaxFeeDefinition[]): TaxFeeWarning[] {
	const warnings: TaxFeeWarning[] = []

	const codeCount = new Map<string, number>()
	const overlapKeyCount = new Map<string, number>()

	for (const def of definitions) {
		codeCount.set(def.code, (codeCount.get(def.code) ?? 0) + 1)

		if (def.calculationType === "percentage" && def.value > HIGH_PERCENTAGE_THRESHOLD) {
			warnings.push({
				code: "high_percentage",
				message: `High percentage detected for ${def.code} (${def.value}%).`,
				meta: { code: def.code, value: def.value },
			})
		}

		if (def.kind === "tax") {
			const key = `${def.inclusionType}:${def.appliesPer}`
			overlapKeyCount.set(key, (overlapKeyCount.get(key) ?? 0) + 1)
		}
	}

	for (const [code, count] of codeCount.entries()) {
		if (count <= 1) continue
		warnings.push({
			code: "duplicate_code",
			message: `Multiple active definitions with code ${code} detected.`,
			meta: { code, count },
		})
	}

	for (const [key, count] of overlapKeyCount.entries()) {
		if (count <= 1) continue
		warnings.push({
			code: "overlapping_taxes",
			message: `Multiple taxes apply for ${key.replace(":", " / ")}.`,
			meta: { key, count },
		})
	}

	return warnings
}
