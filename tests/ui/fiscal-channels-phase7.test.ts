import { readFileSync } from "node:fs"
import { expect, test } from "vitest"
const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")
test("channel fiscal sync blocks incompatibilities and requires confirmation", () => {
	const api = read("src/pages/api/provider/tax-fees/channels.ts")
	expect(read("src/lib/taxes-fees/channel-capabilities.ts")).toContain("unsupportedFiscalFields")
	expect(api).toContain("channel_incompatible")
	expect(api).toContain("idempotencyKey")
	expect(api).toContain('status: "confirmed"')
	expect(read("src/components/tax-fees/FiscalChannelSync.tsx")).toContain("Confirmación requerida")
})
