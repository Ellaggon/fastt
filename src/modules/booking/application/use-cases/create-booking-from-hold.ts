import type {
	BookingFromHoldRepositoryPort,
	CreateBookingFromHoldInput,
	CreateBookingFromHoldResult,
	ResolveEffectiveTaxFeesFn,
} from "@/modules/booking/application/ports/BookingFromHoldRepositoryPort"

export type { CreateBookingFromHoldInput, CreateBookingFromHoldResult }

export async function createBookingFromHold(
	deps: {
		repository: BookingFromHoldRepositoryPort
		resolveEffectiveTaxFees: ResolveEffectiveTaxFeesFn
	},
	input: CreateBookingFromHoldInput
): Promise<CreateBookingFromHoldResult> {
	return deps.repository.createBookingFromHold({
		resolveEffectiveTaxFees: deps.resolveEffectiveTaxFees,
		input,
	})
}
