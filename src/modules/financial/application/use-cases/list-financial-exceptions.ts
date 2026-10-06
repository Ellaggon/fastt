import type { FinancialExceptionRepositoryPort } from "../ports/FinancialWorkflowRepositoryPort"
import type {
	FinancialExceptionCode,
	FinancialExceptionRecord,
	FinancialExceptionStatus,
} from "../../domain/financial-exception-record"

export async function listFinancialExceptions(
	deps: { exceptions: FinancialExceptionRepositoryPort },
	input: {
		providerId: string
		status?: FinancialExceptionStatus | "all"
		code?: FinancialExceptionCode | "all"
		nextOwner?: string | "all"
		bookingId?: string
		limit?: number
	}
): Promise<FinancialExceptionRecord[]> {
	return deps.exceptions.findByProvider(input)
}
