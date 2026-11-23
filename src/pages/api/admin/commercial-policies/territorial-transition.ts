import type { APIRoute } from "astro"
import { z } from "zod"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import { activateTerritorialTransition } from "@/lib/commercial-policy/territorial-transition"
import { canActivateTerritorialTransition } from "@/lib/commercial-policy/territorial-transition-access"

const reviewChecks = [
	"representation",
	"fiscal",
	"documentary",
	"existing_evidence",
	"territory",
] as const
const schema = z.object({
	fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
	approvalReference: z.string().trim().min(10).max(500),
	reviewed: z
		.array(z.enum(reviewChecks))
		.length(5)
		.refine((values) => new Set(values).size === 5),
})

export const POST: APIRoute = async ({ request }) => {
	if (request.headers.get("origin") !== new URL(request.url).origin)
		return Response.json({ error: "invalid_origin" }, { status: 403 })
	try {
		const principal = await requireInternalPermission(request, "internal.admin.access")
		if (!canActivateTerritorialTransition(principal))
			return Response.json({ error: "territorial_transition_forbidden" }, { status: 403 })
		await requireRecentInternalAuthentication({ request, user: principal.user })
		const form = await request.formData()
		const input = schema.parse({
			fingerprint: form.get("fingerprint"),
			approvalReference: form.get("approvalReference"),
			reviewed: form.getAll("reviewed"),
		})
		const result = await activateTerritorialTransition({ ...input, actorUserId: principal.user.id })
		return Response.json({
			ok: true,
			...result,
			redirectTo:
				"/admin/commercial-policies?view=policies&task=reorganization&result=transition_applied",
		})
	} catch (error) {
		if (error instanceof Response) return error
		console.error("commercial_policy.territorial_transition_failed", error)
		return Response.json(
			{
				error: "territorial_transition_not_applied",
				message:
					"No se aplicó la transición. Revisa las confirmaciones y vuelve a cargar el paquete; si cambió o falló una parte, no se publica ni retira ninguna política.",
			},
			{ status: 409 }
		)
	}
}
