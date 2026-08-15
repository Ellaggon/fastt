import type {
	ResolvedTaxFeeDefinition,
	TaxFeeBreakdown,
	TaxFeeJurisdictionRule,
	TaxFeeLine,
} from "../../domain/tax-fee.types"

function roundMoney(value: number, decimals = 2): number {
	const factor = 10 ** decimals
	return Math.round(value * factor) / factor
}

function readRule(value: unknown): TaxFeeJurisdictionRule {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {}
	const raw = value as Record<string, unknown>
	const seasons = Array.isArray(raw.seasons)
		? raw.seasons
				.map((season) => (season && typeof season === "object" ? season : null))
				.filter(Boolean)
				.map((season: any) => ({
					from: String(season.from ?? ""),
					to: String(season.to ?? ""),
					value: Number.isFinite(Number(season.value)) ? Number(season.value) : null,
				}))
				.filter((season) => season.from && season.to && season.from <= season.to)
		: []
	return {
		country: raw.country ? String(raw.country).toUpperCase() : undefined,
		region: raw.region ? String(raw.region).toUpperCase() : undefined,
		city: raw.city ? String(raw.city).toUpperCase() : undefined,
		collectionResponsibility: ["provider", "platform", "marketplace"].includes(
			String(raw.collectionResponsibility)
		)
			? (raw.collectionResponsibility as TaxFeeJurisdictionRule["collectionResponsibility"])
			: "provider",
		taxableBase: raw.taxableBase === "base_plus_included" ? "base_plus_included" : "booking_base",
		exemptGuestResidenceCountries: Array.isArray(raw.exemptGuestResidenceCountries)
			? raw.exemptGuestResidenceCountries
					.map((country) => String(country).toUpperCase())
					.filter(Boolean)
			: [],
		maxAmount: Number.isFinite(Number(raw.maxAmount)) ? Math.max(0, Number(raw.maxAmount)) : null,
		maxNights: Number.isFinite(Number(raw.maxNights)) ? Math.max(0, Number(raw.maxNights)) : null,
		seasonalMode: raw.seasonalMode === "override" ? "override" : "restrict",
		seasons,
	}
}

function resolveMultiplier(
	def: ResolvedTaxFeeDefinition["definition"],
	params: { nights: number; guests: number; maxNights?: number | null }
): number | null {
	const nights = params.maxNights ? Math.min(params.nights, params.maxNights) : params.nights
	switch (def.appliesPer) {
		case "stay":
			return 1
		case "night":
			return nights
		case "guest":
			return params.guests
		case "guest_night":
			return params.guests * nights
		default:
			return null
	}
}

export function computeTaxBreakdown(params: {
	base: number
	definitions: ResolvedTaxFeeDefinition[]
	nights: number
	guests: number
	context?: {
		country?: string | null
		region?: string | null
		city?: string | null
		guestResidenceCountry?: string | null
		checkIn?: string | null
	}
}): TaxFeeBreakdown {
	const taxesIncluded: TaxFeeLine[] = []
	const taxesExcluded: TaxFeeLine[] = []
	const feesIncluded: TaxFeeLine[] = []
	const feesExcluded: TaxFeeLine[] = []

	for (const resolved of params.definitions) {
		const def = resolved.definition
		const rule = readRule(def?.jurisdictionJson)
		if (!def || def.status !== "active") continue
		if (def.value <= 0) continue

		if (def.calculationType === "percentage" && def.currency) continue
		if (def.calculationType === "fixed" && !def.currency) continue

		const country = String(params.context?.country ?? "").toUpperCase()
		const region = String(params.context?.region ?? "").toUpperCase()
		const city = String(params.context?.city ?? "").toUpperCase()
		if (
			(rule.country && rule.country !== country) ||
			(rule.region && rule.region !== region) ||
			(rule.city && rule.city !== city)
		)
			continue
		if (
			rule.exemptGuestResidenceCountries?.includes(
				String(params.context?.guestResidenceCountry ?? "").toUpperCase()
			)
		)
			continue
		const activeSeason = rule.seasons?.length
			? rule.seasons.find((season) => {
					const checkIn = String(params.context?.checkIn ?? "")
					return checkIn >= season.from && checkIn <= season.to
				})
			: undefined
		if (rule.seasons?.length && rule.seasonalMode !== "override" && !activeSeason) continue
		const value = activeSeason?.value ?? def.value
		let amount: number
		if (def.calculationType === "percentage") {
			const includedTaxableAmount = roundMoney(
				taxesIncluded.concat(feesIncluded).reduce((sum, line) => sum + line.amount, 0)
			)
			const taxableBase =
				rule.taxableBase === "base_plus_included"
					? roundMoney(params.base + includedTaxableAmount)
					: params.base
			amount = (taxableBase * value) / 100
		} else if (def.calculationType === "fixed") {
			const multiplier = resolveMultiplier(def, {
				nights: params.nights,
				guests: params.guests,
				maxNights: rule.maxNights,
			})
			if (multiplier == null) continue
			amount = value * multiplier
		} else {
			continue
		}

		amount = rule.maxAmount != null ? Math.min(amount, rule.maxAmount) : amount
		const line: TaxFeeLine = {
			definitionId: def.id,
			code: def.code,
			name: def.name,
			kind: def.kind,
			calculationType: def.calculationType,
			value,
			currency: def.currency,
			inclusionType: def.inclusionType,
			appliesPer: def.appliesPer,
			priority: def.priority,
			amount: roundMoney(amount),
			collectionResponsibility: rule.collectionResponsibility ?? "provider",
			taxableBase: rule.taxableBase ?? "booking_base",
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
