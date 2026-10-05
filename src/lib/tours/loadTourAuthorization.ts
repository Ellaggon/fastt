import { productRepository } from "@/container"
import { evaluateProviderGovernance } from "@/lib/provider-governance"
import { loadProductLineGate } from "@/lib/verification/line-gate"
import { resolveProductCommercialDiagnosis } from "@/lib/commercial-policy/enforcement"

/** Uses the same product-scoped evidence and signed policy used by publication. */
export async function loadTourAuthorization(input: { providerId: string; productId: string }) {
	const [line, commercial, provider, publication] = await Promise.all([
		loadProductLineGate({ ...input, capability: "publish" }),
		resolveProductCommercialDiagnosis(input),
		evaluateProviderGovernance(input.providerId, { persist: false }),
		productRepository.getProductPublicationEligibility(input.productId),
	])
	const shared = [
		...line.blockers.filter((blocker) => blocker.layer === "shared"),
		...provider.blockers.filter((blocker) => blocker.capabilities.includes("publish")),
	]
	const specific = line.blockers.filter((blocker) => blocker.layer !== "shared")
	const policy = commercial.diagnosis.blockers.filter((blocker) =>
		blocker.capabilities.includes("publish")
	)
	const verificationHref = `/provider/settings/verification?${new URLSearchParams({ line: "tour", experience: input.productId })}`
	const firstShared = provider.blockers.find((blocker) => blocker.capabilities.includes("publish"))
	const firstPolicy = policy[0]
	const fasttDecision =
		firstPolicy &&
		/^(policy_context_(unsupported|conflict)|policy_contract_empty|collection_model_undecided)/.test(
			firstPolicy.id
		)
	return {
		provider_authorization: {
			ready: shared.length === 0 && provider.capabilities.publish,
			action: {
				label: "Revisar verificación",
				href:
					firstShared?.href?.startsWith("/") && !firstShared.href.startsWith("//")
						? firstShared.href
						: verificationHref,
			},
			message: shared.length
				? `Requisitos pendientes: ${[...new Set(shared.map((blocker) => blocker.label))].join(" · ")}`
				: "Revisa la habilitación de la cuenta.",
		},
		experience_authorization: {
			ready:
				specific.length === 0 &&
				commercial.diagnosis.capabilities.publish &&
				line.allowed &&
				publication.eligible,
			responsible: fasttDecision ? ("fastt" as const) : ("provider" as const),
			code: firstPolicy?.id ?? specific[0]?.id,
			action: {
				label: fasttDecision ? "Consultar pendiente de Fastt" : "Revisar experiencia",
				href: verificationHref,
			},
			message:
				[
					...new Set([
						...(!publication.eligible
							? [
									publication.reason === "provider_not_commercial"
										? "El negocio no está habilitado para uso comercial."
										: "Esta ficha pertenece a datos no aptos para publicación pública.",
								]
							: []),
						...specific.map((blocker) => blocker.label),
						...policy.map((blocker) =>
							/^policy_context_(unsupported|conflict)/.test(blocker.id)
								? "Fastt debe revisar las políticas comerciales aplicables a esta combinación."
								: /^policy_contract_empty/.test(blocker.id)
									? "Fastt debe completar los requisitos de la política comercial aprobada."
									: /^collection_model_undecided/.test(blocker.id)
										? "Fastt debe definir el modelo de cobro aplicable."
										: blocker.action
						),
					]),
				].join(" · ") || "Revisa los requisitos de esta experiencia.",
		},
	}
}
