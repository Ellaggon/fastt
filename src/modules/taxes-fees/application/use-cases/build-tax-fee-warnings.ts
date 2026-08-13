import type { TaxFeeDefinition } from "../../domain/tax-fee.types"

export type TaxFeeWarning = {
	code: "duplicate_code" | "high_percentage" | "overlapping_taxes"
	message: string
	meta?: Record<string, unknown>
}

const HIGH_PERCENTAGE_THRESHOLD = 50

export function buildTaxFeeWarnings(definitions: TaxFeeDefinition[]): TaxFeeWarning[] {
	const warnings: TaxFeeWarning[] = []
	// A draft has no commercial effect. Its completeness belongs to the editor,
	// not to a warning that suggests an active sales risk.
	const publishedDefinitions = definitions.filter(
		(definition) => definition.status === "active" && definition.editingState !== "draft"
	)

	const codeCount = new Map<string, number>()

	for (const def of publishedDefinitions) {
		codeCount.set(def.code, (codeCount.get(def.code) ?? 0) + 1)

		if (def.calculationType === "percentage" && def.value > HIGH_PERCENTAGE_THRESHOLD) {
			warnings.push({
				code: "high_percentage",
				message: `${def.name} tiene un porcentaje inusualmente alto (${def.value}%). Confirma que el monto sea correcto.`,
				meta: { code: def.code, value: def.value },
			})
		}
	}

	for (const [code, count] of codeCount.entries()) {
		if (count <= 1) continue
		warnings.push({
			code: "duplicate_code",
			message: `Hay ${count} definiciones activas con el mismo código (${code}). Revisa si una de ellas debe archivarse.`,
			meta: { code, count },
		})
	}

	return warnings
}
