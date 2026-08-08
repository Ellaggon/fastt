import { randomUUID } from "node:crypto"
import type { TourTrustRepositoryPort } from "../ports/TourTrustRepositoryPort"

export type CreateTourPrivateRequestInput = {
	userId?: string | null
	productId: string
	variantId: string
	departureDate: string
	party: { adults: number; children: number; infants: number; rooms?: number }
	contactName: string
	contactEmail: string
	contactPhone?: string | null
	message?: string | null
	/** SLA hours for provider response (default 24). */
	slaHours?: number
}

export type CreateTourPrivateRequestResult =
	| { ok: true; requestId: string; slaDueAt: string; idempotent?: boolean }
	| {
			ok: false
			error: "validation_error" | "not_found" | "not_private" | "variant_inactive"
	  }

export async function createTourPrivateRequest(
	deps: { repo: TourTrustRepositoryPort },
	input: CreateTourPrivateRequestInput
): Promise<CreateTourPrivateRequestResult> {
	const productId = String(input.productId ?? "").trim()
	const variantId = String(input.variantId ?? "").trim()
	const departureDate = String(input.departureDate ?? "")
		.trim()
		.slice(0, 10)
	const contactName = String(input.contactName ?? "").trim()
	const contactEmail = String(input.contactEmail ?? "")
		.trim()
		.toLowerCase()
	const contactPhone = String(input.contactPhone ?? "").trim() || null
	const message = String(input.message ?? "").trim() || null

	if (
		!productId ||
		!variantId ||
		!/^\d{4}-\d{2}-\d{2}$/.test(departureDate) ||
		!contactName ||
		!contactEmail.includes("@")
	) {
		return { ok: false, error: "validation_error" }
	}

	const row = await deps.repo.findPrivateTourSlot({ productId, variantId })
	if (!row?.providerId) return { ok: false, error: "not_found" }
	if (row.isActive === false) return { ok: false, error: "variant_inactive" }
	if (String(row.bookingMode ?? "shared").toLowerCase() !== "private") {
		return { ok: false, error: "not_private" }
	}

	const existingPending = await deps.repo.findPendingPrivateRequest({
		variantId,
		departureDate,
		contactEmail,
	})
	if (existingPending) {
		return {
			ok: true,
			requestId: String(existingPending.id),
			slaDueAt: existingPending.slaDueAt
				? new Date(existingPending.slaDueAt).toISOString()
				: new Date().toISOString(),
			idempotent: true,
		}
	}

	const slaHours = Math.max(4, Math.min(Number(input.slaHours ?? 24) || 24, 72))
	const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000)
	const requestId = randomUUID()
	const party = {
		adults: Math.max(1, Math.floor(Number(input.party?.adults ?? 1)) || 1),
		children: Math.max(0, Math.floor(Number(input.party?.children ?? 0)) || 0),
		infants: Math.max(0, Math.floor(Number(input.party?.infants ?? 0)) || 0),
		rooms: Math.max(1, Math.floor(Number(input.party?.rooms ?? 1)) || 1),
	}

	await deps.repo.insertPrivateRequest({
		id: requestId,
		productId,
		variantId,
		providerId: String(row.providerId),
		userId: input.userId ? String(input.userId) : null,
		departureDate,
		partyJson: party,
		contactName,
		contactEmail,
		contactPhone,
		message,
		status: "pending",
		slaDueAt,
	})

	return { ok: true, requestId, slaDueAt: slaDueAt.toISOString(), idempotent: false }
}
