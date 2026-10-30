import { routes } from "@/lib/routes"
import { classifyCommercialFinding } from "@/lib/commercial-policy/findings"

export function commercialBlockerIsWaiting(id: string): boolean {
	return classifyCommercialFinding({ id }).waiting
}

/** Contract tasks are not evidence or safety tasks. Pending Fastt decisions have no provider CTA. */
export function tourCommercialAction(id: string, productId: string) {
	if (commercialBlockerIsWaiting(id)) return null
	const label =
		id === "collection_model_undecided"
			? "Configurar cobro"
			: id === "agreement_proposal_required"
				? "Solicitar propuesta"
				: id === "agreement_acceptance_required"
					? "Revisar propuesta"
					: id.startsWith("agreement_")
						? "Revisar acuerdo comercial"
						: null
	if (!label) return null
	return {
		label,
		href: `${routes.providerSettingsPayments()}?${new URLSearchParams({ scope: "tour", productId, returnTo: routes.productPreview(productId) })}`,
	}
}
