import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("rooms summary operational readiness contract", () => {
	it("keeps configured draft rates distinct from missing rates", () => {
		const summary = read("src/pages/api/internal/rooms-summary.ts")

		expect(summary).toContain('code: "no-rate", label: "Sin tarifa"')
		expect(summary).toContain('code: "rate-draft",')
		expect(summary).toContain('label: "Tarifa en borrador"')
		expect(summary).toContain('code: "conditions-pending"')
		expect(summary).toContain('label: "Condiciones pendientes"')
		expect(summary).toContain('code: "profile-incomplete"')
		expect(summary).toContain('label: "Perfil incompleto"')
		expect(summary).toContain("count: tariffs.length")
	})

	it("renders room cards from the API operational status", () => {
		const rooms = read("src/pages/product/[id]/rooms.astro")

		expect(rooms).toContain("room?.operational?.code")
		expect(rooms).toContain("room?.operational?.label")
		expect(rooms).toContain("Tarifa en borrador:")
		expect(rooms).toContain('room?.operational?.code === "no-rate"')
	})
})
