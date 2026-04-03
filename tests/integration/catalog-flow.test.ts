import { describe, it, expect } from "vitest"
import {
	createProductUseCase,
	productRepository,
	variantRepository,
	dailyInventoryRepository,
	roomRepository,
	inventoryBootstrapper,
} from "@/container"
import { upsertDestination } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider, upsertRoomType } from "../test-support/catalog-db-test-data"
import { deleteProduct, updateProduct } from "@/modules/catalog/public"
import { updateProductAndSubtype } from "@/lib/services/productService"

describe("integration/catalog flow", () => {
	it("create product -> create room -> update product -> delete product", async () => {
		const destinationId = "dest_int_catalog"
		const providerId = "prov_int_catalog"
		const productWithRoomId = "prod_int_catalog_room"
		const productToDeleteId = "prod_int_catalog_delete"

		await upsertDestination({
			id: destinationId,
			name: "Catalog Test Destination",
			type: "city",
			country: "CL",
			slug: "catalog-test-destination",
		})

		await upsertProvider({
			id: providerId,
			displayName: "Catalog Test Provider",
			ownerEmail: "provider@example.com",
		})

		// Seed required lookup row for HotelRoomType.roomTypeId FK.
		await upsertRoomType({
			id: "double",
			name: "Habitacion Doble",
			maxOccupancy: 2,
			description: "Test room type",
		})

		// A) create product -> assert exists
		await createProductUseCase({
			id: productWithRoomId,
			name: "Test Hotel",
			description: "Initial",
			productType: "Hotel",
			providerId,
			destinationId,
			images: ["https://example.com/a.jpg"],
		})

		const created = await productRepository.getProductWithImagesAndSubtype(productWithRoomId)
		expect(created).not.toBeNull()
		expect(created!.product.id).toBe(productWithRoomId)
		expect(created!.images.length).toBe(1)

		// Ensure Hotel subtype exists so room creation passes hotelExistsByProductId().
		await updateProductAndSubtype(
			productWithRoomId,
			providerId,
			{ productType: "Hotel", lastUpdated: new Date() },
			"hotel",
			{}
		)

		// B) create room -> assert variant + inventory bootstrap
		// Note: we call repositories directly here (still via container) to keep the flow deterministic.
		const { hotelRoomId, variantId } = await roomRepository.createHotelRoom({
			hotelId: productWithRoomId,
			roomTypeId: "double",
			totalRooms: 4,
			hasView: null,
			maxOccupancyOverride: undefined,
			bedType: null,
			sizeM2: undefined,
			bathroom: undefined,
			hasBalcony: false,
			variant: {
				name: "Room A",
				description: null,
				currency: "USD",
				basePrice: 150,
			},
			amenityIds: [],
			imageUrls: [],
		})

		expect(hotelRoomId).toBeTruthy()

		// Bootstrap only a small deterministic window for integration testing.
		await inventoryBootstrapper.bootstrapVariantInventory({ variantId, totalInventory: 4, days: 2 })

		const v = await variantRepository.getById(variantId)
		expect(v).not.toBeNull()
		expect(v!.productId).toBe(productWithRoomId)
		expect(v!.pricing.basePrice).toBe(150)

		const checkIn = new Date()
		const checkOut = new Date()
		checkOut.setDate(checkIn.getDate() + 2)

		const inv = await dailyInventoryRepository.getRange(variantId, checkIn, checkOut)
		expect(inv.length).toBeGreaterThan(0)
		expect(inv.every((r) => r.totalInventory === 4)).toBe(true)

		// C) update product -> assert changes persisted
		const fd = new FormData()
		fd.set("name", "Renamed Hotel")
		fd.set("description", "Updated Desc")
		fd.set("productType", "Hotel")

		const updResp = await updateProduct({
			updateProductAndSubtype,
			productId: productWithRoomId,
			providerId,
			formData: fd,
		})
		expect(updResp.status).toBe(200)

		const updated = await productRepository.getProductWithImagesAndSubtype(productWithRoomId)
		expect(updated).not.toBeNull()
		expect(updated!.product.name).toBe("Renamed Hotel")

		// D) delete product -> assert expected behavior (simple product without rooms)
		await createProductUseCase({
			id: productToDeleteId,
			name: "Delete Me",
			description: null,
			productType: "Hotel",
			providerId,
			destinationId,
			images: [],
		})

		const delResp = await deleteProduct({
			ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
			deleteCascade: (pid) => productRepository.deleteProductCascade(pid),
			productId: productToDeleteId,
			providerId,
		})
		expect(delResp.status).toBe(200)
		expect(await delResp.json()).toEqual({ ok: true })

		const after = await productRepository.getProductWithImagesAndSubtype(productToDeleteId)
		expect(after).toBeNull()
	})
})
