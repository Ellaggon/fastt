import { afterEach, describe, expect, it, vi } from "vitest"
import {
	setPlaybookSubmitBusy,
	setPlaybookFooterContinueBusy,
	setPlaybookNavigationBusy,
} from "@/lib/forms/playbookFormBusy"

class Control {
	dataset: Record<string, string> = {}
	childNodes: any[] = [{ textContent: "Continuar", icon: true }]
	disabled = false
	type = "submit"
	name = "playbookNav"
	value = "continue"
	id = "form"
	hidden = true
	textContent = ""
	attrs = new Map<string, string>()
	classes = new Set<string>()
	classList = {
		contains: (s: string) => this.classes.has(s),
		add: (...s: string[]) => s.forEach((v) => this.classes.add(v)),
		toggle: (s: string, on: boolean) => (on ? this.classes.add(s) : this.classes.delete(s)),
	}
	setAttribute(k: string, v: string) {
		this.attrs.set(k, v)
	}
	getAttribute(k: string) {
		return this.attrs.get(k) ?? null
	}
	removeAttribute(k: string) {
		this.attrs.delete(k)
	}
	replaceChildren(...nodes: any[]) {
		this.childNodes = nodes
	}
	closest() {
		return footer
	}
	querySelector() {
		return status
	}
	querySelectorAll() {
		return controls
	}
}
class Button extends Control {}
class Anchor extends Control {}
let controls: Control[] = []
let footer: Control
let status: Control
function setup() {
	footer = new Control()
	status = new Control()
	vi.stubGlobal("HTMLElement", Control)
	vi.stubGlobal("HTMLButtonElement", Button)
	vi.stubGlobal("HTMLAnchorElement", Anchor)
	vi.stubGlobal("CSS", { escape: (s: string) => s })
	vi.stubGlobal("document", {
		querySelector: () => footer,
		querySelectorAll: () => [],
		createElement: () => new Control(),
		createTextNode: (textContent: string) => ({ textContent }),
	})
}
afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})
describe("shared playbook progress", () => {
	it("shows saving without an explicit label and restores icons and disabled fields on failure", () => {
		setup()
		const button = new Button()
		const disabled = new Button()
		disabled.disabled = true
		controls = [button, disabled]
		const original = button.childNodes[0]
		setPlaybookSubmitBusy(new Control() as any, true)
		expect(button.getAttribute("aria-busy")).toBe("true")
		expect(button.childNodes[1].textContent).toContain("Guardando")
		expect(status.hidden).toBe(false)
		setPlaybookSubmitBusy(new Control() as any, false)
		expect(button.childNodes[0]).toBe(original)
		expect(button.disabled).toBe(false)
		expect(disabled.disabled).toBe(true)
	})
	it("makes links busy accessibly and restores them for a retry", () => {
		setup()
		const link = new Anchor()
		controls = [link]
		setPlaybookFooterContinueBusy(link as any, true, "Guardando continuación…")
		expect(link.getAttribute("aria-disabled")).toBe("true")
		setPlaybookFooterContinueBusy(link as any, false)
		expect(link.getAttribute("aria-disabled")).toBeNull()
		expect(link.childNodes[0].icon).toBe(true)
	})
	it("recovers a navigation that never leaves without resubmitting data", () => {
		setup()
		vi.useFakeTimers()
		const link = new Anchor()
		controls = [link]
		setPlaybookNavigationBusy(link as any)
		expect(link.childNodes[1].textContent).toContain("Cargando")
		vi.advanceTimersByTime(15000)
		expect(link.getAttribute("aria-busy")).toBeNull()
		expect(status.textContent).toContain("volver a intentarlo")
	})
})
