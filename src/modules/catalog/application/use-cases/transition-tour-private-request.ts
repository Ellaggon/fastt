import type { TourTrustRepositoryPort } from "../ports/TourTrustRepositoryPort"

export type TransitionTourPrivateRequestInput = {
	providerId: string
	requestId: string
	status: "accepted" | "declined"
	providerNote?: string | null
}

export type TransitionTourPrivateRequestResult =
	| {
			ok: true
			requestId: string
			status: "accepted" | "declined"
			idempotent: boolean
	  }
	| {
			ok: false
			error: "unauthorized" | "not_found" | "invalid_transition" | "validation_error"
	  }

/**
 * Provider-owned transition for private salida quotes: pending → accepted|declined.
 * Idempotent when the request is already in the target status.
 */
export async function transitionTourPrivateRequest(
	deps: { repo: TourTrustRepositoryPort },
	input: TransitionTourPrivateRequestInput
): Promise<TransitionTourPrivateRequestResult> {
	const providerId = String(input.providerId ?? "").trim()
	const requestId = String(input.requestId ?? "").trim()
	const status = input.status
	const providerNote = String(input.providerNote ?? "").trim() || null

	if (!providerId || !requestId) return { ok: false, error: "unauthorized" }
	if (status !== "accepted" && status !== "declined") {
		return { ok: false, error: "validation_error" }
	}

	const row = await deps.repo.findPrivateRequestForProvider({ requestId, providerId })
	if (!row) return { ok: false, error: "not_found" }

	const current = String(row.status ?? "").toLowerCase()
	if (current === status) {
		return { ok: true, requestId, status, idempotent: true }
	}
	if (current !== "pending") {
		return { ok: false, error: "invalid_transition" }
	}

	await deps.repo.updatePrivateRequestTransition({
		requestId,
		providerId,
		status,
		providerNote,
	})

	return { ok: true, requestId, status, idempotent: false }
}
