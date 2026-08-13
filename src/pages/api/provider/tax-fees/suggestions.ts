import type { APIRoute } from "astro"
import { z } from "zod"
import { requireProviderFiscalityManager } from "@/lib/provider-fiscality-auth"
import { listJurisdictionTaxRuleSuggestions } from "@/modules/taxes-fees/public"
import { writeFiscalActivity } from "@/lib/taxes-fees/fiscal-activity"
import {
	db,
	desc,
	eq,
	FiscalActivityEvent,
	TaxFeeDefinition,
} from "@/shared/infrastructure/db/compat"
export const GET: APIRoute = async ({ request }) => {
	const { providerId } = await requireProviderFiscalityManager(request)
	const [definitions, activity] = await Promise.all([
		db.select().from(TaxFeeDefinition).where(eq(TaxFeeDefinition.providerId, providerId)),
		db
			.select({
				eventType: FiscalActivityEvent.eventType,
				contextJson: FiscalActivityEvent.contextJson,
			})
			.from(FiscalActivityEvent)
			.where(eq(FiscalActivityEvent.providerId, providerId))
			.orderBy(desc(FiscalActivityEvent.createdAt)),
	])
	const resolved = new Set<string>()
	for (const event of activity) {
		if (
			event.eventType !== "jurisdiction_suggestion_dismissed" &&
			event.eventType !== "jurisdiction_suggestion_accepted"
		)
			continue
		const suggestionId = (event.contextJson as { suggestionId?: string } | null)?.suggestionId
		if (suggestionId) resolved.add(suggestionId)
	}
	return Response.json({
		suggestions: listJurisdictionTaxRuleSuggestions()
			.filter((suggestion) => !resolved.has(suggestion.id))
			.map((suggestion) => ({
				...suggestion,
				comparison: definitions
					.filter(
						(definition) => (definition.jurisdictionJson as any)?.country === suggestion.country
					)
					.map((definition) => ({
						id: definition.id,
						name: definition.name,
						value: Number(definition.value),
						calculationType: definition.calculationType,
					})),
			})),
	})
}
const schema = z.object({
	suggestionId: z.string().min(1),
	action: z.enum(["dismiss", "apply_for_review"]),
})
export const POST: APIRoute = async ({ request }) => {
	const { providerId, user } = await requireProviderFiscalityManager(request),
		input = schema.parse(await request.json())
	await writeFiscalActivity({
		providerId,
		actorUserId: user.id,
		eventType:
			input.action === "dismiss"
				? "jurisdiction_suggestion_dismissed"
				: "jurisdiction_suggestion_accepted",
		result: "succeeded",
		riskLevel: "high",
		context: {
			suggestionId: input.suggestionId,
			requiresSimulation: input.action === "apply_for_review",
		},
	})
	return Response.json({ ok: true })
}
