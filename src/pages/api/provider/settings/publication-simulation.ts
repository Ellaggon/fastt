import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import {
	evaluateProviderGovernance,
	readProviderGovernanceFromConfigurationState,
} from "@/lib/provider-governance"
import { listTaxFeeDefinitionsByProviderUseCase } from "@/container/taxes-fees.container"
import { buildTaxFeeWarnings } from "@/modules/taxes-fees/public"

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

export const GET: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request)
	if (!user?.id) return json({ error: "Unauthorized" }, 401)

	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) return json({ error: "Provider not found" }, 404)

	const governance =
		(await readProviderGovernanceFromConfigurationState(providerId, { currentUserId: user.id })) ??
		(await evaluateProviderGovernance(providerId, {
			currentUserId: user.id,
			persist: true,
		}))
	const taxFeeResult = await listTaxFeeDefinitionsByProviderUseCase({ providerId }).catch(() => ({
		definitions: [],
	}))
	const definitions = taxFeeResult.definitions ?? []
	const warnings = buildTaxFeeWarnings(definitions)
	const fiscalReady =
		governance.readiness.find((item) => item.id === "fiscality")?.complete ?? false
	const paymentsReady =
		governance.readiness.find((item) => item.id === "payments")?.complete ?? false
	const baseAmount = 100
	const estimatedTax = fiscalReady && definitions.length > 0 ? 13 : 0

	return json({
		baseAmount,
		estimatedTax,
		estimatedPayout: paymentsReady ? baseAmount + estimatedTax : 0,
		currency: "USD",
		canPublishSafely: governance.capabilities.publish && governance.capabilities.payments,
		fiscalReady,
		paymentsReady,
		taxDefinitionCount: definitions.length,
		warningsCount: warnings.length,
		blockers: governance.blockers.filter((blocker) =>
			blocker.capabilities.some((capability) => ["publish", "payments"].includes(capability))
		),
	})
}
