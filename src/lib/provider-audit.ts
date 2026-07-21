import { db, ProviderAuditLog } from "astro:db"

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

const SENSITIVE_KEYS = new Set([
	"credentialsRef",
	"credentials",
	"secret",
	"token",
	"password",
	"passwordHash",
])

export function snapshotForProviderAudit(value: unknown): unknown {
	if (value == null) return null
	if (Array.isArray(value)) return value.map((item) => snapshotForProviderAudit(item))
	if (value instanceof Date) return value.toISOString()
	if (typeof value !== "object") return value

	const output: Record<string, unknown> = {}
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		if (SENSITIVE_KEYS.has(key)) {
			output[key] = entry ? "[redacted]" : null
			continue
		}
		output[key] = snapshotForProviderAudit(entry)
	}
	return output
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
			if (!message.includes("ProviderAuditLog") && !message.includes("no such table")) {
				throw error
			}
		})
}

export function inferSettingsRiskLevel(params: {
	domain: "fiscal" | "payments" | "integrations" | "team" | "profile" | "documents"
	changedKeys?: string[]
}): ProviderAuditRiskLevel {
	if (params.domain === "fiscal" || params.domain === "documents") return "high"
	if (params.domain === "integrations") {
		const keys = params.changedKeys ?? []
		if (keys.some((key) => ["credentialsRef", "status", "mode"].includes(key))) return "high"
		return "medium"
	}
	if (params.domain === "payments") return "high"
	if (params.domain === "team") return "medium"
	return "low"
}
