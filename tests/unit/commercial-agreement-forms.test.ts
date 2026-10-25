import { afterEach, describe, expect, it, vi } from "vitest"
import { bindAgreementForms } from "@/lib/commercial-policy/agreement-forms"

afterEach(() => vi.unstubAllGlobals())

describe("commercial agreement form initialization", () => {
	it("binds and submits even when a named action field shadows the native property", async () => {
		let submit: (event: { preventDefault(): void }) => Promise<void>
		const feedback = { textContent: "" }
		const form = {
			action: { name: "action", value: "request" },
			dataset: {} as Record<string, string>,
			getAttribute: () => "/api/provider/settings/commercial-agreement",
			hasAttribute: () => false,
			querySelector: (selector: string) =>
				selector === "[data-agreement-feedback]" ? feedback : null,
			querySelectorAll: () => [],
			addEventListener: (_event: string, listener: typeof submit) => {
				submit = listener
			},
			reportValidity: () => true,
			setAttribute: vi.fn(),
			removeAttribute: vi.fn(),
		}
		vi.stubGlobal("document", {
			baseURI: "http://localhost:4321/provider/settings/payments?scope=tour",
			querySelectorAll: () => [form],
		})
		vi.stubGlobal(
			"location",
			new URL("http://localhost:4321/provider/settings/payments?scope=tour")
		)
		const NativeFormData = FormData
		vi.stubGlobal(
			"FormData",
			class extends NativeFormData {
				constructor() {
					super()
					this.set("action", "request")
				}
			}
		)
		const fetch = vi.fn().mockResolvedValue(Response.json({ error: "forbidden" }, { status: 403 }))
		vi.stubGlobal("fetch", fetch)
		expect(() => bindAgreementForms()).not.toThrow()
		expect(form.dataset.bound).toBe("true")
		await submit!({ preventDefault: vi.fn() })
		expect(fetch).toHaveBeenCalledWith(
			"http://localhost:4321/api/provider/settings/commercial-agreement",
			expect.objectContaining({ method: "POST" })
		)
		expect(feedback.textContent).toBe("Tu cuenta no tiene permiso para realizar esta acción.")
		expect(form.removeAttribute).toHaveBeenCalledWith("aria-busy")
	})
})
