import { PolicyQueryRepositoryCapa6 } from "@/modules/policies/infrastructure/repositories/PolicyQueryRepositoryCapa6"

const policyQueryRepoCapa6 = new PolicyQueryRepositoryCapa6()

export async function getPolicyDetailCapa6UseCase(policyId: string) {
	return policyQueryRepoCapa6.getPolicyDetailById(policyId)
}
