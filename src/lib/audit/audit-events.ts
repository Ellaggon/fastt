import { db, AuditEvent, SensitiveDataAccessEvent } from "@/shared/infrastructure/db/compat"

export type AuditRiskLevel = "low" | "medium" | "high" | "critical"
export type AuditOutcome = "attempted" | "succeeded" | "denied" | "failed"

const SENSITIVE_KEY =
	/(password|secret|token|credential|authorization|endpointurl|accountidentifier|accountnumber|routing|swift|ciphertext|encrypted|biometric|selfie|liveness)/i

export function redactAuditPayload(value: unknown): unknown {
	if (value == null) return null
	if (value instanceof Date) return value.toISOString()
	if (Array.isArray(value)) return value.map((item) => redactAuditPayload(item))
	if (typeof value !== "object") return value
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
			key,
			SENSITIVE_KEY.test(key) ? (entry == null ? null : "[redacted]") : redactAuditPayload(entry),
		])
	)
}

export async function writeAuditEvent(params: {
	requestId: string
	actorUserId?: string | null
	actorRoleKeys?: string[]
	providerId?: string | null
	action: string
	entityType: string
	entityId?: string | null
	outcome?: AuditOutcome
	riskLevel?: AuditRiskLevel
	beforeJson?: unknown
	afterJson?: unknown
	contextJson?: unknown
}): Promise<string> {
	const id = crypto.randomUUID()
	await db.insert(AuditEvent).values({
		id,
		requestId: params.requestId,
		actorUserId: params.actorUserId ?? undefined,
		actorRoleKeysJson: params.actorRoleKeys ?? undefined,
		providerId: params.providerId ?? undefined,
		action: params.action,
		entityType: params.entityType,
		entityId: params.entityId ?? undefined,
		outcome: params.outcome ?? "succeeded",
		riskLevel: params.riskLevel ?? "low",
		beforeJson: redactAuditPayload(params.beforeJson ?? null),
		afterJson: redactAuditPayload(params.afterJson ?? null),
		contextJson: redactAuditPayload(params.contextJson ?? null),
		createdAt: new Date(),
	})
	return id
}

export async function writeSensitiveDataAccessEvent(params: {
	requestId: string
	actorUserId?: string | null
	providerId?: string | null
	resourceType: string
	resourceId?: string | null
	accessType: "reveal" | "download" | "export"
	reason: string
	fields?: string[]
	success?: boolean
	auditEventId?: string | null
}): Promise<void> {
	await db.insert(SensitiveDataAccessEvent).values({
		id: crypto.randomUUID(),
		auditEventId: params.auditEventId ?? undefined,
		requestId: params.requestId,
		actorUserId: params.actorUserId ?? undefined,
		providerId: params.providerId ?? undefined,
		resourceType: params.resourceType,
		resourceId: params.resourceId ?? undefined,
		accessType: params.accessType,
		reason: params.reason,
		fieldsJson: params.fields ?? undefined,
		success: params.success ?? true,
		createdAt: new Date(),
	})
}
