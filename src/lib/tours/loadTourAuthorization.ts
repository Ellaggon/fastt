import { productRepository } from "@/container"
import { evaluateProviderGovernance } from "@/lib/provider-governance"
import { loadProductLineGate } from "@/lib/verification/line-gate"
import { resolveProductCommercialDiagnosis } from "@/lib/commercial-policy/enforcement"
import { commercialBlockerIsWaiting, tourCommercialAction } from "./tourCommercialNavigation"
import { experienceRequirementsHref } from "@/lib/verification/experience-requirements-navigation"
import { commercialAgreementStatus } from "@/modules/financial/commercial-agreements"
import { projectAuthorizationDecisions } from "./tourPublicationDecisions"
import { classifyCommercialFinding } from "@/lib/commercial-policy/findings"
import { commercialReadOnce, withCommercialReadScope } from "@/lib/commercial-policy/read-scope"

/** Uses the same product-scoped evidence and signed policy used by publication. */
export async function loadTourAuthorization(input: { providerId: string; productId: string }) {
	return withCommercialReadScope(() => loadAuthorization(input))
}

async function loadAuthorization(input: { providerId: string; productId: string }) {
	const [lineRead, commercialRead, providerRead, publicationRead, agreementRead] =
		await Promise.allSettled([
			loadProductLineGate({ ...input, capability: "publish" }),
			resolveProductCommercialDiagnosis(input),
			evaluateProviderGovernance(input.providerId, { persist: false }),
			productRepository.getProductPublicationEligibility(input.productId),
			commercialReadOnce(`agreement:${input.providerId}`, () =>
				commercialAgreementStatus(input.providerId)
			),
		])
	const line = lineRead.status === "fulfilled" ? lineRead.value : { allowed: false, blockers: [] }
	const commercial = commercialRead.status === "fulfilled" ? commercialRead.value : null
	const provider =
		providerRead.status === "fulfilled"
			? providerRead.value
			: { capabilities: { publish: false }, blockers: [] }
	const publication =
		publicationRead.status === "fulfilled"
			? publicationRead.value
			: { eligible: false, reason: "read_failed" }
	const agreement = agreementRead.status === "fulfilled" ? agreementRead.value : null
	const shared = [
		...line.blockers.filter((blocker) => blocker.layer === "shared"),
		...provider.blockers.filter((blocker) => blocker.capabilities.includes("publish")),
	]
	const specific = line.blockers.filter((blocker) => blocker.layer !== "shared")
	const policy =
		commercial?.diagnosis.blockers.filter((blocker) => blocker.capabilities.includes("publish")) ??
		[]
	const verificationHref = `/provider/settings/verification?${new URLSearchParams({ line: "tour", experience: input.productId })}`
	const firstShared = provider.blockers.find((blocker) => blocker.capabilities.includes("publish"))
	const firstPolicy =
		policy.find((blocker) => !classifyCommercialFinding(blocker).waiting) ?? policy[0]
	const commercialAction = firstPolicy
		? tourCommercialAction(firstPolicy.id, input.productId)
		: null
	const fasttDecision = Boolean(firstPolicy && commercialBlockerIsWaiting(firstPolicy.id))
	const decisions = projectAuthorizationDecisions({
		productId: input.productId,
		policy: commercial?.diagnosis ?? null,
		verification:
			lineRead.status === "fulfilled" && providerRead.status === "fulfilled"
				? {
						ready:
							shared.length === 0 &&
							specific.length === 0 &&
							provider.capabilities.publish &&
							line.allowed,
						businessReady: shared.length === 0 && provider.capabilities.publish,
						labels: [...shared, ...specific].map((b) => b.label),
					}
				: null,
		agreement: agreement
			? { state: agreement.state, hasProposal: agreement.agreement !== null }
			: null,
	})
	if (!publication.eligible) {
		decisions[0] = {
			...decisions[0],
			tone: "neutral",
			status:
				publicationRead.status === "rejected"
					? "No se pudo comprobar"
					: "Publicación no habilitada",
			message:
				publicationRead.status === "rejected"
					? "No se pudo comprobar si esta ficha es apta para publicación. Vuelve a intentar."
					: publication.reason === "provider_not_commercial"
						? "El negocio no está habilitado para uso comercial."
						: "Esta ficha pertenece a datos no aptos para publicación pública.",
			actions: [],
		}
	}
	return {
		decisions,
		provider_authorization: {
			...(providerRead.status === "rejected" || lineRead.status === "rejected"
				? { code: "read_failed" }
				: {}),
			ready:
				lineRead.status === "fulfilled" &&
				providerRead.status === "fulfilled" &&
				shared.length === 0 &&
				provider.capabilities.publish,
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
			...(commercialRead.status === "rejected" ||
			lineRead.status === "rejected" ||
			publicationRead.status === "rejected"
				? { code: "read_failed" }
				: {}),
			ready:
				specific.length === 0 &&
				Boolean(commercial?.diagnosis.capabilities.publish) &&
				line.allowed &&
				publication.eligible,
			responsible: fasttDecision ? ("fastt" as const) : ("provider" as const),
			code:
				commercialRead.status === "rejected" ||
				lineRead.status === "rejected" ||
				publicationRead.status === "rejected"
					? "read_failed"
					: (firstPolicy?.id ?? specific[0]?.id),
			action: commercialAction ?? {
				label: fasttDecision ? "Consultar evaluación" : "Revisar experiencia",
				href: experienceRequirementsHref(input.productId),
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
										? "Declara cómo cobra tu negocio y revisa el acuerdo comercial."
										: blocker.action
						),
					]),
				].join(" · ") || "Revisa los requisitos de esta experiencia.",
		},
	}
}
