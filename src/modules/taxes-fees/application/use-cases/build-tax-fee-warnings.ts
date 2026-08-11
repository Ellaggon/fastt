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
				message: `${def.name} tiene un porcentaje inusualmente alto (${def.value}%). Confirma que el monto sea correcto.`,
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
			message: `Hay ${count} definiciones activas con el mismo código (${code}). Revisa si una de ellas debe archivarse.`,
			meta: { code, count },
		})
	}

	for (const [key, count] of overlapKeyCount.entries()) {
		if (count <= 1) continue
		warnings.push({
			code: "overlapping_taxes",
			message: `Hay ${count} impuestos activos que se aplican ${key === "included:stay" ? "dentro del precio por estadía" : "sobre el mismo contexto de reserva"}. Revisa sus alcances antes de vender.`,
			meta: { key, count },
		})
	}

	return warnings
}
