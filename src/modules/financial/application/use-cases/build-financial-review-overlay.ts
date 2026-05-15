import { isActiveFinancialExceptionStatus } from "../../domain/financial-exception-record"
import type {
	FinancialExceptionCode,
	FinancialExceptionRecord,
	FinancialExceptionStatus,
} from "../../domain/financial-exception-record"
import type { DetectedFinancialException } from "./detect-financial-exceptions"

export type FinancialReviewOverlaySource = "persisted" | "derived_only" | "persisted_overlay"

export const FINANCIAL_REVIEW_OVERLAY_SOURCES = {
	persisted: "persisted",
	derivedOnly: "derived_only",
	persistedOverlay: "persisted_overlay",
} as const

export type OverlayFinancialException = Omit<
	FinancialExceptionRecord,
	"id" | "openedAt" | "createdAt" | "updatedAt"
> & {
	id: string
	openedAt: Date | null
	createdAt: Date | null
	updatedAt: Date | null
	overlaySource: FinancialReviewOverlaySource
	persistedId: string | null
	derived: boolean
}

export type FinancialReviewOverlayFilter = {
	status: FinancialExceptionStatus | "all"
	code: FinancialExceptionCode | "all"
	nextOwner: string | "all"
	bookingId?: string
	limit: number
}

export function financialExceptionOverlayKey(input: { bookingId: string; code: string }): string {
	return `${input.bookingId}::${input.code}`
}

function derivedToOverlay(item: DetectedFinancialException): OverlayFinancialException {
	return {
		id: `derived:${item.bookingId}:${item.code}`,
		bookingId: item.bookingId,
		providerId: item.providerId,
		code: item.code,
		severity: item.severity,
		status: "open",
		basis: item.basis,
		reason: item.reason,
		nextOwner: item.nextOwner,
		source: item.source,
		openedAt: null,
		acknowledgedAt: null,
		resolvedAt: null,
		resolvedBy: null,
		resolutionNote: null,
		createdAt: null,
		updatedAt: null,
		overlaySource: FINANCIAL_REVIEW_OVERLAY_SOURCES.derivedOnly,
		persistedId: null,
		derived: true,
	}
}

function persistedToOverlay(
	item: FinancialExceptionRecord,
	derivedStillPresent: boolean
): OverlayFinancialException {
	return {
		...item,
		id: item.id,
		overlaySource: derivedStillPresent
			? FINANCIAL_REVIEW_OVERLAY_SOURCES.persistedOverlay
			: FINANCIAL_REVIEW_OVERLAY_SOURCES.persisted,
		persistedId: item.id,
		derived: derivedStillPresent,
	}
}

export function buildFinancialReviewOverlay(params: {
	persisted: FinancialExceptionRecord[]
	derived: DetectedFinancialException[]
	filter: FinancialReviewOverlayFilter
}): OverlayFinancialException[] {
	const persistedByKey = new Map(
		params.persisted.map((item) => [financialExceptionOverlayKey(item), item])
	)
	const overlay: OverlayFinancialException[] = params.persisted.map((item) =>
		persistedToOverlay(item, false)
	)

	for (const item of params.derived) {
		const persisted = persistedByKey.get(financialExceptionOverlayKey(item))
		if (persisted) {
			if (!isActiveFinancialExceptionStatus(persisted.status)) continue
			const existingIndex = overlay.findIndex((entry) => entry.id === persisted.id)
			const overlayItem: OverlayFinancialException = {
				...persistedToOverlay(persisted, true),
				reason: persisted.reason || item.reason,
				nextOwner: persisted.nextOwner || item.nextOwner,
			}
			if (existingIndex >= 0) overlay[existingIndex] = overlayItem
			else overlay.push(overlayItem)
			continue
		}

		overlay.push(derivedToOverlay(item))
	}

	return overlay
		.filter((item) =>
			params.filter.status === "all" ? true : item.status === params.filter.status
		)
		.filter((item) => (params.filter.code === "all" ? true : item.code === params.filter.code))
		.filter((item) =>
			params.filter.nextOwner === "all" ? true : item.nextOwner === params.filter.nextOwner
		)
		.filter((item) => (params.filter.bookingId ? item.bookingId === params.filter.bookingId : true))
		.slice(0, params.filter.limit)
}
