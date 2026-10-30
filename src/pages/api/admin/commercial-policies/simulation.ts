import type { APIRoute } from "astro"
import { z } from "zod"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { resolveProductCommercialDiagnosis } from "@/lib/commercial-policy/enforcement"
import { withPostgresTransaction } from "@/shared/infrastructure/db/client"

const query = z.object({
	providerId: z.string().min(1).max(200),
	productId: z.string().min(1).max(200),
	at: z.iso.date().optional(),
})
export const GET: APIRoute = async ({ request, url }) => {
	try {
		const input = query.parse(Object.fromEntries(url.searchParams))
		await requireInternalPermission(request, "provider.compliance.read", {
			type: "provider",
			id: input.providerId,
		})
		const at = input.at ? new Date(`${input.at}T12:00:00Z`) : new Date()
		const result = await withPostgresTransaction(() =>
			resolveProductCommercialDiagnosis({
				providerId: input.providerId,
				productId: input.productId,
				policyEvaluationAt: at,
			})
		)
		return Response.json(
			{ ok: true, simulation: true, evaluatedAt: at.toISOString(), ...result },
			{ headers: { "Cache-Control": "private, no-store" } }
		)
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof z.ZodError)
			return Response.json(
				{ ok: false, message: "Selecciona la experiencia y una fecha válida." },
				{ status: 422 }
			)
		console.error("commercial_policy.simulation_failed", error)
		return Response.json(
			{
				ok: false,
				message: "No se pudo comprobar la cobertura. No se modificó ninguna autorización.",
			},
			{ status: 503 }
		)
	}
}
