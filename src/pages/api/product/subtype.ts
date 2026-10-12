import type { APIRoute } from "astro"
import { getProviderSessionSurfaceFromRequest } from "@/lib/auth/providerSessionSurface"
import { invalidateProduct } from "@/lib/cache/invalidation"
import { refreshProductOperationalSurfaceAfterMutation } from "@/lib/product/productOperationalSurface"
import { updateProductSubtype } from "@/modules/catalog/public"
import { productRepository, subtypeRepository } from "@/container"

function listFromForm(value: FormDataEntryValue | null): string[] {
	return String(value ?? "")
		.split(/\r?\n|,/)
		.map((item) => item.trim())
		.filter(Boolean)
}

function objectFromFields(
	fields: Record<string, FormDataEntryValue | null>
): Record<string, string> | null {
	const entries = Object.entries(fields)
		.map(([key, value]) => [key, String(value ?? "").trim()] as const)
		.filter(([, value]) => value.length > 0)
	return entries.length ? Object.fromEntries(entries) : null
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await getProviderSessionSurfaceFromRequest(request)
		const providerId = session?.providerId
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		if (!session?.permissions.canEditProfile)
			return Response.json({ error: "No tienes permiso para editar." }, { status: 403 })

		const form = await request.formData()
		const productId = String(form.get("productId") ?? "").trim()
		if (!productId) {
			return new Response(JSON.stringify({ error: "productId required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const owned = await productRepository.ensureProductOwnedByProvider(productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Product not found or not owned by you" }), {
				status: 403,
				headers: { "Content-Type": "application/json" },
			})
		}

		const subtypeType = String((owned as any).productType ?? "")
			.trim()
			.toLowerCase() as "hotel" | "tour" | "package" | "limousine"

		if (!["hotel", "tour", "package", "limousine"].includes(subtypeType)) {
			return new Response(JSON.stringify({ error: "Invalid product type in DB" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		if (
			subtypeType === "tour" &&
			["complianceOperatingRole", "complianceActivityClass", "complianceJurisdictionCode"].some(
				(key) => form.has(key)
			)
		) {
			return Response.json(
				{
					error:
						"La operación se declara en Verificación de experiencias. Guarda el programa sin esos campos.",
				},
				{ status: 400 }
			)
		}

		let subtype: any =
			subtypeType === "tour"
				? {}
				: subtypeType === "hotel"
					? {
							stars: form.get("stars") ? Number(form.get("stars")) : null,
							phone: String(form.get("phone") ?? "").trim() || null,
							email: String(form.get("email") ?? "").trim() || null,
							website: String(form.get("website") ?? "").trim() || null,
						}
					: subtypeType === "package"
						? {
								days: form.get("days") ? Number(form.get("days")) : null,
								nights: form.get("nights") ? Number(form.get("nights")) : null,
								itineraryJson: listFromForm(form.get("itinerary")).map((description, index) => ({
									day: index + 1,
									description,
								})),
								includesJson: listFromForm(form.get("includes")),
								excludesJson: listFromForm(form.get("excludes")),
							}
						: {
								vehicleProfileJson: objectFromFields({
									make: form.get("vehicleMake"),
									model: form.get("vehicleModel"),
									class: form.get("vehicleClass"),
									color: form.get("vehicleColor"),
								}),
								pickupJson: objectFromFields({
									defaultArea: form.get("pickupDefaultArea"),
									instructions: form.get("pickupInstructions"),
								}),
								dropoffJson: objectFromFields({
									defaultArea: form.get("dropoffDefaultArea"),
									instructions: form.get("dropoffInstructions"),
								}),
								passengerCapacity: form.get("passengerCapacity")
									? Number(form.get("passengerCapacity"))
									: null,
								luggageCapacity: form.get("luggageCapacity")
									? Number(form.get("luggageCapacity"))
									: null,
							}

		const response =
			subtypeType === "tour"
				? await subtypeRepository.saveTourProgram(productId, providerId, form)
				: await updateProductSubtype({
						ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
						runInTransaction: (fn) => subtypeRepository.runInTransaction(fn),
						subtypeExists: (dbOrTx, pid, subtypeName) =>
							subtypeRepository.subtypeExists(dbOrTx, pid, subtypeName),
						updateHotel: (dbOrTx, pid, data) => subtypeRepository.updateHotel(dbOrTx, pid, data),
						updateTour: (dbOrTx, pid, data) => subtypeRepository.updateTour(dbOrTx, pid, data),
						updatePackage: (dbOrTx, pid, data) =>
							subtypeRepository.updatePackage(dbOrTx, pid, data),
						updateLimousine: (dbOrTx, pid, data) =>
							subtypeRepository.updateLimousine(dbOrTx, pid, data),
						insertHotel: (dbOrTx, data) => subtypeRepository.insertHotel(dbOrTx, data as any),
						insertTour: (dbOrTx, data) => subtypeRepository.insertTour(dbOrTx, data as any),
						insertPackage: (dbOrTx, data) => subtypeRepository.insertPackage(dbOrTx, data as any),
						insertLimousine: (dbOrTx, data) =>
							subtypeRepository.insertLimousine(dbOrTx, data as any),
						providerId,
						productId,
						subtypeType,
						subtype,
					})
		if (response.ok) {
			try {
				await invalidateProduct(productId)
				await refreshProductOperationalSurfaceAfterMutation({
					productId,
					providerId,
					request,
					source: "product.subtype",
				})
			} catch (error) {
				console.error("product.subtype.surface_refresh_failed", error)
			}
		}
		return response
	} catch (err) {
		console.error("product/subtype error:", err)
		return new Response(JSON.stringify({ error: "No pudimos guardar. Vuelve a intentarlo." }), {
			status: 500,
		})
	}
}
