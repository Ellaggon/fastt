import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

function read(path: string) {
	return readFileSync(path, "utf8")
}

describe("ui/BottomToast", () => {
	it("expone un toast inferior reutilizable con cierre y auto-dismiss", () => {
		const component = read("src/components/ui/BottomToast.astro")
		const client = read("src/lib/ui/bottomToastClient.ts")

		expect(component).toContain("data-bottom-toast")
		expect(component).toContain("data-bottom-toast-dismiss")
		expect(component).toContain("fixed inset-x-0 bottom-0")
		expect(component).toContain("bg-black/95")
		expect(component).toContain('variant = "success"')
		expect(component).toContain("clearQueryParam")
		expect(component).toContain("installBottomToastController")
		expect(client).toContain("installBottomToastController")
		expect(client).toContain("clearQueryParam")
		expect(client).toContain("astro:page-load")
	})
})
