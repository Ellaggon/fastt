import type { APIRoute } from "astro"
import { z } from "zod"
import { requireProviderFiscalityManager } from "@/lib/provider-fiscality-auth"
import {
	fiscalChannelCapabilities,
	unsupportedFiscalFields,
} from "@/lib/taxes-fees/channel-capabilities"
import { writeFiscalActivity } from "@/lib/taxes-fees/fiscal-activity"
import {
	and,
	db,
	desc,
	eq,
	FiscalChannelPublication,
	ProviderIntegrationConnection,
	ProviderIntegrationSyncRun,
	TaxFeeDefinition,
	TaxFeeDefinitionVersion,
} from "@/shared/infrastructure/db/compat"

export const GET: APIRoute = async ({ request }) => {
	const { providerId } = await requireProviderFiscalityManager(request)
	const [connections, publications] = await Promise.all([
		db
			.select()
			.from(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.providerId, providerId)),
		db
			.select()
			.from(FiscalChannelPublication)
			.where(eq(FiscalChannelPublication.providerId, providerId))
			.orderBy(desc(FiscalChannelPublication.updatedAt)),
	])
	return Response.json({
		channels: connections.map((connection) => ({
			id: connection.id,
			channel: connection.connectorKey,
			status: connection.status,
			capabilities:
				fiscalChannelCapabilities[connection.connectorKey] ?? fiscalChannelCapabilities.web,
			lastSyncAt: connection.lastSyncAt,
			publications: publications
				.filter((publication) => publication.connectionId === connection.id)
				.slice(0, 20),
		})),
	})
}
const schema = z.object({
	action: z.enum(["preview", "send", "confirm", "retry"]),
	definitionId: z.string().min(1),
	connectionId: z.string().min(1),
	publicationId: z.string().optional(),
})
export const POST: APIRoute = async ({ request }) => {
	const { providerId, user } = await requireProviderFiscalityManager(request),
		input = schema.parse(await request.json())
	const [definition, connection] = await Promise.all([
		db
			.select()
			.from(TaxFeeDefinition)
			.where(eq(TaxFeeDefinition.id, input.definitionId))
			.then((rows) => rows[0] ?? null),
		db
			.select()
			.from(ProviderIntegrationConnection)
			.where(eq(ProviderIntegrationConnection.id, input.connectionId))
			.then((rows) => rows[0] ?? null),
	])
	if (
		!definition ||
		definition.providerId !== providerId ||
		!connection ||
		connection.providerId !== providerId
	)
		return Response.json({ error: "not_found" }, { status: 404 })
	const unsupported = unsupportedFiscalFields(definition, connection.connectorKey),
		version = definition.currentVersionId
			? await db
					.select()
					.from(TaxFeeDefinitionVersion)
					.where(
						and(
							eq(TaxFeeDefinitionVersion.id, definition.currentVersionId),
							eq(TaxFeeDefinitionVersion.taxFeeDefinitionId, definition.id)
						)
					)
					.then((rows) => rows[0] ?? null)
			: null
	const payload = {
		version: "tax_fee_channel_v2",
		definitionId: definition.id,
		definitionVersionId: version?.id ?? null,
		channel: connection.connectorKey,
		rule: {
			code: definition.code,
			kind: definition.kind,
			calculationType: definition.calculationType,
			value: definition.value,
			inclusionType: definition.inclusionType,
			appliesPer: definition.appliesPer,
			jurisdiction: definition.jurisdictionJson,
		},
	}
	if (input.action === "preview")
		return Response.json({
			payload,
			unsupported,
			blocked: unsupported.length > 0,
			capabilities:
				fiscalChannelCapabilities[connection.connectorKey] ?? fiscalChannelCapabilities.web,
		})
	if (unsupported.length)
		return Response.json({ error: "channel_incompatible", unsupported }, { status: 409 })
	const idempotencyKey = `tax-fee:${connection.id}:${version?.id ?? definition.id}`
	if (input.action === "confirm") {
		const publication = await db
			.select()
			.from(FiscalChannelPublication)
			.where(eq(FiscalChannelPublication.id, input.publicationId ?? ""))
			.then((rows) => rows[0] ?? null)
		if (!publication || publication.providerId !== providerId)
			return Response.json({ error: "not_found" }, { status: 404 })
		await db
			.update(FiscalChannelPublication)
			.set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
			.where(eq(FiscalChannelPublication.id, publication.id))
		await db
			.update(ProviderIntegrationSyncRun)
			.set({
				status: "succeeded",
				finishedAt: new Date(),
				summaryJson: { fiscalConfirmation: true },
			})
			.where(eq(ProviderIntegrationSyncRun.id, publication.syncRunId!))
		await writeFiscalActivity({
			providerId,
			actorUserId: user.id,
			eventType: "sync_confirmed",
			definitionId: definition.id,
			definitionVersionId: version?.id ?? null,
			channel: connection.connectorKey,
			syncRunId: publication.syncRunId,
			correlationId: idempotencyKey,
			result: "succeeded",
			context: { payload },
		})
		return Response.json({ status: "confirmed" })
	}
	const existingRun = await db
		.select()
		.from(ProviderIntegrationSyncRun)
		.where(
			and(
				eq(ProviderIntegrationSyncRun.connectionId, connection.id),
				eq(ProviderIntegrationSyncRun.idempotencyKey, idempotencyKey)
			)
		)
		.then((rows) => rows[0] ?? null)
	const runId = existingRun?.id ?? crypto.randomUUID()
	if (!existingRun)
		await db.insert(ProviderIntegrationSyncRun).values({
			id: runId,
			providerId,
			connectionId: connection.id,
			connectorKey: connection.connectorKey,
			operation: "tax_fee_publish",
			trigger: input.action === "retry" ? "manual_retry" : "manual",
			status: "running",
			idempotencyKey,
			requestedBy: user.id,
			startedAt: new Date(),
			createdAt: new Date(),
			summaryJson: { fiscalPayload: payload },
		})
	const publicationId = crypto.randomUUID()
	await db
		.insert(FiscalChannelPublication)
		.values({
			id: publicationId,
			providerId,
			definitionId: definition.id,
			definitionVersionId: version?.id ?? null,
			connectionId: connection.id,
			channel: connection.connectorKey,
			syncRunId: runId,
			status: "sent",
			payloadJson: payload,
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.onConflictDoNothing()
	await writeFiscalActivity({
		providerId,
		actorUserId: user.id,
		eventType: input.action === "retry" ? "sync_retried" : "sync_sent",
		definitionId: definition.id,
		definitionVersionId: version?.id ?? null,
		channel: connection.connectorKey,
		syncRunId: runId,
		correlationId: idempotencyKey,
		result: "pending",
		riskLevel: "high",
		context: { payload },
	})
	return Response.json(
		{ publicationId, runId, status: "sent", confirmationRequired: true },
		{ status: 202 }
	)
}
