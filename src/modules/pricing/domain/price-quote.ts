import { createHash } from "node:crypto"

import type { TaxFeeBreakdown, TaxFeeLine } from "@/modules/taxes-fees/public"

export const PRICE_QUOTE_VERSION = "price_quote_v1" as const

export type PriceQuote = {
	version: typeof PRICE_QUOTE_VERSION
	quoteId: string
	issuedAt: string
	source: "search" | "hold" | "simulation" | "legacy_hold_snapshot"
	context: {
		productId: string
		variantId: string
		ratePlanId: string
		checkIn: string
		checkOut: string
		rooms: number
		occupancy: { adults: number; children: number; infants: number }
		channel: string
	}
	currency: string
	nights: number
	baseAmount: number
	taxesAndFees: TaxFeeBreakdown
	totalAmount: number
	pricing: {
		days: Array<{ date: string; price: number }>
		breakdownV2?: {
			base: number
			occupancyAdjustment: number
			rules: number
			final: number
		} | null
		source: "v2" | "materialized_search_view" | "legacy"
	}
}

function money(value: number): number {
	return Number(Number(value).toFixed(2))
}

function normalizeLine(line: TaxFeeLine) {
	return {
		definitionId: String(line.definitionId),
		code: String(line.code),
		name: String(line.name),
		kind: String(line.kind),
		calculationType: String(line.calculationType),
		value: money(line.value),
		currency: line.currency == null ? null : String(line.currency).toUpperCase(),
		inclusionType: String(line.inclusionType),
		appliesPer: String(line.appliesPer),
		priority: Number(line.priority),
		collectionResponsibility: String(line.collectionResponsibility),
		taxableBase: String(line.taxableBase),
		amount: money(line.amount),
		source: {
			scope: String(line.source.scope),
			scopeId: line.source.scopeId == null ? null : String(line.source.scopeId),
			definitionVersionId:
				line.source.definitionVersionId == null ? null : String(line.source.definitionVersionId),
		},
	}
}

/**
 * Guest-facing commercial terms that define quote identity. Engine provenance
 * remains on PriceQuote for auditability but cannot make search and hold disagree.
 */
function commercialQuotePayload(quote: Omit<PriceQuote, "quoteId" | "issuedAt" | "source">) {
	return {
		version: quote.version,
		identityVersion: "commercial_terms_v1",
		context: quote.context,
		currency: quote.currency,
		nights: quote.nights,
		baseAmount: quote.baseAmount,
		totalAmount: quote.totalAmount,
		pricing: {
			days: quote.pricing.days
				.map((day) => ({ date: String(day.date), price: money(day.price) }))
				.sort((a, b) => a.date.localeCompare(b.date)),
		},
		taxesAndFees: {
			base: money(quote.taxesAndFees.base),
			total: money(quote.taxesAndFees.total),
			taxes: {
				included: quote.taxesAndFees.taxes.included.map(normalizeLine).sort(sortLines),
				excluded: quote.taxesAndFees.taxes.excluded.map(normalizeLine).sort(sortLines),
			},
			fees: {
				included: quote.taxesAndFees.fees.included.map(normalizeLine).sort(sortLines),
				excluded: quote.taxesAndFees.fees.excluded.map(normalizeLine).sort(sortLines),
			},
		},
	}
}

function sortLines(a: ReturnType<typeof normalizeLine>, b: ReturnType<typeof normalizeLine>) {
	return `${a.code}:${a.definitionId}`.localeCompare(`${b.code}:${b.definitionId}`)
}

export function buildPriceQuote(
	input: Omit<PriceQuote, "version" | "quoteId" | "issuedAt" | "source" | "totalAmount"> & {
		source?: PriceQuote["source"]
		issuedAt?: string
	}
): PriceQuote {
	const quote = {
		version: PRICE_QUOTE_VERSION,
		context: {
			...input.context,
			rooms: Math.max(1, Math.round(input.context.rooms)),
			occupancy: {
				adults: Math.max(1, Math.round(input.context.occupancy.adults)),
				children: Math.max(0, Math.round(input.context.occupancy.children)),
				infants: Math.max(0, Math.round(input.context.occupancy.infants)),
			},
		},
		currency: String(input.currency ?? "USD").toUpperCase(),
		nights: Math.max(1, Math.round(input.nights)),
		baseAmount: money(input.baseAmount),
		taxesAndFees: input.taxesAndFees,
		totalAmount: money(input.taxesAndFees.total),
		pricing: {
			...input.pricing,
			days: input.pricing.days.map((day) => ({ date: String(day.date), price: money(day.price) })),
			breakdownV2: input.pricing.breakdownV2
				? {
						base: money(input.pricing.breakdownV2.base),
						occupancyAdjustment: money(input.pricing.breakdownV2.occupancyAdjustment),
						rules: money(input.pricing.breakdownV2.rules),
						final: money(input.pricing.breakdownV2.final),
					}
				: null,
		},
	} satisfies Omit<PriceQuote, "quoteId" | "issuedAt" | "source">
	const quoteId = createHash("sha256")
		.update(JSON.stringify(commercialQuotePayload(quote)))
		.digest("hex")
		.slice(0, 32)

	return {
		...quote,
		quoteId: `pq_${quoteId}`,
		issuedAt: input.issuedAt ?? new Date().toISOString(),
		source: input.source ?? "hold",
	}
}

export function isPriceQuote(value: unknown): value is PriceQuote {
	if (!value || typeof value !== "object") return false
	const quote = value as Partial<PriceQuote>
	return (
		quote.version === PRICE_QUOTE_VERSION &&
		typeof quote.quoteId === "string" &&
		quote.quoteId.startsWith("pq_") &&
		typeof quote.totalAmount === "number" &&
		Number.isFinite(quote.totalAmount) &&
		Boolean(quote.context?.productId) &&
		Boolean(quote.context?.variantId) &&
		Boolean(quote.context?.ratePlanId) &&
		Boolean(quote.taxesAndFees)
	)
}

export function quoteExtraAmount(quote: PriceQuote): number {
	return money(quote.totalAmount - quote.baseAmount)
}
