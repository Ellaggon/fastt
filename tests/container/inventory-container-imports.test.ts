import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("inventory container composition", () => {
	it("does not import application services through the module public API", () => {
		const source = readFileSync(
			resolve(process.cwd(), "src/container/inventory.container.ts"),
			"utf8"
		)

		expect(source).toContain('from "../modules/inventory/application/services/InventorySeederService"')
		expect(source).not.toContain('from "@/modules/inventory/public"')
	})
})
