import type {
	ResolvedTaxFeeDefinition,
	TaxFeeBreakdown,
	TaxFeeLine,
} from "../../domain/tax-fee.types"

function roundMoney(value: number, decimals = 2): number {
	const factor = 10 ** decimals
	return Math.round(value * factor) / factor
}

function resolveMultiplier(
	def: ResolvedTaxFeeDefinition["definition"],
	params: { nights: number; guests: number }
): number | null {
	switch (def.appliesPer) {
		case "stay":
			return 1
		case "night":
			return params.nights
		case "guest":
			return params.guests
		case "guest_night":
			return params.guests * params.nights
		default:
			return null
	}
}

export function computeTaxBreakdown(params: {
	base: number
	definitions: ResolvedTaxFeeDefinition[]
	nights: number
	guests: number
}): TaxFeeBreakdown {
	const taxesIncluded: TaxFeeLine[] = []
	const taxesExcluded: TaxFeeLine[] = []
	const feesIncluded: TaxFeeLine[] = []
	const feesExcluded: TaxFeeLine[] = []

	for (const resolved of params.definitions) {
		const def = resolved.definition
		if (!def || def.status !== "active") continue
		if (def.value <= 0) continue

		if (def.calculationType === "percentage" && def.currency) continue
		if (def.calculationType === "fixed" && !def.currency) continue

		let amount: number
		if (def.calculationType === "percentage") {
			amount = (params.base * def.value) / 100
		} else if (def.calculationType === "fixed") {
			const multiplier = resolveMultiplier(def, {
				nights: params.nights,
				guests: params.guests,
			})
			if (multiplier == null) continue
			amount = def.value * multiplier
		} else {
			continue
		}

		const line: TaxFeeLine = {
			definitionId: def.id,
			code: def.code,
			name: def.name,
			kind: def.kind,
			calculationType: def.calculationType,
			value: def.value,
			currency: def.currency,
			inclusionType: def.inclusionType,
			appliesPer: def.appliesPer,
			priority: def.priority,
			amount: roundMoney(amount),
			source: resolved.source,
		}

		if (def.kind === "tax") {
			if (def.inclusionType === "included") taxesIncluded.push(line)
			else taxesExcluded.push(line)
		} else {
			if (def.inclusionType === "included") feesIncluded.push(line)
			else feesExcluded.push(line)
		}
	}

	const sum = (lines: TaxFeeLine[]) => lines.reduce((acc, l) => roundMoney(acc + l.amount), 0)

	const excludedTotal = roundMoney(sum(taxesExcluded) + sum(feesExcluded))
	const total = roundMoney(params.base + excludedTotal)

	console.info("tax.compute", {
		base: params.base,
		definitions: params.definitions.length,
		excludedTotal,
		total,
	})

	return {
		base: roundMoney(params.base),
		taxes: { included: taxesIncluded, excluded: taxesExcluded },
		fees: { included: feesIncluded, excluded: feesExcluded },
		total,
	}
}
