import { and, db, eq, Product } from "@/shared/infrastructure/db/compat"
import { listPublishedDocumentDefinitions } from "@/lib/documents/document-definitions"
import { nationalHolderUploadSubject } from "@/lib/documents/holder-evidence-subject"
import { readProviderHolderProfile } from "@/lib/provider-holder-profile"
import { listProviderDocuments, type ProviderDocumentRecord } from "@/lib/provider-documents"
import { resolveProductCommercialDiagnosis } from "./enforcement"
import { presentPolicyEvidence } from "./evidence-presentation"
import { withCommercialReadScope } from "./read-scope"
import type { CommercialPolicyDiagnosis } from "./evaluate"
import type { TrustLinkUiState } from "@/lib/provider-trust-map"

type Definitions = Awaited<ReturnType<typeof listPublishedDocumentDefinitions>>
export type AccountPolicyEvidence = {
	key: string
	policyVersionId: string
	productId: string
	area: "identity" | "business" | "fiscal"
	label: string
	state: string
	stateLabel: string
	canUpload: boolean
	definitions: Definitions
	documents: ProviderDocumentRecord[]
}
export type AccountPolicyEvidenceResult = {
	items: AccountPolicyEvidence[]
	unresolvedOffers: number
}

/** Presentation uses the exact holder requirements selected by the product evaluator. */
export function collectAccountPolicyEvidence(input: {
	diagnoses: Array<{ productId: string; diagnosis: CommercialPolicyDiagnosis }>
	definitions: Definitions
	documents: ProviderDocumentRecord[]
	providerId: string
	holderType: string | null
}): AccountPolicyEvidence[] {
	const items = new Map<string, AccountPolicyEvidence>()
	for (const { productId, diagnosis } of input.diagnoses) {
		const views = presentPolicyEvidence(diagnosis, [], true)
		for (const requirement of diagnosis.applicableRequirements ?? []) {
			if (
				!requirement.documentAcceptance ||
				requirement.condition?.evidenceScope !== "provider" ||
				requirement.condition.evidenceSubjectSelector !== "holder"
			)
				continue
			const identity = `${requirement.policyVersionId}:${requirement.key}`
			if (items.has(identity)) continue
			const ids = [
				...new Set(
					requirement.documentAcceptance.alternatives.flatMap((a) =>
						a.allOf.map((p) => p.definitionVersionId)
					)
				),
			]
			const definitions = input.definitions.filter((d) => ids.includes(d.id))
			const view = views.find(
				(v) => v.key === requirement.key && v.policyVersionId === requirement.policyVersionId
			)
			if (!view) continue
			const definitionsComplete = definitions.length === ids.length && definitions.length > 0
			items.set(identity, {
				key: requirement.key,
				policyVersionId: requirement.policyVersionId,
				productId,
				area: definitions.some((d) => d.family === "fiscal")
					? "fiscal"
					: input.holderType === "entidad"
						? "business"
						: "identity",
				label:
					definitions.map((d) => d.label).join(" / ") ||
					"Respaldo del titular pendiente de configurar",
				state: definitionsComplete ? view.state : "unavailable",
				stateLabel: definitionsComplete ? view.label : "No se pudo comprobar la definición",
				canUpload:
					definitionsComplete &&
					view.canUpload &&
					definitions.every((d) =>
						nationalHolderUploadSubject(d.key, input.holderType, input.providerId)
					),
				definitions,
				documents: input.documents.filter(
					(d) => d.definitionVersionId && ids.includes(d.definitionVersionId)
				),
			})
		}
	}
	return [...items.values()]
}

export function accountEvidenceReadiness<
	T extends TrustLinkUiState | "not_evaluable" | "not_applicable",
>(base: T, items: readonly AccountPolicyEvidence[]): T | TrustLinkUiState {
	const states: Array<T | TrustLinkUiState> = [
		base,
		...items.map(
			(item): TrustLinkUiState =>
				item.state === "verified"
					? "ready"
					: item.state === "pending_review"
						? "in_review"
						: ["rejected", "expired"].includes(item.state)
							? "requires_changes"
							: "action_needed"
		),
	]
	const rank = [
		"requires_changes",
		"action_needed",
		"not_started",
		"not_evaluable",
		"blocked",
		"in_review",
		"ready",
		"not_applicable",
	]
	return states.sort((a, b) => rank.indexOf(a) - rank.indexOf(b))[0]!
}

export async function loadProviderAccountPolicyEvidence(input: {
	providerId: string
	holder?: Awaited<ReturnType<typeof readProviderHolderProfile>>
	documents?: ProviderDocumentRecord[]
	productIds?: string[]
}): Promise<AccountPolicyEvidenceResult> {
	return withCommercialReadScope(async () => {
		const [holder, documents, products] = await Promise.all([
			input.holder === undefined ? readProviderHolderProfile(input.providerId) : input.holder,
			input.documents ?? listProviderDocuments(input.providerId),
			input.productIds ??
				db
					.select({ id: Product.id })
					.from(Product)
					.where(and(eq(Product.providerId, input.providerId), eq(Product.productType, "tour")))
					.then((rows) => rows.map((r) => r.id)),
		])
		if (!holder || !products.length) return { items: [], unresolvedOffers: products.length }
		const results = await Promise.all(
			products.map((productId) =>
				resolveProductCommercialDiagnosis({
					providerId: input.providerId,
					productId,
					holder,
					documents,
				}).catch(() => null)
			)
		)
		const diagnoses = results.filter((r): r is NonNullable<typeof r> => r !== null)
		const definitions = await listPublishedDocumentDefinitions()
		return {
			items: collectAccountPolicyEvidence({
				diagnoses,
				definitions,
				documents,
				providerId: input.providerId,
				holderType: holder.holderType,
			}),
			unresolvedOffers: results.filter((r) => !r || !r.diagnosis.applicableRequirements).length,
		}
	})
}
