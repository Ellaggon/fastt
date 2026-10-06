import type { ResolvedCommissionAgreement } from "@/lib/financial/commissionAgreement"

import type { CommissionSnapshot } from "../../domain/commission-snapshot"
import type {
	CommissionSnapshotCreateInput,
	CommissionSnapshotRepositoryPort,
} from "../ports/ProviderFinanceRepositoryPort"

export type CommissionAgreementResolver = (input: {
	providerId: string
	bookingId: string
}) => Promise<ResolvedCommissionAgreement>

export type CreateCommissionSnapshotInput = Omit<
	CommissionSnapshotCreateInput,
	"commercialLine" | "agreementVersion"
>

/**
 * Single write path for commission snapshots. The commercial line and agreement version are
 * never supplied by the caller: they are resolved from the booking's immutable line snapshot
 * and the provider's accepted lines, so a snapshot cannot be frozen under the wrong agreement.
 */
export async function createCommissionSnapshotForBooking(
	deps: {
		commissionSnapshots: CommissionSnapshotRepositoryPort
		resolveAgreement: CommissionAgreementResolver
	},
	input: CreateCommissionSnapshotInput
): Promise<{
	snapshot: CommissionSnapshot
	created: boolean
	agreement: ResolvedCommissionAgreement
}> {
	const agreement = await deps.resolveAgreement({
		providerId: input.providerId,
		bookingId: input.bookingId,
	})
	const result = await deps.commissionSnapshots.createIfAbsent({
		...input,
		commercialLine: agreement.commercialLine,
		agreementVersion: agreement.agreementVersion,
	})
	return { ...result, agreement }
}
