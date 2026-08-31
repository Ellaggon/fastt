import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import { finalizeAddRoom } from "@/lib/playbook/finalize-add-room"

function json(status: number, payload: Record<string, unknown>) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

/** Activates the selected guided rate only after its commercial setup is complete. */
export const POST: APIRoute = async ({ request }) => {
	try {
		const { providerId, user } = await requireProvider(request)
		const { ratePlanId, productId, variantId } = (await request.json().catch(() => ({}))) as {
			ratePlanId?: unknown
			productId?: unknown
			variantId?: unknown
		}
		const id = String(ratePlanId ?? "").trim()
		if (!id) return json(400, { error: "ratePlanId es obligatorio." })
		const result = await finalizeAddRoom({
			providerId,
			userId: user.id,
			productId: String(productId ?? "").trim(),
			variantId: String(variantId ?? "").trim(),
			ratePlanId: id,
		})
		if (!result.ok) return json(result.status, result)
		return json(200, {
			success: true,
			ratePlanId: result.ratePlanId,
			terminalHref: result.terminalHref,
		})
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof Error && error.message.startsWith("PROVIDER_CONFIGURATION_BLOCKED")) {
			return json(409, {
				error: "La tarifa no puede activarse hasta completar la configuración del proveedor.",
			})
		}
		console.error("rateplans:activate-guided", error)
		return json(500, { error: "No se pudo activar la tarifa." })
	}
}
