import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/house-rules P1 guest surfaces", () => {
	it("uses effective guest snapshots on public PDP and provider preview", () => {
		const pdp = read("src/pages/hotels/[id]/index.astro")
		const preview = read("src/pages/product/[id]/preview.astro")
		const panel = read("src/components/house-rules/GuestHouseRulesPanel.astro")
		const bookingRepo = read(
			"src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts"
		)
		const bookingOperations = read(
			"src/modules/booking/infrastructure/repositories/BookingOperationsQueryRepository.ts"
		)
		const bookingDetail = read("src/pages/booking/[id].astro")

		expect(panel).toContain("data-guest-house-rules-effective-block")
		expect(panel).toContain("Estas son las reglas que aplican al reservar este espacio")
		expect(panel).toContain("Esta habitación")
		expect(panel).not.toContain("data-guest-house-rules-hotel-block")
		expect(panel).not.toContain("data-guest-house-rules-room-block")
		expect(panel).not.toContain("Combinación efectiva usada en hold")

		expect(pdp).toContain("GuestHouseRulesPanel")
		expect(pdp).toContain("buildGuestStayExpectationsSnapshot")
		expect(pdp).toContain("roomGuestExpectationsSnapshot")
		expect(pdp).toContain('id="guest-house-rules"')
		expect(pdp).not.toContain("listHouseRulesByProduct")
		expect(pdp).toContain("arrivalCard")
		expect(read("src/components/productUI/RoomSection.astro")).toContain("Horario de esta tarifa")

		expect(preview).toContain("GuestHouseRulesPanel")
		expect(preview).toContain("previewVariantId")
		expect(preview).toContain("previewHouseRulesHref")
		expect(preview).toContain("hotelGuestExpectationsSnapshot")
		expect(preview).toContain("roomGuestExpectationsSnapshot")

		expect(bookingRepo).toContain(
			"guestExpectationsSnapshotJson: Hold.guestExpectationsSnapshotJson"
		)
		expect(bookingRepo).toContain(
			"guestExpectationsSnapshotJson: hold?.guestExpectationsSnapshotJson"
		)
		expect(bookingOperations).toContain("guestExpectations:")
		expect(bookingDetail).toContain("Reglas para huéspedes aceptadas")
	})

	it("locks booking schema for guest expectations snapshot persistence", () => {
		const migration = read("db/migrations/2026-09-25_booking_guest_expectations_snapshot.sql")
		const tables = read("src/shared/infrastructure/db/schema/tables.ts")

		expect(migration).toContain('"guestExpectationsSnapshotJson" jsonb')
		expect(tables).toContain(
			'guestExpectationsSnapshotJson: jsonb("guestExpectationsSnapshotJson")'
		)
	})
})
