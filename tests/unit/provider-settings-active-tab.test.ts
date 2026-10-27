import { afterEach, expect, it, vi } from "vitest"

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetModules()
})

it("clears the commercial agreement highlight when navigating to another settings tab", async () => {
	class Anchor {
		dataset = { active: "false" }
		attributes = new Map<string, string>()
		constructor(public href: string) {}
		setAttribute(name: string, value: string) {
			this.attributes.set(name, value)
		}
		removeAttribute(name: string) {
			this.attributes.delete(name)
		}
	}
	const paths = [
		"/provider/settings",
		"/provider/settings/profile",
		"/provider/settings/payments",
		"/provider/settings/team",
	]
	const links = paths.map((path) => new Anchor(`http://localhost:4321${path}`))
	links[2].dataset.active = "true"
	links[2].setAttribute("aria-current", "page")
	const location = new URL("http://localhost:4321/dashboard")
	vi.stubGlobal("HTMLAnchorElement", Anchor)
	vi.stubGlobal("window", { location })
	vi.stubGlobal("document", {
		addEventListener: vi.fn(),
		querySelectorAll: (selector: string) => {
			expect(selector).toBe("a[data-provider-settings-tab]")
			return links
		},
	})
	const { syncSettingsSubnavActive, settingsTabCacheKey } =
		await import("@/pages/provider/settings/_client/provider-settings-nav.js")
	expect(settingsTabCacheKey("/provider/settings/profile?edit=1#identity")).toBe(
		"/provider/settings/profile?edit=1"
	)
	expect(settingsTabCacheKey("/provider/settings/profile")).toBe("/provider/settings/profile")
	expect(settingsTabCacheKey("https://example.com/provider/settings")).toBeNull()
	for (const path of [...paths, "/provider/settings/"]) {
		location.pathname = path
		syncSettingsSubnavActive()
		const active = links.filter((link) => link.dataset.active === "true")
		expect(active).toHaveLength(1)
		expect(new URL(active[0].href).pathname).toBe(path.replace(/\/$/, ""))
		expect(active[0].attributes.get("aria-current")).toBe("page")
		expect(links.filter((link) => link.attributes.has("aria-current"))).toHaveLength(1)
	}
})
