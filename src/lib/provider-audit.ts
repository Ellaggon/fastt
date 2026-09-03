import { db, ProviderAuditLog } from "@/shared/infrastructure/db/compat"
import { redactAuditPayload } from "@/lib/audit/audit-events"

/**
 * Canonical provider audit writer for sensitive settings mutations.
 *
 * Every sensitive change in fiscal profile, payments, integrations and team
 * must persist: beforeJson, afterJson, actorUserId, riskLevel.
 *
 * Creates may set beforeJson=null explicitly. Updates must include both snapshots.
 */
export type ProviderAuditRiskLevel = "low" | "medium" | "high"

export type WriteProviderAuditLogParams = {
	providerId: string
	actorUserId: string
	action: string
	entityType: string
	entityId?: string | null
	beforeJson?: unknown | null
	afterJson?: unknown | null
	riskLevel: ProviderAuditRiskLevel
}

export function snapshotForProviderAudit(value: unknown): unknown {
	return redactAuditPayload(value)
}

export async function writeProviderAuditLog(params: WriteProviderAuditLogParams): Promise<void> {
	if (!params.providerId?.trim()) return
	if (!params.actorUserId?.trim()) return
	if (!params.action?.trim() || !params.entityType?.trim()) return
	if (!params.riskLevel) return

	await db
		.insert(ProviderAuditLog)
		.values({
			id: crypto.randomUUID(),
			providerId: params.providerId,
			actorUserId: params.actorUserId,
			action: params.action,
			entityType: params.entityType,
			entityId: params.entityId ?? undefined,
			beforeJson: snapshotForProviderAudit(params.beforeJson ?? null),
			afterJson: snapshotForProviderAudit(params.afterJson ?? null),
			riskLevel: params.riskLevel,
			createdAt: new Date(),
		})
		.catch((error) => {
			const message = error instanceof Error ? error.message : String(error)
			// Never block the host mutation on audit storage / statement timeouts.
			if (
				message.includes("ProviderAuditLog") ||
				message.includes("no such table") ||
				message.includes("statement timeout") ||
				message.includes("canceling statement")
			) {
				console.error("provider.audit.write_failed", {
					action: params.action,
					providerId: params.providerId,
					error: message,
				})
				return
			}
			console.error("provider.audit.write_failed", {
				action: params.action,
				providerId: params.providerId,
				error: message,
			})
		})
}

export function inferSettingsRiskLevel(params: {
	domain: "fiscal" | "payments" | "integrations" | "team" | "profile" | "documents"
	changedKeys?: string[]
}): ProviderAuditRiskLevel {
	if (params.domain === "fiscal" || params.domain === "documents") return "high"
	if (params.domain === "integrations") {
		const keys = params.changedKeys ?? []
		if (keys.some((key) => ["credentialSecret", "status", "mode"].includes(key))) return "high"
		return "medium"
	}
	if (params.domain === "payments") return "high"
	if (params.domain === "team") return "medium"
	return "low"
}
