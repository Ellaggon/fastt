import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import Subnav from "@/components/provider/ProviderSettingsSubnav.astro"

describe("commercial agreement entrypoint", () => {
	it("provides a permanent settings destination with a normal navigation that mounts its scripts", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Subnav, {
			request: new Request("https://fastt.test/provider/settings/payments"),
		})
		expect(html).toContain("Acuerdo comercial")
		const link = html.match(/<a\b[^>]*href="\/provider\/settings\/payments"[^>]*>/)?.[0] ?? ""
		expect(link).toContain('aria-current="page"')
		expect(link).toContain("data-astro-reload")
		expect(link).not.toContain("data-provider-settings-nav")
	})
	it("keeps activity and safety free of duplicate contract controls", () => {
		const workspace = readFileSync(
			"src/components/provider/ProviderVerificationWorkspace.astro",
			"utf8"
		)
		expect(workspace).not.toContain("Revisar acuerdo comercial")
		expect(workspace).not.toContain("/provider/settings/payments")
		const payments = readFileSync("src/pages/provider/settings/payments.astro", "utf8")
		expect(payments).not.toContain("showSettingsTabs={false}")
	})
})
