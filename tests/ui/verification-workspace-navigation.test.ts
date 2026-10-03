import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"
import { sameLocalTabContext, rememberTabInDestination } from "@/lib/ui/local-tab-navigation"

const script = readFileSync(
	new URL(
		"../../src/pages/provider/settings/_client/verification-trust-panels.js",
		import.meta.url
	),
	"utf8"
).replace(/^import[^\n]+\n/, "")

function client(
	current: string,
	href: string,
	canonical = false,
	options: { tab?: string; panel?: boolean; initial?: string } = {}
) {
	const listeners = new Map<string, (event: unknown) => void>()
	const pushState = vi.fn()
	const assign = vi.fn()
	class Link {
		getAttribute(name: string) {
			if (name === "href") return href
			if (name === "data-verification-tab-link") return options.tab ?? null
			return null
		}
		closest(selector: string): Link | null {
			return selector === "a[href]" ||
				(canonical && selector === "[data-verification-business-nav]")
				? this
				: null
		}
	}
	const event = {
		button: 0,
		defaultPrevented: false,
		target: new Link(),
		preventDefault: vi.fn(),
	}
	runInNewContext(script, {
		sameLocalTabContext,
		rememberTabInDestination,
		URL,
		Element: Link,
		Event,
		document: {
			querySelector: (selector: string) => {
				if (selector === "[data-verification-workspace]") {
					return {
						getAttribute: (name: string) =>
							name === "data-verification-rendered-tabs"
								? "identity activity safety fiscal"
								: name === "data-verification-initial-url"
									? (options.initial ?? current)
									: "identity",
						setAttribute: vi.fn(),
						querySelectorAll: () => [],
					}
				}
				if (
					options.panel !== false &&
					options.tab &&
					selector === `[data-verification-trust-panel="${options.tab}"]`
				) {
					return { id: options.tab }
				}
				return null
			},
			querySelectorAll: () => [],
			addEventListener: (name: string, callback: (event: unknown) => void) =>
				listeners.set(name, callback),
		},
		window: {
			location: {
				href: current,
				origin: new URL(current).origin,
				pathname: new URL(current).pathname,
				assign,
			},
			history: { pushState },
			addEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
			requestAnimationFrame: (callback: () => void) => callback(),
			scrollTo: vi.fn(),
			matchMedia: () => ({ matches: true }),
		},
	})
	listeners.get("click")?.(event)
	return { event, pushState, assign, listeners }
}

const base = "https://fastt.test/provider/settings/verification"
it("claims history only when the complete permitted tab belongs to the loaded object", () => {
	for (const [experience, expected] of [
		["a", true],
		["b", false],
	] as const) {
		const result = client(
			`${base}?line=tour&tab=identity&experience=${experience}`,
			"https://elsewhere.test",
			false,
			{ tab: "identity", initial: `${base}?line=tour&tab=safety&experience=a` }
		)
		const history = { preventDefault: vi.fn() }
		result.listeners.get("fastt:before-history-navigation")?.(history)
		expect(history.preventDefault).toHaveBeenCalledTimes(expected ? 1 : 0)
	}
})
it("leaves an unavailable history panel to the server router", () => {
	const current = `${base}?line=tour&tab=payments`
	const result = client(current, "https://elsewhere.test", false, {
		tab: "payments",
		initial: current,
	})
	const history = { preventDefault: vi.fn() }
	result.listeners.get("fastt:before-history-navigation")?.(history)
	expect(history.preventDefault).not.toHaveBeenCalled()
})
describe("verification workspace server navigation", () => {
	it.each([
		["tour", "safety", "identity"],
		["tour", "identity", "activity"],
		["tour", "activity", "safety"],
		["tour", "identity", "fiscal"],
		["lodging", "identity", "business"],
		["lodging", "business", "payments"],
	])("lets the router load the complete %s workspace from %s to %s", (line, from, to) => {
		const result = client(
			`${base}?line=${line}&tab=${from}&experience=a`,
			`${base}?line=${line}&tab=${to}&experience=a`,
			true
		)
		expect(result.event.preventDefault).not.toHaveBeenCalled()
		expect(result.pushState).not.toHaveBeenCalled()
		expect(result.assign).not.toHaveBeenCalled()
	})
	it("switches an already rendered verification tab without reloading", () => {
		const result = client(
			`${base}?line=tour&tab=activity&experience=a&tourTab=activity&returnTo=%2Fproduct%2Fa%2Fpreview`,
			`${base}?line=tour&tab=fiscal&experience=a&tourTab=fiscal&returnTo=%2Fproduct%2Fa%2Fpreview`,
			true,
			{ tab: "fiscal" }
		)
		expect(result.event.preventDefault).toHaveBeenCalled()
		expect(result.pushState).toHaveBeenCalled()
		expect(result.assign).not.toHaveBeenCalled()
	})
	it("reloads when the destination section is not already rendered", () => {
		const result = client(
			`${base}?line=tour&tab=identity&experience=a`,
			`${base}?line=tour&tab=payments&experience=a`,
			true,
			{ tab: "payments", panel: false }
		)
		expect(result.event.preventDefault).not.toHaveBeenCalled()
		expect(result.pushState).not.toHaveBeenCalled()
		expect(result.assign).not.toHaveBeenCalled()
	})
	it("reloads when the tab stays but the experience changes", () => {
		const result = client(
			`${base}?line=tour&tab=activity&experience=a`,
			`${base}?line=tour&tab=activity&experience=b`,
			true,
			{ tab: "activity" }
		)
		expect(result.event.preventDefault).not.toHaveBeenCalled()
		expect(result.assign).not.toHaveBeenCalled()
	})
	it("loads a new query even for a contextual correction outside the tab bar", () => {
		const target = `${base}?line=tour&tab=activity&experience=a#tour-operating-context`
		const result = client(`${base}?line=tour&tab=safety&experience=a`, target)
		expect(result.assign).toHaveBeenCalledWith(
			new URL(target).pathname + new URL(target).search + new URL(target).hash
		)
		expect(result.pushState).not.toHaveBeenCalled()
	})
	it("loads the workspace on a legacy path change", () => {
		const result = client(base, `${base}/fiscal`)
		expect(result.event.preventDefault).not.toHaveBeenCalled()
		expect(result.pushState).not.toHaveBeenCalled()
	})
	it("keeps an anchor within the same loaded panel local", () => {
		const current = `${base}?line=tour&tab=activity&experience=a`
		const result = client(current, `${current}#tour-evidence-tour-activity`)
		expect(result.pushState).toHaveBeenCalled()
		expect(result.assign).not.toHaveBeenCalled()
	})
})

describe("server-authorized hydration", () => {
	it.each([
		"?line=tour&tab=payments",
		"?line=tour&tab=business",
		"/payments?line=tour",
		"?type=business_registration",
	])("ignores legacy browser interpretation of %s", (suffix) => {
		const context = {
			sameLocalTabContext,
			rememberTabInDestination,
			URL,
			Event,
			document: {
				querySelector: () => ({ getAttribute: () => "identity", querySelectorAll: () => [] }),
				querySelectorAll: () => [],
				addEventListener: vi.fn(),
			},
			window: {
				location: { href: base + suffix },
				dispatchEvent: vi.fn(),
				addEventListener: vi.fn(),
			},
		}
		expect(runInNewContext(script + "\nresolveVerificationTrustPanel()", context)).toBe("identity")
	})
})

it("follows the complete server-generated fiscal correction without changing its context", () => {
	const current = `${base}?line=tour&tab=identity&experience=a&lodgingTab=business&tourTab=identity&returnTo=%2Fproduct%2Fa%2Fpreview`
	const target = `${base}?line=tour&tab=fiscal&experience=a&lodgingTab=business&tourTab=fiscal&returnTo=%2Fproduct%2Fa%2Fpreview`
	expect(client(current, target).assign).toHaveBeenCalledWith(
		new URL(target).pathname + new URL(target).search
	)
})
it("does not reconstruct only a subset of navigation for a legacy destination", () => {
	const current = `${base}?line=tour&tab=identity&experience=a&lodgingTab=business&returnTo=%2Fproduct%2Fa%2Fpreview`
	expect(client(current, `${base}/fiscal`).assign).toHaveBeenCalledWith(
		"/provider/settings/verification/fiscal"
	)
})

it.each([
	["#kyc-slots", "tab", "business"],
	["#kyc-slot-government_id", "type", "government_id"],
	["#kyc-slot-business_registration", "type", "business_registration"],
	["#kyc-slot-tax_document", "type", "tax_document"],
	["#verification-status-panel", "tab", "identity"],
])("loads complete SSR for legacy %s and preserves existing context", (hash, key, value) => {
	const current = `${base}?line=tour&experience=a&lodgingTab=fiscal&tourTab=safety&returnTo=%2Fproduct%2Fa%2Fpreview${hash}`
	const result = client(current, current)
	const target = new URL(result.assign.mock.calls[0][0], base)
	expect(target.searchParams.get(key)).toBe(value)
	expect(target.searchParams.get("experience")).toBe("a")
	expect(target.searchParams.get("lodgingTab")).toBe("fiscal")
	expect(target.searchParams.get("returnTo")).toBe("/product/a/preview")
	expect(target.hash).toBe(hash)
	expect(result.pushState).not.toHaveBeenCalled()
})
it("does not translate unknown fragments or override an explicit query selection", () => {
	for (const current of [
		base + "#unknown",
		base + "?line=tour&tab=safety#kyc-slots",
		base + "?type=government_id#kyc-slot-tax_document",
	]) {
		const result = client(current, "https://elsewhere.test/")
		expect(result.assign).not.toHaveBeenCalled()
	}
})
