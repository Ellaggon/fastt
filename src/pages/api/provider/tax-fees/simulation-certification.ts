import type { APIRoute } from "astro"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { taxFeeDefinitionFingerprint } from "@/lib/taxes-fees/tax-fee-simulation-certification"
import {
	and,
	db,
	desc,
	eq,
	FiscalActivityEvent,
	TaxFeeDefinition,
} from "@/shared/infrastructure/db/compat"

export const GET: APIRoute = async ({ request }) => {
	const providerId = await getProviderIdFromRequest(request)
	if (!providerId) return Response.json({ error: "unauthorized" }, { status: 401 })
	const definitionId = new URL(request.url).searchParams.get("definitionId")?.trim()
	if (!definitionId) return Response.json({ error: "validation_error" }, { status: 400 })

	const definition = await db
		.select()
		.from(TaxFeeDefinition)
		.where(and(eq(TaxFeeDefinition.id, definitionId), eq(TaxFeeDefinition.providerId, providerId)))
		.then((rows) => rows[0] ?? null)
	if (!definition) return Response.json({ error: "not_found" }, { status: 404 })

	const fingerprint = taxFeeDefinitionFingerprint(definition)
	const events = await db
		.select({
			correlationId: FiscalActivityEvent.correlationId,
			context: FiscalActivityEvent.contextJson,
			createdAt: FiscalActivityEvent.createdAt,
		})
		.from(FiscalActivityEvent)
		.where(
			and(
				eq(FiscalActivityEvent.providerId, providerId),
				eq(FiscalActivityEvent.definitionId, definitionId),
				eq(FiscalActivityEvent.eventType, "simulation_executed"),
				eq(FiscalActivityEvent.result, "succeeded")
			)
		)
		.orderBy(desc(FiscalActivityEvent.createdAt))
	const event = events.find(
		(item) =>
			(item.context as { definitionFingerprint?: string } | null)?.definitionFingerprint ===
			fingerprint
	)
	const context = event?.context as {
		productId?: string | null
		ratePlanId?: string | null
		channel?: string | null
		quoteId?: string | null
	} | null

	return Response.json({
		isCurrent: Boolean(event),
		fingerprint,
		quoteId: event?.correlationId ?? null,
		issuedAt: event?.createdAt?.toISOString() ?? null,
		context: context
			? {
					productId: context.productId ?? null,
					ratePlanId: context.ratePlanId ?? null,
					channel: context.channel ?? null,
				}
			: null,
	})
}
