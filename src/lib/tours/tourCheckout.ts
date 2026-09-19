import {
	and,
	asc,
	db,
	eq,
	first,
	Hold,
	Product,
	RatePlan,
	TourBookingQuestion,
	TourSlotProfile,
	Variant,
} from "@/shared/infrastructure/db/compat"
import { isHoldCommercialSnapshot, type HoldCommercialSnapshot } from "@/modules/inventory/public"
import type { HoldPolicySnapshot } from "@/modules/policies/public"
import { buildTourPaymentTerms } from "./tour-payment-terms"
import { readTourBookingQuestionSnapshot } from "./tourBookingQuestionsSnapshot"

export type TourCheckoutQuestion = {
	id: string
	code: string
	label: string
	required: boolean
}

export type TourCheckoutHold = {
	holdId: string
	expiresAt: Date
	productId: string
	productName: string
	variantId: string
	variantName: string
	ratePlanId: string
	ratePlanName: string
	departureTime: string | null
	languageCode: string | null
	commercial: HoldCommercialSnapshot
	policy: HoldPolicySnapshot
	payment: ReturnType<typeof buildTourPaymentTerms>
	questions: TourCheckoutQuestion[]
}

export function buildTourSelectionPath(checkout: TourCheckoutHold): string {
	const occupancy = checkout.commercial.occupancyDetail
	const params = new URLSearchParams({
		departure: checkout.commercial.from,
		adults: String(occupancy.adults),
		children: String(occupancy.children),
		infants: String(occupancy.infants),
		variantId: checkout.variantId,
		ratePlanId: checkout.ratePlanId,
	})
	return `/tours/${encodeURIComponent(checkout.productId)}?${params.toString()}`
}

/**
 * Reads the immutable commercial record created with the hold. Checkout must
 * never recompute price, availability or policy from the current catalog.
 */
export async function loadTourCheckoutHold(holdId: string): Promise<TourCheckoutHold | null> {
	const id = String(holdId ?? "").trim()
	if (!id) return null

	const row = await db
		.select({
			holdId: Hold.id,
			expiresAt: Hold.expiresAt,
			policySnapshotJson: Hold.policySnapshotJson,
			commercialSnapshotJson: Hold.commercialSnapshotJson,
			guestExpectationsSnapshotJson: Hold.guestExpectationsSnapshotJson,
			productId: Product.id,
			productName: Product.name,
			variantId: Variant.id,
			variantName: Variant.name,
			ratePlanId: RatePlan.id,
			ratePlanName: RatePlan.name,
			departureTime: TourSlotProfile.departureTime,
			languageCode: TourSlotProfile.languageCode,
		})
		.from(Hold)
		.innerJoin(Variant, eq(Variant.id, Hold.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.innerJoin(RatePlan, eq(RatePlan.id, Hold.ratePlanId))
		.leftJoin(TourSlotProfile, eq(TourSlotProfile.variantId, Variant.id))
		.where(and(eq(Hold.id, id), eq(Variant.kind, "tour_slot")))
		.then(first)

	if (!row || !isHoldCommercialSnapshot(row.commercialSnapshotJson)) return null
	const policy = row.policySnapshotJson as HoldPolicySnapshot | null
	if (!policy || typeof policy !== "object") return null

	const snapshottedQuestions = readTourBookingQuestionSnapshot(row.guestExpectationsSnapshotJson)
	const questions =
		snapshottedQuestions ??
		(await db
			.select({
				id: TourBookingQuestion.id,
				code: TourBookingQuestion.code,
				label: TourBookingQuestion.label,
				required: TourBookingQuestion.isRequired,
			})
			.from(TourBookingQuestion)
			.where(eq(TourBookingQuestion.productId, row.productId))
			.orderBy(asc(TourBookingQuestion.sortOrder)))

	return {
		holdId: String(row.holdId),
		expiresAt: new Date(row.expiresAt),
		productId: String(row.productId),
		productName: String(row.productName ?? "Experiencia"),
		variantId: String(row.variantId),
		variantName: String(row.variantName ?? "Salida"),
		ratePlanId: String(row.ratePlanId),
		ratePlanName: String(row.ratePlanName ?? "Tarifa"),
		departureTime: row.departureTime == null ? null : String(row.departureTime),
		languageCode: row.languageCode == null ? null : String(row.languageCode),
		commercial: row.commercialSnapshotJson,
		policy,
		payment: buildTourPaymentTerms(policy),
		questions: questions.map((question) => ({
			id: String(question.id),
			code: String(question.code),
			label: String(question.label),
			required: Boolean(question.required),
		})),
	}
}
