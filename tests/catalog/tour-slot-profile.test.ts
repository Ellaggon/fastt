import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(rel: string) {
	return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("tour slot profile (fase 2)", () => {
	it("defines TourSlotProfile columns including durationMinutes and isActive", () => {
		const tables = read("src/shared/infrastructure/db/schema/tables.ts")
		expect(tables).toContain('export const TourSlotProfile = pgTable(\n\t"TourSlotProfile"')
		expect(tables).toContain("departureTime")
		expect(tables).toContain('durationMinutes: intOpt("durationMinutes")')
		expect(tables).toContain("maxPax")
		expect(tables).toContain('bookingMode: text("bookingMode").notNull().default("shared")')
		expect(tables).toContain('isActive: boolDefault("isActive", true)')

		const closeout = read("db/migrations/2026-08-18_tour_slot_profile_closeout.sql")
		expect(closeout).toContain('"durationMinutes" integer')
		expect(closeout).toContain('"isActive" boolean NOT NULL DEFAULT true')
		expect(closeout).toContain("SET DEFAULT 'shared'")
	})

	it("bootstraps inventory with maxPax and wires salidas provider surface", () => {
		const api = read("src/pages/api/variant/tour-slot-profile.ts")
		expect(api).toContain('kind: "tour_slot"')
		expect(api).toContain("defaultTotalUnits: parsed.maxPax")
		expect(api).toContain("totalInventory: parsed.maxPax")
		expect(api).toContain("durationMinutes")
		expect(api).toContain("isActive: parsed.isActive")

		const createVariant = read(
			"src/modules/catalog/application/use-cases/variant/create-variant.ts"
		)
		expect(createVariant).toContain("defaultTotalUnits?: number")
		expect(createVariant).toContain("tour_slot uses maxPax")

		const routes = read("src/lib/routes.ts")
		expect(routes).toContain("productDeparturesForProduct")
		expect(routes).toContain("/departures")

		const index = read("src/pages/product/[id]/departures/index.astro")
		expect(index).toContain("Salidas del tour")
		expect(index).toContain("horas distintas")
		expect(index).toContain("Tarifas")
		expect(index).toContain("Calendario")

		const hub = read("src/pages/product/[id]/index.astro")
		expect(hub).toContain("productDeparturesForProduct")
		expect(hub).toContain("data-is-tour")
		expect(hub).toContain("isTour")

		const hydration = read("src/pages/product/_client/product-summary-hydration.ts")
		expect(hydration).toContain("Salidas")
		expect(hydration).toContain("config.isTour")
		expect(hydration).toContain("Gestionar salidas")
	})

	it("requires profile + capacity + default rate for tour product readiness", () => {
		const repo = read(
			"src/modules/catalog/infrastructure/repositories/ProductRepository.ts"
		)
		expect(repo).toContain("capacityVariantId: VariantCapacity.variantId")
		expect(repo).toContain("defaultRatePlanId: RatePlan.id")
		expect(repo).toContain("Boolean(row.defaultRatePlanId)")

		const evaluate = read(
			"src/modules/catalog/application/use-cases/product/evaluate-product-readiness.ts"
		)
		expect(evaluate).toContain("tourPublicationValidationErrors")
		const quality = read("src/lib/tours/tourAdminQuality.ts")
		expect(quality).toContain("profile, capacity and rate")
		expect(quality).toContain("missing_tour_schedule")

		const variantReady = read(
			"src/modules/catalog/application/use-cases/variant/evaluate-variant-readiness.ts"
		)
		expect(variantReady).toContain("missing_tour_slot_profile")
		expect(variantReady).toContain("if (isTourSlot) blockingErrors.push(e)")

		const taxonomy = read("docs/engineering/tour-vertical-table-taxonomy.md")
		expect(taxonomy).toContain("profile + capacity + default rate")
		expect(taxonomy).toContain("2026-08-18_tour_slot_profile_closeout.sql")
	})
})

describe("tour booking guest commerce (fase 3)", () => {
	it("wires TourAdapter and PDP hold/confirm with age-band occupancy", () => {
		const adapter = read("src/modules/search/infrastructure/adapters/TourAdapter.ts")
		expect(adapter).toContain("export class TourAdapter")

		const wiring = read("src/modules/search/infrastructure/wiring/configure-search-adapters.ts")
		expect(wiring).toContain('registry.register("tour_slot", tour)')
		expect(wiring).toContain('registry.register("hotel_room", hotel)')

		const pdp = read("src/pages/tours/[id]/index.astro")
		expect(pdp).toContain("tourDepartureToStay")
		expect(pdp).toContain("TourDepartureSection")
		expect(pdp).toContain("searchOffers")
		expect(pdp).toContain("tourTicketsToOccupancyDetail")
		expect(pdp).toContain("TourTicketType")

		const section = read("src/components/tours/TourDepartureSection.astro")
		expect(section).toContain("Fecha de salida")
		expect(section).toContain("data-ticket-qty")
		expect(section).toContain("occupancyDetail")
		expect(section).toContain("/api/inventory/hold")
		expect(section).toContain("/api/booking/confirm")

		const confirmation = read(
			"src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts"
		)
		expect(confirmation).toContain('toLowerCase() === "tour_slot"')
		expect(confirmation).toContain("TourSlotProfile.meetingPointOverrideJson")
		expect(confirmation).toContain("productMeetingPoint: Tour.meetingPointJson")
		expect(confirmation).toContain("meetingPoint: meetingPointSnapshot")
	})
})
