import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
	resolve(process.cwd(), "scripts/db/backfill-hotel-room-inventory-config.ts"),
	"utf8"
)

describe("hotel room inventory config backfill", () => {
	it("is an explicit, audited repair rather than a read-time fallback", () => {
		expect(source).toContain('const apply = hasFlag("--apply")')
		expect(source).toContain("where v.kind = 'hotel_room'")
		expect(source).toContain('and config."variantId" is null')
		expect(source).toContain('max(di."totalInventory") filter (where di."totalInventory" > 0)')
		expect(source).toContain("fallbackRequiresReview: true")
		expect(source).toContain('on conflict ("variantId") do nothing')
		expect(source).toContain("await writeFile(reportPath")
	})
})
