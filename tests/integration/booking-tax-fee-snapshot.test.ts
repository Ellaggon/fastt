import { describe, it, expect } from "vitest"

import { snapshotTaxFeesForBookingUseCase } from "@/container/taxes-fees.container"
import {
	computeTaxBreakdown,
	type ResolvedTaxFeeDefinition,
	type TaxFeeBreakdown,
	type TaxFeeDefinition,
	type TaxFeeLine,
} from "@/modules/taxes-fees/public"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import { BookingTaxFee, db, Booking, eq } from "astro:db"

describe("integration/booking tax/fee snapshot", () => {
	const buildResolved = (partial: Partial<TaxFeeDefinition>): ResolvedTaxFeeDefinition => {
		const definition: TaxFeeDefinition = {
			id: partial.id ?? crypto.randomUUID(),
			providerId: partial.providerId ?? null,
			code: partial.code ?? "TAX",
			name: partial.name ?? "Tax",
			kind: partial.kind ?? "tax",
			calculationType: partial.calculationType ?? "percentage",
			value: partial.value ?? 10,
			currency: partial.currency ?? null,
			inclusionType: partial.inclusionType ?? "excluded",
			appliesPer: partial.appliesPer ?? "stay",
			priority: partial.priority ?? 0,
			jurisdictionJson: partial.jurisdictionJson ?? null,
			effectiveFrom: partial.effectiveFrom ?? null,
			effectiveTo: partial.effectiveTo ?? null,
			status: partial.status ?? "active",
			createdAt: partial.createdAt ?? new Date(),
			updatedAt: partial.updatedAt ?? new Date(),
		}

		return {
			definition,
			source: {
				scope: "product",
				scopeId: "prod_snapshot",
				definitionId: definition.id,
			},
		}
	}

	it("stores computed tax/fee lines and breakdown immutably", async () => {
		const bookingId = `booking_tax_${crypto.randomUUID()}`
		const providerId = `prov_tax_${crypto.randomUUID()}`
		const destinationId = `dest_tax_${crypto.randomUUID()}`
		const productId = `prod_tax_${crypto.randomUUID()}`
		const variantId = `var_tax_${crypto.randomUUID()}`
		const templateId = `rpt_tax_${crypto.randomUUID()}`
		const ratePlanId = `rp_tax_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Dest",
			type: "city",
			country: "CL",
			slug: `dest-${destinationId}`,
		})
		await upsertProvider({ id: providerId, displayName: "Prov", ownerEmail: "tax@example.com" })
		await upsertProduct({
			id: productId,
			name: "Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Room",
			currency: "USD",
			basePrice: 100,
		})
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "prepaid",
			refundable: false,
		})
		await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: true, isDefault: true })

		await db.insert(Booking).values({
			id: bookingId,
			ratePlanId,
			checkInDate: new Date("2026-03-10"),
			checkOutDate: new Date("2026-03-11"),
			numAdults: 2,
			numChildren: 0,
		})

		const line: TaxFeeLine = {
			definitionId: "def_1",
			code: "VAT",
			name: "VAT",
			kind: "tax",
			calculationType: "percentage",
			value: 10,
			currency: null,
			inclusionType: "excluded",
			appliesPer: "stay",
			priority: 0,
			amount: 10,
			source: { scope: "product", scopeId: "prod_1", definitionId: "def_1" },
		}

		const breakdown: TaxFeeBreakdown = {
			base: 100,
			taxes: { included: [], excluded: [line] },
			fees: { included: [], excluded: [] },
			total: 110,
		}

		await snapshotTaxFeesForBookingUseCase({ bookingId, breakdown })

		const rows = await db
			.select()
			.from(BookingTaxFee)
			.where(eq(BookingTaxFee.bookingId, bookingId))
			.all()
		expect(rows.length).toBe(1)
		expect(rows[0].totalAmount).toBe(110)
		expect(rows[0].breakdownJson).toEqual(breakdown)
		expect(rows[0].lineJson).toEqual(line)
	})

	it("stores mixed included/excluded tax breakdown for realistic booking", async () => {
		const bookingId = `booking_tax_${crypto.randomUUID()}`
		const providerId = `prov_tax_${crypto.randomUUID()}`
		const destinationId = `dest_tax_${crypto.randomUUID()}`
		const productId = `prod_tax_${crypto.randomUUID()}`
		const variantId = `var_tax_${crypto.randomUUID()}`
		const templateId = `rpt_tax_${crypto.randomUUID()}`
		const ratePlanId = `rp_tax_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Dest",
			type: "city",
			country: "CL",
			slug: `dest-${destinationId}`,
		})
		await upsertProvider({ id: providerId, displayName: "Prov", ownerEmail: "tax2@example.com" })
		await upsertProduct({
			id: productId,
			name: "Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Room",
			currency: "USD",
			basePrice: 200,
		})
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "prepaid",
			refundable: false,
		})
		await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: true, isDefault: true })

		await db.insert(Booking).values({
			id: bookingId,
			ratePlanId,
			checkInDate: new Date("2026-03-12"),
			checkOutDate: new Date("2026-03-14"),
			numAdults: 2,
			numChildren: 0,
		})

		const breakdown = computeTaxBreakdown({
			base: 200,
			definitions: [
				buildResolved({ code: "VAT", value: 19, inclusionType: "included" }),
				buildResolved({ code: "CITY", value: 5, inclusionType: "excluded" }),
			],
			nights: 2,
			guests: 2,
		})

		await snapshotTaxFeesForBookingUseCase({ bookingId, breakdown })

		const rows = await db
			.select()
			.from(BookingTaxFee)
			.where(eq(BookingTaxFee.bookingId, bookingId))
			.all()
		expect(rows.length).toBe(2)
		expect(rows[0].breakdownJson).toEqual(breakdown)
		expect(rows[0].totalAmount).toBe(210)
	})
})
