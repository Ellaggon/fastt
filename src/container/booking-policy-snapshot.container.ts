import { snapshotPoliciesForBooking } from "@/modules/booking/application/use-cases/snapshot-policies-for-booking"
import { BookingPolicySnapshotRepository } from "@/modules/booking/infrastructure/repositories/BookingPolicySnapshotRepository"
import { resolveEffectivePolicies } from "@/modules/policies/public"
import { resolvePolicyExceptionRulesUseCase } from "@/container/policy-exceptions.container"

const bookingPolicySnapshotRepo = new BookingPolicySnapshotRepository()

export async function snapshotPoliciesForBookingUseCase(
	input: Parameters<typeof snapshotPoliciesForBooking>[1]
) {
	return snapshotPoliciesForBooking(
		{
			repo: bookingPolicySnapshotRepo,
			resolveEffectivePolicies: (ctx) => resolveEffectivePolicies(ctx),
			resolvePolicyExceptionRules: (ctx) => resolvePolicyExceptionRulesUseCase(ctx),
		},
		input
	)
}
