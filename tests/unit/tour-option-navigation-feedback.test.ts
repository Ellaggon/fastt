import { afterEach, expect, it, vi } from "vitest"
vi.mock("@/lib/forms/playbookFormBusy", () => ({
	setPlaybookFooterContinueBusy: vi.fn(),
	setPlaybookNavigationBusy: vi.fn(),
}))
import { bindOptionNavigation, navigateOptionDestination } from "@/lib/forms/tourOptionNavigation"
import {
	setPlaybookFooterContinueBusy,
	setPlaybookNavigationBusy,
} from "@/lib/forms/playbookFormBusy"
const source =
	"http://localhost/product/p/departures/v?playbook=add-tour-option&sessionId=s&variantId=v&ratePlanId=r"
const destination =
	"/rates/calendar?playbook=add-tour-option&sessionId=s&productId=p&variantId=v&ratePlanId=r"
function setup() {
	let handler: (event: any) => Promise<void>
	const root = {
		addEventListener: vi.fn((_event: string, callback: any) => {
			handler = callback
		}),
	}
	const feedback = { hidden: true, textContent: "" }
	const marker = {
		dataset: { sessionId: "s", revision: "1" } as Record<string, string>,
		closest: () => root,
		querySelector: () => feedback,
	}
	class Link {
		href = `http://localhost${destination}`
		target = ""
		closest() {
			return this
		}
		hasAttribute() {
			return false
		}
	}
	vi.stubGlobal("Element", Link)
	vi.stubGlobal("document", { querySelector: () => marker, addEventListener: vi.fn() })
	const assign = vi.fn()
	vi.stubGlobal("location", { href: source, origin: "http://localhost", assign })
	vi.stubGlobal("window", { location: { href: source } })
	bindOptionNavigation()
	const click = (extra = {}) => {
		const event = {
			target: new Link(),
			defaultPrevented: false,
			button: 0,
			preventDefault() {
				this.defaultPrevented = true
			},
			...extra,
		}
		return { event, run: () => handler!(event) }
	}
	return { marker, feedback, assign, click, root }
}
afterEach(() => {
	vi.unstubAllGlobals()
	vi.clearAllMocks()
})
it("persists once before navigation, with immediate feedback and preserved selection", async () => {
	const fixture = setup()
	let resolve: (value: Response) => void
	const fetch = vi.fn((_url: string, _options: RequestInit) => {
		void _url
		void _options
		return new Promise<Response>((done) => {
			resolve = done
		})
	})
	vi.stubGlobal("fetch", fetch)
	const click = fixture.click()
	const pending = click.run()
	expect(click.event.defaultPrevented).toBe(true)
	expect(setPlaybookFooterContinueBusy).toHaveBeenCalledWith(
		expect.anything(),
		true,
		"Guardando continuación…"
	)
	await fixture.click().run()
	expect(fetch).toHaveBeenCalledTimes(1)
	expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toMatchObject({
		sessionId: "s",
		lastPath: destination,
		revision: 1,
	})
	resolve!(Response.json({ href: destination, revision: 2 }))
	await pending
	expect(setPlaybookNavigationBusy).toHaveBeenCalled()
	expect(fixture.assign).toHaveBeenCalledWith(destination)
})
it("restores the link and shows a visible error when session persistence fails", async () => {
	const fixture = setup()
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			Response.json({ message: "Recarga para recuperar la sesión." }, { status: 409 })
		)
	)
	await fixture.click().run()
	expect(fixture.assign).not.toHaveBeenCalled()
	expect(fixture.feedback).toMatchObject({
		hidden: false,
		textContent: "Recarga para recuperar la sesión.",
	})
	expect(fixture.marker.dataset.navigating).toBeUndefined()
	expect(setPlaybookFooterContinueBusy).toHaveBeenLastCalledWith(expect.anything(), false)
})
it("gives imperative calendar buttons immediate feedback and releases the lock on navigation timeout", async () => {
	const fixture = setup()
	const button = {} as HTMLElement
	let resolve!: (response: Response) => void
	const fetch = vi.fn(
		() =>
			new Promise<Response>((done) => {
				resolve = done
			})
	)
	vi.stubGlobal("fetch", fetch)
	const pending = navigateOptionDestination(destination, button)
	expect(setPlaybookFooterContinueBusy).toHaveBeenCalledWith(
		button,
		true,
		"Guardando continuación…"
	)
	expect(fixture.assign).not.toHaveBeenCalled()
	await navigateOptionDestination(destination, button)
	expect(fetch).toHaveBeenCalledTimes(1)
	resolve(Response.json({ href: destination, revision: 2 }))
	await pending
	expect(fixture.assign).toHaveBeenCalledWith(destination)
	expect(fixture.marker.dataset.navigating).toBe("true")
	const recover = vi.mocked(setPlaybookNavigationBusy).mock.calls.at(-1)?.[1]
	recover?.()
	expect(fixture.marker.dataset.navigating).toBeUndefined()
})
it("restores imperative buttons after a rejected continuation without navigating", async () => {
	const fixture = setup()
	const button = {} as HTMLElement
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ message: "Sesión desactualizada" }, { status: 409 }))
	)
	await expect(navigateOptionDestination(destination, button)).rejects.toThrow(
		"Sesión desactualizada"
	)
	expect(fixture.assign).not.toHaveBeenCalled()
	expect(fixture.marker.dataset.navigating).toBeUndefined()
	expect(setPlaybookFooterContinueBusy).toHaveBeenLastCalledWith(button, false)
})
it.each([
	{ defaultPrevented: true },
	{ metaKey: true },
	{ ctrlKey: true },
	{ shiftKey: true },
	{ button: 1 },
])("respects cancelled navigation and browser tab gestures: %o", async (extra) => {
	const fixture = setup()
	const fetch = vi.fn()
	vi.stubGlobal("fetch", fetch)
	await fixture.click(extra).run()
	expect(fetch).not.toHaveBeenCalled()
	expect(setPlaybookFooterContinueBusy).not.toHaveBeenCalled()
})
