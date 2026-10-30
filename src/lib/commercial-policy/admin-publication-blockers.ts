import type { ProviderContractOffering } from "./provider-contract-surface"
import { classifyCommercialFinding } from "./findings"

const scopes: Record<string, string> = {
	holder: "Titular del negocio",
	product: "Experiencia",
	tax: "Fiscalidad",
}

/** Group repeated configuration gaps without treating them as document reviews. */
export function projectAdminPolicyBlockers(offerings: ProviderContractOffering[]) {
	const groups = new Map<
		string,
		{ code: string; label: string; products: { id: string; name: string }[] }
	>()
	for (const offer of offerings) {
		if (offer.commercialLine !== "tour") continue
		for (const reason of offer.reasons) {
			if (classifyCommercialFinding({ id: reason.code }).category !== "configuration") continue
			const scope = Object.keys(scopes).find((key) => reason.code.endsWith(`_${key}`))
			const label = scope ? scopes[scope] : "Política comercial"
			const group = groups.get(reason.code) ?? { code: reason.code, label, products: [] }
			if (!group.products.some((product) => product.id === offer.productId)) {
				group.products.push({ id: offer.productId, name: offer.name })
			}
			groups.set(reason.code, group)
		}
	}
	return [...groups.values()]
}

export async function loadAdminPolicyBlockers(providerId: string) {
	const { loadProviderContractSurface } = await import("./provider-contract-surface")
	const surface = await loadProviderContractSurface(providerId)
	if (surface.offerings.some((offer) => offer.status === "read_failed")) {
		throw new Error("Commercial policy diagnosis unavailable")
	}
	return projectAdminPolicyBlockers(surface.offerings)
}
