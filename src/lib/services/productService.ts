// src/lib/services/productService.ts
import { db } from "astro:db"
import { ensureProductOwnedByProvider, updateProductFields } from "@/lib/db/product"
import {
	insertHotel,
	updateHotel,
	deleteHotel,
	insertTour,
	updateTour,
	deleteTour,
	insertPackage,
	updatePackage,
	deletePackage,
	subtypeExists,
} from "@/lib/db/subtype"

/**
 * Actualiza product y subtipo (orquesta lógica) dentro de una transacción:
 * - verifica ownership (mediante ensureProductOwnedByProvider)
 * - actualiza campos base del producto
 * - si cambia productType: borra subtype antiguo y crea el nuevo
 * - si no cambia: upsert del subtype
 */
export async function updateProductAndSubtype(
	productId: string,
	providerId: string,
	productFields: Partial<Record<string, any>>,
	subtypeType?: "hotel" | "tour" | "package", // opcional
	subtypePayload?: Record<string, any>
) {
	// ownership (esto puede ir fuera de la tx, no modifica nada)
	const product = await ensureProductOwnedByProvider(productId, providerId)
	if (!product) throw new Error("Product not found or not owned")

	const prevType = String(product.productType || "").toLowerCase()
	const newType = (productFields.productType || prevType || "").toLowerCase()

	// abrir transacción
	return await db.transaction(async (tx) => {
		// 1) update product basic fields (filter allowed)
		const allowed = [
			"name",
			"description",
			"productType",
			"basePriceUSD",
			"basePriceBOB",
			"cityId",
			"isActive",
		]

		const toSet: Record<string, any> = { lastUpdated: new Date() }
		for (const k of allowed) if (k in productFields) toSet[k] = productFields[k]

		// aquí pasamos tx a la función, para que use la transacción
		await updateProductFields(tx, productId, toSet)

		// 2) if no subtype provided, finish here
		if (!subtypeType) return

		const st = subtypeType.toLowerCase() as "hotel" | "tour" | "package"

		// If product type changed: delete old subtype rows & insert new
		if (st !== prevType) {
			if (prevType === "hotel") await deleteHotel(tx, productId)
			if (prevType === "tour") await deleteTour(tx, productId)
			if (prevType === "package") await deletePackage(tx, productId)

			if (st === "hotel") await insertHotel(tx, { productId, ...(subtypePayload || {}) })
			if (st === "tour") await insertTour(tx, { productId, ...(subtypePayload || {}) })
			if (st === "package") await insertPackage(tx, { productId, ...(subtypePayload || {}) })

			return
		}

		// same type: upsert subtype
		const exists = await subtypeExists(tx, productId, st)
		if (exists) {
			if (st === "hotel") await updateHotel(tx, productId, subtypePayload || {})
			if (st === "tour") await updateTour(tx, productId, subtypePayload || {})
			if (st === "package") await updatePackage(tx, productId, subtypePayload || {})
		} else {
			if (st === "hotel") await insertHotel(tx, { productId, ...(subtypePayload || {}) })
			if (st === "tour") await insertTour(tx, { productId, ...(subtypePayload || {}) })
			if (st === "package") await insertPackage(tx, { productId, ...(subtypePayload || {}) })
		}
	})
}
