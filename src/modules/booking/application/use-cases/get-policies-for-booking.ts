import type { BookingPolicySnapshotRepositoryPort } from "../ports/BookingPolicySnapshotRepositoryPort"
import { BookingPolicySnapshotMissingError } from "../errors/bookingPolicySnapshotMissingError"

export type GetPoliciesForBookingResult = {
	policies: Array<{
		category: string
		// Snapshot is authoritative; shape is intentionally "unknown" to avoid coupling.
		policy: unknown
	}>
}

function normalizeSnapshotJson(value: unknown): unknown {
	// Astro DB JSON can come back as object (preferred) or string depending on driver.
	if (typeof value === "string") {
		try {
			return JSON.parse(value)
		} catch {
			return value
		}
	}
	return value
}

export async function getPoliciesForBooking(
	deps: { repo: BookingPolicySnapshotRepositoryPort },
	bookingId: string
): Promise<GetPoliciesForBookingResult> {
	const id = String(bookingId ?? "").trim()
	if (!id) throw new BookingPolicySnapshotMissingError()

	const rows = await deps.repo.findByBookingId(id)
	if (!rows.length) throw new BookingPolicySnapshotMissingError()

	// Group by category; booking snapshot is expected to be 1 row per category.
	// If duplicates exist, pick deterministically: latest createdAt wins, tie-break by id.
	const byCategory = new Map<string, typeof rows>()
	for (const r of rows) {
		const cat = String(r.category ?? "").trim()
		if (!cat) continue
		const existing = byCategory.get(cat)
		if (!existing) byCategory.set(cat, [r])
		else existing.push(r)
	}

	const categories = Array.from(byCategory.keys()).sort()
	const policies = categories.map((category) => {
		const entries = byCategory.get(category) ?? []
		entries.sort((a, b) => {
			const at = a.createdAt?.getTime?.() ?? 0
			const bt = b.createdAt?.getTime?.() ?? 0
			if (at !== bt) return bt - at
			return String(a.id).localeCompare(String(b.id))
		})
		const chosen = entries[0]
		return {
			category,
			policy: normalizeSnapshotJson(chosen?.policySnapshotJson ?? null),
		}
	})

	return { policies }
}
