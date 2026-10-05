import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { transpileModule, ScriptTarget, ModuleKind } from "typescript"
import { describe, expect, it, vi } from "vitest"

// Run the actual page controller through Astro's repeated page-load lifecycle.
// No network or database mutations: the API deliberately rejects each submission.
describe("tour forms after navigating back", () => {
	it.each([
		["src/pages/product/[id]/subtype.astro", "subtypeForm"],
		["src/pages/product/[id]/content.astro", "contentForm"],
		["src/components/tours/TourSlotProfileEditor.astro", "tour-slot-profile-form"],
	])("binds each new form once and keeps API failures on the page: %s", async (path, formId) => {
		class Form {
			dataset = { variantId: "option", productId: "tour", isTour: "false" } as Record<
				string,
				string
			>
			elements: unknown[] = []
			listeners: Record<string, ((event: any) => unknown)[]> = {}
			addEventListener(name: string, handler: (event: any) => unknown) {
				;(this.listeners[name] ??= []).push(handler)
			}
		}
		let form = new Form()
		const events: Record<string, (() => void)[]> = {}
		const field = () => ({
			value: "Saved description",
			textContent: "",
			classList: { add() {}, remove() {}, toggle() {} },
			setAttribute() {},
			removeAttribute() {},
		})
		const fields = new Map<string, ReturnType<typeof field>>()
		const document = {
			getElementById(id: string) {
				if (id === formId) return form
				if (!fields.has(id)) fields.set(id, field())
				return fields.get(id)
			},
			addEventListener(name: string, handler: () => void) {
				;(events[name] ??= []).push(handler)
			},
		}
		const fetch = vi.fn(async () => ({
			ok: false,
			status: 400,
			text: async () => '{"error":"validation_error"}',
			json: async () => ({ error: "validation_error" }),
		}))
		const source = readFileSync(path, "utf8")
			.match(/<script>([\s\S]*?)<\/script>/)![1]
			.replace(/import[\s\S]*?from\s+"[^"]+"\s*/g, "")
		const js = transpileModule(source, {
			compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext },
		}).outputText
		runInNewContext(js, {
			document,
			fetch,
			HTMLElement: Form,
			HTMLFormElement: Form,
			HTMLInputElement: class {},
			HTMLSelectElement: class {},
			HTMLTextAreaElement: class {},
			HTMLButtonElement: class {},
			FormData: class {
				get() {
					return "tour"
				}
			},
			window: {
				location: { pathname: "/product/tour/subtype", search: "" },
				sessionStorage: { getItem: () => null, removeItem() {} },
				addEventListener() {},
			},
			bindPlaybookFormDraft: () => ({ clear() {} }),
			setPlaybookSubmitBusy() {},
			readPlaybookNavIntent: () => "continue",
			console,
		})
		for (let visit = 0; visit < 3; visit++) {
			if (visit) form = new Form()
			for (let repeat = 0; repeat < 2; repeat++)
				for (const handler of events["astro:page-load"] ?? []) handler()
			expect(form.listeners.submit).toHaveLength(1)
			const preventDefault = vi.fn()
			await form.listeners.submit[0]({ preventDefault, submitter: null })
			expect(preventDefault).toHaveBeenCalledOnce()
			expect(fetch).toHaveBeenCalledTimes(visit + 1)
		}
	})
})
