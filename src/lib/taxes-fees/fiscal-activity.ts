import { db, FiscalActivityEvent } from "@/shared/infrastructure/db/compat"
import { snapshotForProviderAudit, type ProviderAuditRiskLevel } from "@/lib/provider-audit"

export async function writeFiscalActivity(input: {
	providerId: string
	eventType: string
	actorUserId?: string | null
	actorRole?: string | null
	definitionId?: string | null
	definitionVersionId?: string | null
	productId?: string | null
	channel?: string | null
	syncRunId?: string | null
	correlationId?: string | null
	result?: "succeeded" | "failed" | "pending"
	riskLevel?: ProviderAuditRiskLevel
	before?: unknown
	after?: unknown
	context?: unknown
}) {
	await db
		.insert(FiscalActivityEvent)
		.values({
			id: crypto.randomUUID(),
			providerId: input.providerId,
			eventType: input.eventType,
			actorUserId: input.actorUserId ?? null,
			actorRole: input.actorRole ?? null,
			definitionId: input.definitionId ?? null,
			definitionVersionId: input.definitionVersionId ?? null,
			productId: input.productId ?? null,
			channel: input.channel ?? null,
			syncRunId: input.syncRunId ?? null,
			correlationId: input.correlationId ?? crypto.randomUUID(),
			result: input.result ?? "succeeded",
			riskLevel: input.riskLevel ?? "low",
			beforeJson: snapshotForProviderAudit(input.before ?? null),
			afterJson: snapshotForProviderAudit(input.after ?? null),
			contextJson: snapshotForProviderAudit(input.context ?? null),
			createdAt: new Date(),
		})
		.catch((error) => console.error("fiscal.activity.write_failed", error))
}
