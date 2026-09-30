import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import { finalizeAddRoom } from "@/lib/playbook/finalize-add-room"
import { finalizeTourRate } from "@/lib/playbook/finalize-tour-rate"
import { isHotelProductType, isTourProductType } from "@/lib/catalog/productVerticalRegistry"
import { resolveRatePlanOwnerContext } from "@/modules/pricing/public"

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
		const { ratePlanId, productId, variantId, playbook } = (await request
			.json()
			.catch(() => ({}))) as {
			ratePlanId?: unknown
			productId?: unknown
			variantId?: unknown
			playbook?: unknown
		}
		const id = String(ratePlanId ?? "").trim()
		if (!id) return json(400, { error: "ratePlanId es obligatorio." })
		const requestedProductId = String(productId ?? "").trim()
		const requestedVariantId = String(variantId ?? "").trim()
		const owner = await resolveRatePlanOwnerContext(id)
		if (
			!owner ||
			owner.providerId !== providerId ||
			owner.productId !== requestedProductId ||
			owner.variantId !== requestedVariantId
		) {
			return json(404, { error: "Tarifa u opción no encontrada." })
		}
		const isTour = isTourProductType(owner.productType)
		const isHotel = isHotelProductType(owner.productType)
		if (!isTour && !isHotel) {
			return json(409, { error: "Este tipo de oferta aún no admite activación guiada." })
		}
		const normalizedPlaybook = String(playbook ?? "")
		let result
		if (isTour) {
			if (!["launch-tour", "complete-to-publish"].includes(normalizedPlaybook)) {
				return json(400, { error: "El playbook de activación de tours no es válido." })
			}
			result = await finalizeTourRate({
				providerId,
				userId: user.id,
				productId: requestedProductId,
				variantId: requestedVariantId,
				ratePlanId: id,
				playbook: normalizedPlaybook as "launch-tour" | "complete-to-publish",
			})
		} else {
			result = await finalizeAddRoom({
				providerId,
				userId: user.id,
				productId: requestedProductId,
				variantId: requestedVariantId,
				ratePlanId: id,
			})
		}
		if (!result.ok) return json(result.status, result)
		return json(200, {
			success: true,
			ratePlanId: result.ratePlanId,
			...("alreadyActive" in result ? { alreadyActive: result.alreadyActive } : {}),
			...("cacheRefreshPending" in result
				? { cacheRefreshPending: result.cacheRefreshPending }
				: {}),
			terminalHref: result.terminalHref,
		})
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof Error && error.message.startsWith("PROVIDER_CONFIGURATION_BLOCKED")) {
			const details = (
				error as Error & {
					details?: { capability?: unknown; blockers?: unknown }
				}
			).details
			const blockers = Array.isArray(details?.blockers)
				? details.blockers.flatMap((value) => {
						if (!value || typeof value !== "object") return []
						const blocker = value as Record<string, unknown>
						const label = String(blocker.label ?? "").trim()
						if (!label) return []
						const rawHref = String(blocker.href ?? "").trim()
						const href = rawHref.startsWith("/") && !rawHref.startsWith("//") ? rawHref : undefined
						return [
							{
								id: String(blocker.id ?? "provider_configuration"),
								label,
								...(href ? { href } : {}),
								...(blocker.severity === "low" ||
								blocker.severity === "medium" ||
								blocker.severity === "high"
									? { severity: blocker.severity }
									: {}),
								...(blocker.areaId ? { areaId: String(blocker.areaId) } : {}),
							},
						]
					})
				: []
			if (blockers.length === 0) {
				blockers.push({
					id: "provider_configuration",
					label:
						"No pudimos identificar el requisito pendiente. Revisa la configuración de tu proveedor.",
					href: "/provider/settings",
				})
			}
			return json(409, {
				code: "provider_configuration_blocked",
				error: "Completa los requisitos del proveedor antes de activar esta oferta.",
				blockers,
			})
		}
		console.error("rateplans:activate-guided", error)
		return json(500, { error: "No se pudo activar la tarifa." })
	}
}
