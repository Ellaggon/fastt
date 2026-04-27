import type { ResolvedTaxFeeDefinition } from "@/modules/taxes-fees/public"

export type CreateBookingFromHoldInput = {
	holdId: string
	userId?: string | null
	source?: string | null
}

export type CreateBookingFromHoldResult = {
	bookingId: string
	status: string
	idempotent: boolean
	variantId: string
	productId: string
	availabilityRange: {
		from: string
		to: string
	}
}

export type ResolveEffectiveTaxFeesFn = (params: {
	providerId?: string
	productId?: string
	variantId?: string
	ratePlanId?: string
	channel?: string | null
}) => Promise<{
	definitions: ResolvedTaxFeeDefinition[]
}>

export type BookingFromHoldRepositoryPort = {
	createBookingFromHold(params: {
		resolveEffectiveTaxFees: ResolveEffectiveTaxFeesFn
		input: CreateBookingFromHoldInput
	}): Promise<CreateBookingFromHoldResult>
}
