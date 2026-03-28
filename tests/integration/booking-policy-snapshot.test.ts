import { describe, it, expect } from "vitest"

import { db, Booking, BookingPolicySnapshot, eq } from "astro:db"

import {
	createPolicyCapa6,
	createPolicyVersionCapa6,
	assignPolicyCapa6,
} from "@/modules/policies/public"
import { snapshotPoliciesForBookingUseCase } from "@/container/booking-policy-snapshot.container"

import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
	upsertRatePlanTemplate,
	upsertRatePlan,
} from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/booking policy snapshot (CAPA 6 Step 5)", () => {
	it("creates immutable snapshots; later policy changes do not affect stored snapshot JSON", async () => {
		const destinationId = `dest_bps_${crypto.randomUUID()}`
		const productId = `prod_bps_${crypto.randomUUID()}`
		const variantId = `var_bps_${crypto.randomUUID()}`
		const rptId = `rpt_bps_${crypto.randomUUID()}`
		const ratePlanId = `rp_bps_${crypto.randomUUID()}`
		const bookingId = `bk_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "BP Dest",
			type: "city",
			country: "CL",
			slug: "bp-dest",
		})
		await upsertProduct({ id: productId, name: "BP Product", productType: "Hotel", destinationId })
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: `room_${crypto.randomUUID()}`,
			name: "Room",
		})
		await upsertRatePlanTemplate({
			id: rptId,
			name: "Default",
			paymentType: "pay_at_property",
			refundable: true,
		})
		await upsertRatePlan({
			id: ratePlanId,
			templateId: rptId,
			variantId,
			isActive: true,
			isDefault: true,
		})

		await db.insert(Booking).values({
			id: bookingId,
			userId: null,
			ratePlanId,
			checkInDate: new Date("2026-03-10"),
			checkOutDate: new Date("2026-03-11"),
			numAdults: 2,
			numChildren: 0,
			status: "confirmed",
			source: "web",
		} as any)

		const created = await createPolicyCapa6({
			category: "Other",
			description: "Initial terms",
			rules: { foo: "bar" },
		})
		await assignPolicyCapa6({
			policyId: created.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})

		await snapshotPoliciesForBookingUseCase({
			bookingId,
			productId,
			variantId,
			ratePlanId,
			channel: "web",
		})

		const snapRows = await db
			.select()
			.from(BookingPolicySnapshot)
			.where(eq(BookingPolicySnapshot.bookingId, bookingId))
		expect(snapRows.length).toBeGreaterThan(0)
		const snapJson = (snapRows[0] as any).policySnapshotJson
		expect(snapJson?.policy?.description).toBe("Initial terms")

		// Create a new version (higher version) with different description.
		await createPolicyVersionCapa6({
			previousPolicyId: created.policyId,
			description: "Changed terms",
			rules: { foo: "baz" },
		})

		// Snapshot stored should remain unchanged.
		const snapRows2 = await db
			.select()
			.from(BookingPolicySnapshot)
			.where(eq(BookingPolicySnapshot.bookingId, bookingId))
		const snapJson2 = (snapRows2[0] as any).policySnapshotJson
		expect(snapJson2?.policy?.description).toBe("Initial terms")
	})

	it("snapshots multiple categories", async () => {
		const destinationId = `dest_bps2_${crypto.randomUUID()}`
		const productId = `prod_bps2_${crypto.randomUUID()}`
		const variantId = `var_bps2_${crypto.randomUUID()}`
		const rptId = `rpt_bps2_${crypto.randomUUID()}`
		const ratePlanId = `rp_bps2_${crypto.randomUUID()}`
		const bookingId = `bk2_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "BP2 Dest",
			type: "city",
			country: "CL",
			slug: "bp2-dest",
		})
		await upsertProduct({ id: productId, name: "BP2 Product", productType: "Hotel", destinationId })
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: `room_${crypto.randomUUID()}`,
			name: "Room",
		})
		await upsertRatePlanTemplate({
			id: rptId,
			name: "Default",
			paymentType: "pay_at_property",
			refundable: true,
		})
		await upsertRatePlan({
			id: ratePlanId,
			templateId: rptId,
			variantId,
			isActive: true,
			isDefault: true,
		})

		await db.insert(Booking).values({
			id: bookingId,
			userId: null,
			ratePlanId,
			checkInDate: new Date("2026-03-10"),
			checkOutDate: new Date("2026-03-11"),
			numAdults: 2,
			numChildren: 0,
			status: "confirmed",
			source: "web",
		} as any)

		const p1 = await createPolicyCapa6({ category: "Other", description: "Terms" })
		const p2 = await createPolicyCapa6({ category: "Payment", description: "Pay now" })
		await assignPolicyCapa6({
			policyId: p1.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})
		await assignPolicyCapa6({
			policyId: p2.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})

		await snapshotPoliciesForBookingUseCase({
			bookingId,
			productId,
			variantId,
			ratePlanId,
			channel: null,
		})

		const rows = await db
			.select()
			.from(BookingPolicySnapshot)
			.where(eq(BookingPolicySnapshot.bookingId, bookingId))
		const cats = rows.map((r: any) => String(r.category)).sort()
		expect(cats).toEqual(["Other", "Payment"])
	})
})
