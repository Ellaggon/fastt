import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"

const source = readFileSync(new URL("../../src/layouts/Layout.astro", import.meta.url), "utf8")
const script = source.match(
	/<script is:inline data-workspace-router-recovery>([\s\S]*?)<\/script>/
)![1]
function setup() {
	const listeners = new Map<string, (event?: unknown) => void>()
	const timers = new Map<number, () => void>()
	let id = 0
	const assign = vi.fn()
	const location = {
		href: "http://localhost:4321/dashboard",
		origin: "http://localhost:4321",
		pathname: "/dashboard",
		assign,
	}
	runInNewContext(script, {
		window: {
			setTimeout: (callback: () => void) => {
				timers.set(++id, callback)
				return id
			},
			clearTimeout: (timer: number) => timers.delete(timer),
		},
		location,
		URL,
		document: {
			querySelector: () => null,
			addEventListener: (name: string, handler: (event?: unknown) => void) =>
				listeners.set(name, handler),
		},
	})
	return { listeners, timers, assign }
}
describe("workspace router recovery", () => {
	it("does not replay submissions or cancelled navigation", () => {
		const app = setup()
		app.listeners.get("astro:before-preparation")!({ to: "/booking", formData: {} })
		expect(app.timers.size).toBe(0)
		app.listeners.get("astro:before-preparation")!({ to: "/booking", signal: { aborted: true } })
		app.timers.values().next().value!()
		expect(app.assign).not.toHaveBeenCalled()
	})
	it("opens the exact destination natively when the loader fails", async () => {
		const app = setup()
		const event = {
			to: "/rates/calendar?productId=A&variantId=B",
			loader: async () => {
				throw new Error("module unavailable")
			},
		}
		app.listeners.get("astro:before-preparation")!(event)
		await expect(event.loader()).rejects.toThrow("module unavailable")
		expect(app.assign).toHaveBeenCalledExactlyOnceWith(
			"http://localhost:4321/rates/calendar?productId=A&variantId=B"
		)
		expect(app.timers.size).toBe(0)
	})
	it("recovers a transition that never completes", () => {
		const app = setup()
		app.listeners.get("astro:before-preparation")!({ to: "/booking" })
		const recovery = app.timers.values().next().value!
		recovery()
		expect(app.assign).toHaveBeenCalledExactlyOnceWith("http://localhost:4321/booking")
	})
	it("does not reload completed or superseded transitions", () => {
		const app = setup()
		app.listeners.get("astro:before-preparation")!({ to: "/booking" })
		const obsolete = app.timers.values().next().value!
		app.listeners.get("astro:before-preparation")!({ to: "/financial" })
		obsolete()
		app.listeners.get("astro:page-load")!()
		expect(app.timers.size).toBe(0)
		expect(app.assign).not.toHaveBeenCalled()
	})
})
