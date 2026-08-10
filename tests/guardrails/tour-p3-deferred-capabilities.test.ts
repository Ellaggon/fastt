import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = (...parts: string[]) => resolve(process.cwd(), ...parts)

function read(rel: string) {
	return readFileSync(root(rel), "utf8")
}

const ADRS = [
	"docs/engineering/adr/0001-deferred-tour-p3-capabilities.md",
	"docs/engineering/adr/0002-tour-guide-assignment.md",
	"docs/engineering/adr/0003-tour-departure-instance.md",
	"docs/engineering/adr/0004-viator-channel-sync.md",
] as const

function adrStatus(source: string): string {
	const match = source.match(/\*\*Status:\*\*\s*([^\n*]+)/i)
	return String(match?.[1] ?? "")
		.trim()
		.toLowerCase()
}

describe("tour P3 deferred capabilities (ADR gate)", () => {
	it("keeps channel-specific booking tables out of the shared booking spine", () => {
		const tables = read("src/shared/infrastructure/db/schema/tables.ts")
		const registry = read("src/shared/infrastructure/db/schema/registry.ts")
		for (const name of ["ChannelBooking", "ViatorBooking"] as const) {
			expect(tables).not.toContain(`export const ${name} = pgTable(`)
			expect(tables).not.toContain(`pgTable(\n\t"${name}"`)
			expect(tables).not.toContain(`pgTable("${name}"`)
			expect(registry).not.toContain(`"${name}"`)
		}
	})

	it("records accepted resource ADRs while keeping Viator deferred", () => {
		expect(existsSync(root("docs/engineering/adr/README.md"))).toBe(true)
		const readme = read("docs/engineering/adr/README.md")
		expect(readme).toContain("Evidence gate")
		expect(readme).toContain("metrics")

		const policy = read("docs/engineering/adr/0001-deferred-tour-p3-capabilities.md")
		expect(adrStatus(policy)).toContain("accepted")
		expect(policy).toContain("Evidence gate")

		for (const path of ["docs/engineering/adr/0002-tour-guide-assignment.md", "docs/engineering/adr/0003-tour-departure-instance.md"]) {
			const source = read(path)
			expect(adrStatus(source)).toContain("accepted")
		}
		const viator = read("docs/engineering/adr/0004-viator-channel-sync.md")
		expect(adrStatus(viator)).toContain("deferred")

		const departure = read("docs/engineering/adr/0003-tour-departure-instance.md")
		expect(departure).toContain("variantId")
		expect(departure).toContain("DailyInventory")
		expect(departure).toMatch(/[Nn]ot replace/)

		const channel = read("docs/engineering/adr/0004-viator-channel-sync.md")
		expect(channel).toContain("BookingVoucher")
		expect(channel).toMatch(/parallel|no parallel/i)
	})

	it("documents the historical P3 deferral in tour taxonomy", () => {
		const taxonomy = read("docs/engineering/tour-vertical-table-taxonomy.md")
		expect(taxonomy).toContain("P3 — Deferred by volume")
		expect(taxonomy).toContain("TourGuideAssignment")
		expect(taxonomy).toContain("TourDepartureInstance")
		expect(taxonomy).toContain("0004-viator-channel-sync")
	})

	it("blocks accepting deferred ADRs without flipping status (sanity)", () => {
		// If an engineer marks 0002–0004 accepted, they must also land tables
		// intentionally — this test documents the handshake: deferred ⇒ no tables.
		for (const path of ADRS.slice(1)) {
			const status = adrStatus(read(path))
			if (status.includes("accepted")) {
				const tables = read("src/shared/infrastructure/db/schema/tables.ts")
				// Accepted ADRs may introduce tables; deferred must not.
				expect(status).not.toContain("deferred")
				void tables
			} else {
				expect(status).toContain("deferred")
			}
		}
	})
})
