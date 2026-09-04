import { writeAuditEvent, type AuditRiskLevel } from "@/lib/audit/audit-events"
import {
	completeCommandIdempotency,
	failCommandIdempotency,
	reserveCommandIdempotency,
} from "@/lib/commands/command-idempotency"

export type SensitiveCommandAudit = {
	requestId: string
	action: string
	entityType: string
	entityId?: string | null
	providerId?: string | null
	riskLevel: AuditRiskLevel
	actorUserId?: string | null
	actorRoleKeys?: string[]
	contextJson?: unknown
}

type SensitiveCommandResult<T> = {
	response: T
	beforeJson?: unknown
	afterJson?: unknown
	contextJson?: unknown
}

export class CommandAlreadyInProgressError extends Error {
	readonly code = "idempotency_command_in_progress"
	readonly status = 409

	constructor() {
		super("idempotency_command_in_progress")
	}
}

function outcomeForError(error: unknown): "denied" | "failed" {
	if (error instanceof Response && [401, 403].includes(error.status)) return "denied"
	const status =
		typeof (error as { status?: unknown })?.status === "number"
			? (error as { status: number }).status
			: 0
	return status === 401 || status === 403 ? "denied" : "failed"
}

function errorContext(error: unknown): Record<string, unknown> {
	if (error instanceof Response) return { responseStatus: error.status }
	if (error instanceof Error) {
		return {
			errorCode: String((error as Error & { code?: unknown }).code ?? error.name),
			status: (error as Error & { status?: unknown }).status ?? null,
		}
	}
	return { errorCode: "unknown_error" }
}

async function recordOutcome(
	audit: SensitiveCommandAudit,
	params: {
		outcome: "attempted" | "succeeded" | "denied" | "failed"
		beforeJson?: unknown
		afterJson?: unknown
		contextJson?: unknown
	}
) {
	return writeAuditEvent({
		...audit,
		...params,
		contextJson: {
			...(audit.contextJson as Record<string, unknown>),
			...(params.contextJson as Record<string, unknown>),
		},
	})
}

/**
 * Shared boundary for sensitive internal mutations. It persists an attempt
 * before effects begin, captures every terminal outcome, and optionally wraps
 * the work in a durable idempotency reservation.
 */
export async function executeSensitiveCommand<T>(params: {
	audit: SensitiveCommandAudit
	idempotency?: { scope: string; key: string; payload: unknown; ttlMs?: number }
	/** Authorization and MFA happen before an idempotency lease is acquired. */
	authorize?: () => Promise<void>
	execute: () => Promise<SensitiveCommandResult<T>>
}): Promise<{ response: T; replayed: boolean }> {
	await recordOutcome(params.audit, { outcome: "attempted" })
	let reservation: Awaited<ReturnType<typeof reserveCommandIdempotency<T>>> | null = null
	let completed = false
	try {
		await params.authorize?.()
		if (params.idempotency) {
			reservation = await reserveCommandIdempotency<T>({
				...params.idempotency,
				requestId: params.audit.requestId,
				actorUserId: params.audit.actorUserId,
			})
			if (reservation.kind === "replay") {
				await recordOutcome(params.audit, {
					outcome: "succeeded",
					contextJson: { idempotency: "replay" },
				})
				return { response: reservation.response as T, replayed: true }
			}
			if (reservation.kind === "in_progress") throw new CommandAlreadyInProgressError()
		}

		const result = await params.execute()
		if (reservation?.kind === "execute") {
			await completeCommandIdempotency({ id: reservation.id, response: result.response })
			completed = true
		}
		await recordOutcome(params.audit, {
			outcome: "succeeded",
			beforeJson: result.beforeJson,
			afterJson: result.afterJson,
			contextJson: result.contextJson,
		})
		return { response: result.response, replayed: false }
	} catch (error) {
		if (reservation?.kind === "execute" && !completed) {
			await failCommandIdempotency({ id: reservation.id }).catch(() => undefined)
		}
		await recordOutcome(params.audit, {
			outcome: outcomeForError(error),
			contextJson: errorContext(error),
		}).catch(() => undefined)
		throw error
	}
}
