import { registerFinancialShadowWrite } from "@/modules/financial/application/use-cases/register-financial-shadow-write"
import { FinancialRepository } from "@/modules/financial/infrastructure/repositories/FinancialRepository"
import type { RegisterFinancialShadowWriteInput } from "@/modules/financial/public"

export const financialRepository = new FinancialRepository()

export function registerFinancialShadowWriteUseCase(input: RegisterFinancialShadowWriteInput) {
	return registerFinancialShadowWrite(input)
}
