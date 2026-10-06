import type { CommercialLine } from "@/lib/verification/commercial-lines"
import { commercialLineForProductType } from "@/lib/verification/commercial-lines"
import { getVerticalVocabulary } from "@/lib/verticalVocabulary"

/**
 * Placeholder until provider+line acceptance is persisted with its own version. A snapshot
 * frozen under this version cannot be verified against an accepted agreement and the read
 * model reports it as `commission_agreement_undeclared`.
 */
export const COMMISSION_AGREEMENT_VERSION_UNDECLARED = "undeclared"

export function defaultCommissionAgreementVersion(line: CommercialLine): string {
	return `${line}:v1`
}

export function isCommissionAgreementDeclared(version: string | null | undefined): boolean {
	const normalized = String(version ?? "").trim()
	return normalized.length > 0 && normalized !== COMMISSION_AGREEMENT_VERSION_UNDECLARED
}

export function resolveBookingCommercialLine(productType: unknown): CommercialLine | null {
	return commercialLineForProductType(productType)
}

export type CommercialLineSourceRow = {
	productType?: unknown
	productTypeFallback?: unknown
}

/**
 * The booking line is immutable: it comes from the product referenced by the line item snapshot.
 * The live catalog (`productType`) is only an accelerator; `productTypeFallback` covers the case
 * where the variant was removed but the product still exists.
 */
export function resolveBookingCommercialLineFromRows(
	rows: readonly CommercialLineSourceRow[]
): CommercialLine | null {
	for (const row of rows) {
		const line = resolveBookingCommercialLine(row.productType)
		if (line) return line
	}
	for (const row of rows) {
		const line = resolveBookingCommercialLine(row.productTypeFallback)
		if (line) return line
	}
	return null
}

export type ResolvedCommissionAgreement = {
	commercialLine: CommercialLine | null
	agreementVersion: string
}

/**
 * Resolves the agreement a commission snapshot must be frozen under. Only a line the provider
 * has enrolled counts as accepted; anything else is explicitly undeclared so it never silently
 * inherits another line's conditions.
 */
export function resolveCommissionAgreement(input: {
	commercialLine: CommercialLine | null
	enrolledLines: readonly CommercialLine[]
}): ResolvedCommissionAgreement {
	const line = input.commercialLine
	if (line && input.enrolledLines.includes(line)) {
		return { commercialLine: line, agreementVersion: defaultCommissionAgreementVersion(line) }
	}
	return { commercialLine: line, agreementVersion: COMMISSION_AGREEMENT_VERSION_UNDECLARED }
}

export function verticalForCommercialLine(line: CommercialLine): "tour" | "hotel" {
	return line === "tour" ? "tour" : "hotel"
}

export function commercialLineSummaryLabel(line: CommercialLine): string {
	const plural = getVerticalVocabulary(verticalForCommercialLine(line)).productPlural
	return plural.charAt(0).toUpperCase() + plural.slice(1)
}
