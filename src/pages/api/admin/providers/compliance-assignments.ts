import type { APIRoute } from "astro"

import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin"
import {
	listOpenComplianceAssignments,
	upsertComplianceAssignment,
} from "@/lib/provider-compliance-ops"

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

export const GET: APIRoute = async ({ request }) => {
	try {
		await requireInternalAdmin(request)
		const url = new URL(request.url)
		const providerId = String(url.searchParams.get("providerId") ?? "").trim() || undefined
		const assignments = await listOpenComplianceAssignments({ providerId })
		return json({ assignments })
	} catch (e) {
		if (e instanceof Response) return e
		return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500)
	}
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { user } = await requireInternalAdmin(request)
		const body = (await request.json()) as Record<string, unknown>
		const providerId = String(body.providerId ?? "").trim()
		if (!providerId) return json({ error: "providerId is required" }, 400)

		const assignment = await upsertComplianceAssignment({
			providerId,
			domain: body.domain,
			entityId: String(body.entityId ?? "").trim(),
			assigneeEmail: body.assigneeEmail,
			slaHours: body.slaHours,
			notes: body.notes,
			actorUserId: user.id,
		})

		return json({ ok: true, assignment })
	} catch (e) {
		if (e instanceof Response) return e
		const status =
			typeof (e as Error & { status?: number })?.status === "number"
				? (e as Error & { status?: number }).status!
				: 500
		return json({ error: e instanceof Error ? e.message : "Unknown error" }, status)
	}
}
