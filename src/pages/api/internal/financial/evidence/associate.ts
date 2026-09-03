import type { APIRoute } from "astro"

import { externalFinancialEvidenceAssociationRepository } from "@/container/financial.container"
import { invalidateFinancialProviderSummary } from "@/lib/cache/invalidation"
import { associateExternalFinancialEvidence } from "@/modules/financial/public"

import { json, readJson, requireFinancialManager } from "../_stage2"

const statusForError = (message: string) => {
	if (message.includes("NOT_FOUND")) return 404
	if (message.includes("ALREADY_ASSOCIATED") || message.includes("CONFLICT")) return 409
	return 400
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await requireFinancialManager(request)
	if (!auth.ok) return auth.response
	const body = await readJson(request)
	try {
		const result = await associateExternalFinancialEvidence(
			{ repository: externalFinancialEvidenceAssociationRepository },
			{
				providerId: auth.providerId,
				evidenceType: String(body.evidenceType || "") as "payment" | "settlement",
				evidenceId: String(body.evidenceId || ""),
				bookingId: String(body.bookingId || ""),
				actorId: String(auth.user.id || ""),
				reason: String(body.reason || ""),
			}
		)
		if (!result.idempotent) {
			await invalidateFinancialProviderSummary({
				providerId: auth.providerId,
				reason: "external_financial_evidence_associated",
			})
		}
		return json(result, result.idempotent ? 200 : 201)
	} catch (error) {
		const message = error instanceof Error ? error.message : "FINANCIAL_EVIDENCE_ASSOCIATION_FAILED"
		return json({ error: message }, statusForError(message))
	}
}
