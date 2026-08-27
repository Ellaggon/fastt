import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("database compatibility facade", () => {
	it("keeps a finite server-side API instead of re-exporting the full ORM or schema", () => {
		const facade = read("src/shared/infrastructure/db/compat.ts")

		expect(facade).not.toMatch(/export\s*\*/)
		expect(facade).toContain('from "drizzle-orm"')
		expect(facade).toContain('from "./schema/tables"')
		expect(facade).not.toContain('from "./schema"')
	})

	it("keeps the connection and convenience helper local to the facade", () => {
		const facade = read("src/shared/infrastructure/db/compat.ts")

		expect(facade).toContain("export const db = postgresDb")
		expect(facade).toContain("export function first")
	})
})
