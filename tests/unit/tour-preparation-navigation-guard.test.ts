import { afterEach, describe, expect, it, vi } from "vitest"
import { installTourPreparationNavigationGuard } from "@/lib/forms/tourPreparationNavigationGuard"

afterEach(() => vi.unstubAllGlobals())
function setup() {
	const documentEvents = new Map<string, (event: any) => void>(),
		rootEvents = new Map<string, (event: any) => void>(),
		windowEvents = new Map<string, (event: any) => void>()
	class FakeElement {
		closest() {
			return form
		}
	}
	class FakeForm extends FakeElement {
		isConnected = true
		entries = [["name", "Original"]]
	}
	const form = new FakeForm()
	class FakeLink extends FakeElement {
		href = "http://localhost/product/tour/images"
		target = ""
		hasAttribute() {
			return false
		}
		closest() {
			return this as any
		}
	}
	let busy = false,
		dynamicDirty = false
	const root = {
		dataset: {},
		isConnected: true,
		querySelectorAll: () => [form],
		querySelector: (selector: string) =>
			selector.includes("data-uploading") ? (busy ? {} : null) : dynamicDirty ? {} : null,
		addEventListener: (name: string, handler: any) => rootEvents.set(name, handler),
	}
	const confirm = vi.fn(() => false),
		alert = vi.fn(),
		disconnect = vi.fn()
	vi.stubGlobal("Element", FakeElement)
	vi.stubGlobal("HTMLFormElement", FakeForm)
	vi.stubGlobal(
		"FormData",
		class {
			constructor(readonly form: FakeForm) {}
			entries() {
				return this.form.entries
			}
		}
	)
	vi.stubGlobal(
		"MutationObserver",
		class {
			observe() {}
			disconnect = disconnect
		}
	)
	vi.stubGlobal("document", {
		querySelector: () => root,
		addEventListener: (name: string, handler: any) => documentEvents.set(name, handler),
		removeEventListener: vi.fn(),
	})
	vi.stubGlobal("window", {
		location: { href: "http://localhost/product/tour/presentation" },
		confirm,
		alert,
		addEventListener: (name: string, handler: any) => windowEvents.set(name, handler),
		removeEventListener: vi.fn(),
	})
	installTourPreparationNavigationGuard()
	function click() {
		const event = {
			target: new FakeLink(),
			button: 0,
			preventDefault: vi.fn(),
			stopImmediatePropagation: vi.fn(),
		}
		documentEvents.get("click")!(event)
		return event
	}
	const edit = () => {
		form.entries = [["name", "Edited"]]
		rootEvents.get("input")!({ target: new FakeElement() })
	}
	return {
		click,
		edit,
		confirm,
		alert,
		disconnect,
		documentEvents,
		windowEvents,
		form,
		setBusy: () => {
			busy = true
		},
		setDynamicDirty: () => {
			dynamicDirty = true
		},
	}
}
describe("tour navigation protects work without pretending local drafts are saved", () => {
	it("allows jumping with no changes and keeps cancelled navigation on the form", () => {
		const page = setup()
		expect(page.click().preventDefault).not.toHaveBeenCalled()
		page.edit()
		expect(page.click().preventDefault).toHaveBeenCalled()
		expect(page.confirm).toHaveBeenCalledOnce()
	})
	it("blocks stage changes during file upload without offering to abandon it", () => {
		const page = setup()
		page.setBusy()
		expect(page.click().preventDefault).toHaveBeenCalled()
		expect(page.confirm).not.toHaveBeenCalled()
		expect(page.alert).toHaveBeenCalledOnce()
	})
	it("a confirmed save clears only the saved form's warning", () => {
		const page = setup()
		page.edit()
		page.documentEvents.get("fastt:playbook-saved")!(
			new CustomEvent("fastt:playbook-saved", { detail: { form: page.form } })
		)
		expect(page.click().preventDefault).not.toHaveBeenCalled()
		expect(page.confirm).not.toHaveBeenCalled()
	})
	it("guards dynamic calendar changes and releases listeners on a page swap", () => {
		const page = setup()
		page.setDynamicDirty()
		expect(page.click().preventDefault).toHaveBeenCalled()
		const event = { preventDefault: vi.fn(), returnValue: undefined }
		page.windowEvents.get("beforeunload")!(event)
		expect(event.preventDefault).toHaveBeenCalled()
		page.documentEvents.get("astro:before-swap")!({})
		expect(page.disconnect).toHaveBeenCalledOnce()
	})
})
