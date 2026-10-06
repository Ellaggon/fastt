import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"

function mount() {
	const listeners = new Map<string, () => void>()
	const island = {
		hidden: false,
		ssr: true,
		hasAttribute: () => island.ssr,
		addEventListener: (event: string, fn: () => void) => listeners.set(event, fn),
	}
	const error = { hidden: true }
	const cta = { disabled: true, textContent: "Cargando calendario…" }
	const reload = vi.fn(),
		clearTimeout = vi.fn()
	let deadline!: () => void, reloadClick!: () => void
	const root = {
		dataset: {},
		isConnected: true,
		querySelector: (selector: string) =>
			selector === "astro-island"
				? island
				: selector === "[data-calendar-runtime-error]"
					? error
					: {
							addEventListener: (_event: string, fn: () => void) => {
								reloadClick = fn
							},
						},
	}
	const script = readFileSync("src/components/rates/CalendarRuntimeRecovery.astro", "utf8")
		.split("<script is:inline data-astro-rerun>")[1]
		.split("</script>")[0]
	runInNewContext(script, {
		document: {
			currentScript: { closest: () => root },
			querySelector: () => cta,
			addEventListener: (event: string, fn: () => void) => listeners.set(event, fn),
		},
		window: {
			setTimeout: (fn: () => void) => {
				deadline = fn
				return 1
			},
			clearTimeout,
			location: { reload },
		},
		HTMLButtonElement: Object,
	})
	return {
		island,
		error,
		cta,
		listeners,
		deadline: () => deadline(),
		reload: () => reloadClick(),
		reloadSpy: reload,
		clearTimeout,
	}
}
describe("recovery independent of React download", () => {
	it("replaces an unmounted skeleton and offers a real reload", () => {
		const runtime = mount()
		runtime.deadline()
		expect(runtime.island.hidden).toBe(true)
		expect(runtime.error.hidden).toBe(false)
		expect(runtime.cta.textContent).toBe("Calendario no disponible")
		expect(runtime.cta.disabled).toBe(true)
		runtime.reload()
		expect(runtime.reloadSpy).toHaveBeenCalledOnce()
	})
	it("accepts a late successful mount and cancels timeout on navigation", () => {
		const runtime = mount()
		runtime.deadline()
		runtime.island.ssr = false
		runtime.listeners.get("astro:hydrate")!()
		expect(runtime.island.hidden).toBe(false)
		expect(runtime.error.hidden).toBe(true)
		runtime.listeners.get("astro:before-swap")!()
		expect(runtime.clearTimeout).toHaveBeenCalled()
	})
})
