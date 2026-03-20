import { db, eq, and, DailyInventory, Booking, BookingRoomDetail } from "astro:db"

import { randomUUID } from "node:crypto"
import { InventoryReservationService } from "@/modules/inventory/public"
import { RecomputeInventoryService } from "@/modules/inventory/infrastructure/services/RecomputeInventoryService"

export class BookingService {
	private inventoryEngine = new InventoryReservationService()
	private recomputeService = new RecomputeInventoryService()

	async createBooking(params: {
		userId?: string
		variantId: string
		ratePlanId: string
		checkIn: string
		checkOut: string
		quantity: number
		adults: number
		children: number
		totalPrice: number
	}) {
		const start = new Date(params.checkIn)
		const end = new Date(params.checkOut)

		const days: string[] = []
		const current = new Date(start)

		while (current < end) {
			days.push(current.toISOString().split("T")[0])
			current.setDate(current.getDate() + 1)
		}

		const bookingId = randomUUID()

		await db.transaction(async (tx) => {
			/* 1️⃣ VALIDAR INVENTARIO */

			for (const date of days) {
				const daily = await tx
					.select()
					.from(DailyInventory)
					.where(and(eq(DailyInventory.variantId, params.variantId), eq(DailyInventory.date, date)))
					.get()

				if (!daily) {
					throw new Error("Inventory missing for date " + date)
				}

				const available = daily.totalInventory - daily.reservedCount

				if (available < params.quantity) {
					throw new Error("Not enough inventory for date " + date)
				}
			}

			/* 2️⃣ RESERVAR INVENTARIO */

			for (const date of days) {
				const daily = await tx
					.select()
					.from(DailyInventory)
					.where(and(eq(DailyInventory.variantId, params.variantId), eq(DailyInventory.date, date)))
					.get()

				const newReserved = this.inventoryEngine.reserve({
					totalInventory: daily!.totalInventory,
					reservedCount: daily!.reservedCount,
					quantity: params.quantity,
				})

				await tx
					.update(DailyInventory)
					.set({
						reservedCount: newReserved,
					})
					.where(eq(DailyInventory.id, daily!.id))
			}

			/* 3️⃣ CREAR BOOKING (CABECERA) */

			await tx.insert(Booking).values({
				id: bookingId,
				userId: params.userId ?? null,
				ratePlanId: params.ratePlanId,
				checkInDate: new Date(params.checkIn),
				checkOutDate: new Date(params.checkOut),
				numAdults: params.adults,
				numChildren: params.children,
				totalAmountUSD: params.totalPrice,
				status: "confirmed",
				currency: "USD",
				source: "web",
				confirmedAt: new Date(),
			})

			/* 4️⃣ CREAR BOOKING ROOM DETAIL */

			await tx.insert(BookingRoomDetail).values({
				id: randomUUID(),
				bookingId,
				variantId: params.variantId,
				ratePlanId: params.ratePlanId,
				checkIn: params.checkIn,
				checkOut: params.checkOut,
				adults: params.adults,
				children: params.children,
				basePrice: params.totalPrice,
				taxes: 0,
				totalPrice: params.totalPrice,
			})
		})

		/* 5️⃣ RECOMPUTE INVENTORY */

		for (const date of days) {
			await this.recomputeService.recompute(params.variantId, date)
		}

		return bookingId
	}
}
