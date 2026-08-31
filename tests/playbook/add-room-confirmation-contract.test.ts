import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("add-room completion contract", () => {
	it("activates the guided rate only after initial availability was saved", () => {
		const calendar = read("src/components/rates/SingleCalendarWorkspace.tsx")
		const endpoint = read("src/pages/api/rateplans/activate-guided.ts")
		const finalizer = read("src/lib/playbook/finalize-add-room.ts")

		expect(calendar).toContain('fetch("/api/inventory/bulk-apply"')
		expect(calendar).toContain('fetch("/api/rateplans/activate-guided"')
		expect(calendar).toContain("Finalizar configuración")
		expect(endpoint).toContain("finalizeAddRoom")
		expect(finalizer).toContain("validateRatePlanPublication")
		expect(finalizer).toContain("isActive: true")
		expect(finalizer).toContain("isDefault: true")
	})

	it("uses the availability step to verify initial inventory without exposing operational controls", () => {
		const calendar = read("src/components/rates/SingleCalendarWorkspace.tsx")
		const controls = read("src/lib/rates/calendarControlCatalog.ts")
		const finalizer = read("src/lib/playbook/finalize-add-room.ts")

		expect(calendar).toContain("Verificación de disponibilidad")
		expect(calendar).toContain("inventario inicial")
		expect(calendar).not.toContain("Calendario de apoyo")
		expect(calendar).not.toContain("Desglose activo")
		expect(calendar).toContain("disabled={day.isPast || isGuidedAvailability}")
		expect(calendar).toMatch(
			/showInventoryDetail \|\| isGuidedAvailability\s*\? "block"\s*: "hidden sm:block"/
		)
		expect(controls).toContain('label: "Mostrar reservas y retenidos"')
		expect(finalizer).toContain("Configura inventario inicial para al menos 30 noches.")
	})

	it("keeps the final guided step focused on its room instead of rendering the room list", () => {
		const rooms = read("src/pages/product/[id]/rooms.astro")
		const layout = read("src/layouts/PlaybookLayout.astro")
		const resolver = read("src/lib/playbook/resolve-add-room-confirmation.ts")

		expect(rooms).toContain("!isAddRoomConfirmation ? (")
		expect(rooms).toContain("resolveAddRoomConfirmationPage")
		expect(resolver).toContain("const completion = await loadVariantCompletion(")
		expect(resolver).toContain(
			"if (!completion.inventoryConfigComplete || !completion.profileComplete)"
		)
		expect(resolver).toContain("if (!completion.photosComplete)")
		expect(resolver).toContain("if (!completion.rateConfigured || !completion.pricingComplete)")
		expect(resolver).toContain("if (!completion.conditionsComplete)")
		expect(resolver).toContain("if (!completion.availabilityComplete)")
		expect(resolver).toContain('url.searchParams.set("finalizeError", "activation-pending")')
		expect(rooms).toContain("if (isAddRoomConfirmation) return")
		expect(rooms).not.toContain("requiere una acción")
		expect(layout).toContain("isAddRoomTerminalStep(stepId)")
		expect(layout).toContain("const showProgress = active && currentStepKnown && !isTerminalStep")
		expect(layout).toContain("showProgress ? (")
		expect(layout).toContain(
			"const visualProgressPercent = Math.min(100, Math.max(0, progressPercent))"
		)
		expect(layout).not.toContain("stepPositionPercent")
		expect(layout).not.toContain("Math.max(progressPercent")
	})

	it("uses the same canonical room completion evaluator in the operational summary", () => {
		const summary = read("src/pages/api/internal/rooms-summary.ts")

		expect(summary).toContain("loadVariantCompletion")
		expect(summary).toContain("conditionsComplete")
		expect(summary).toContain("completion?.sellable")
	})
})
