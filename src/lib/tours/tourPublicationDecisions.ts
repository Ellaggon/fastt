import type { CommercialPolicyDiagnosis } from "@/lib/commercial-policy/evaluate"
import { z } from "zod"

export const publicationDecisionSchema = z.object({
	id: z.enum(["admission", "verification", "agreement", "preparation"]),
	label: z.string(),
	status: z.string(),
	tone: z.enum(["success", "warning", "neutral"]),
	message: z.string(),
	actions: z.array(
		z.object({
			label: z.string(),
			href: z
				.string()
				.refine((href) => href.startsWith("/") && !href.startsWith("//") && !href.includes("\\")),
		})
	),
})
export type PublicationDecision = z.infer<typeof publicationDecisionSchema>

/** Read projection only. These rows never grant publication permission. */
export function projectAuthorizationDecisions(input: {
	productId: string
	policy: CommercialPolicyDiagnosis | null
	verification: { labels: string[]; ready: boolean; businessReady?: boolean } | null
	agreement: { state: string; hasProposal: boolean } | null
}): PublicationDecision[] {
	const experience = `/product/${encodeURIComponent(input.productId)}#experience-requirements`
	const payments = `/provider/settings/payments?${new URLSearchParams({ scope: "tour", productId: input.productId, returnTo: `/product/${input.productId}/preview` })}`
	const blockers = input.policy?.blockers.filter((b) => b.capabilities.includes("publish")) ?? []
	const configuration = blockers.filter(
		(b) => b.id.startsWith("policy_context_") || b.id.startsWith("policy_contract_")
	)
	const contextTask = blockers.find((b) =>
		[
			"experience_format_missing",
			"product_location_missing",
			"collection_model_undecided",
		].includes(b.id)
	)
	const coverageKnown =
		input.policy?.policyStatus === "supported" &&
		configuration.length === 0 &&
		(input.policy.policyVersionIds?.length ?? 0) > 0
	const evidence = blockers.filter(
		(b) =>
			!configuration.includes(b) &&
			!b.id.startsWith("agreement_") &&
			![
				"collection_model_undecided",
				"experience_format_missing",
				"product_location_missing",
			].includes(b.id)
	)
	const verificationReady = coverageKnown && input.verification?.ready && evidence.length === 0
	const inReview =
		evidence.length > 0 &&
		evidence.every(
			(b) => b.evidenceState === "pending_review" || b.id === "holder_declaration_in_review"
		)
	const agreement = input.agreement
	const agreementLabels: Record<string, string> = {
		active: "Vigente",
		disabled: "Contratación no habilitada",
		proposal_requested: "Pendiente de Fastt",
		acceptance_required: agreement?.hasProposal ? "Pendiente de aceptación" : "Sin acuerdo",
		expired: "Vencido",
		not_started: "Vigencia futura",
		review_required: "Requiere revisión",
	}
	return [
		{
			id: "admission",
			label: "Modalidad y territorio",
			status: coverageKnown
				? "Cobertura aprobada"
				: contextTask
					? "Faltan datos de operación"
					: configuration.length
						? "Pendiente de Fastt"
						: "No se pudo comprobar",
			tone: coverageKnown ? "success" : "neutral",
			message:
				contextTask?.action ??
				(coverageKnown
					? "Hay políticas aprobadas para la operación declarada."
					: "Fastt debe comprobar la cobertura de esta operación. No necesitas enviar documentos adicionales hasta que se indiquen."),
			actions: contextTask
				? [
						{
							label:
								contextTask.id === "collection_model_undecided"
									? "Configurar cobro"
									: "Completar operación",
							href: contextTask.id === "collection_model_undecided" ? payments : experience,
						},
					]
				: [],
		},
		{
			id: "verification",
			label: "Verificación y respaldos",
			status: !input.verification
				? "No se pudo comprobar"
				: inReview
					? "En revisión"
					: !coverageKnown
						? "Requisitos por definir"
						: verificationReady
							? "Verificado"
							: "Requiere información",
			tone: verificationReady ? "success" : coverageKnown ? "warning" : "neutral",
			message:
				[
					...new Set([...(input.verification?.labels ?? []), ...evidence.map((b) => b.action)]),
				].join(" · ") ||
				(input.verification?.businessReady && !coverageKnown
					? "Negocio: verificado. Experiencia: requisitos por definir por Fastt."
					: verificationReady
						? "Negocio y experiencia cumplen los respaldos evaluados."
						: "La verificación de la experiencia depende de los requisitos aplicables."),
			actions:
				input.verification &&
				!verificationReady &&
				!inReview &&
				(coverageKnown || !input.verification.businessReady)
					? [
							{
								label: "Ver verificación del negocio",
								href: `/provider/settings/verification?line=tour`,
							},
							...(coverageKnown
								? [{ label: "Revisar respaldos de la experiencia", href: experience }]
								: []),
						]
					: [],
		},
		{
			id: "agreement",
			label: "Acuerdo comercial",
			status: agreement
				? (agreementLabels[agreement.state] ?? "Requiere revisión")
				: "No se pudo comprobar",
			tone: agreement?.state === "active" ? "success" : "neutral",
			message:
				agreement?.state === "disabled"
					? "Fastt todavía no ha habilitado la contratación para esta línea. Declarar cobro directo no equivale a tener un acuerdo vigente."
					: "El acuerdo se gestiona para la línea Experiencias del negocio, no por cada ficha.",
			actions:
				agreement && agreement.state !== "disabled" && agreement.state !== "proposal_requested"
					? [
							{
								label:
									agreement.state === "acceptance_required" && agreement.hasProposal
										? "Revisar propuesta"
										: "Ver acuerdo comercial",
								href: payments,
							},
						]
					: [],
		},
	]
}
