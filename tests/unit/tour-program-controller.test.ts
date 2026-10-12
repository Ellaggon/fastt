import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { transpileModule, ScriptTarget, ModuleKind } from "typescript"
import { expect, it, vi } from "vitest"
import { experienceProgramLines } from "@/shared/domain/experience-format"
import {
	isPlaybookMode,
	isCompleteToPublishPlaybookMode,
	resolvePlaybookRedirectAfterSave,
} from "@/lib/playbook/playbook-nav"
function controller({
	invalid = false,
	status = 200,
	intent = "continue",
	error = false,
	minimum = 1,
	program = "Práctica",
	context = "prepare",
} = {}) {
	const data = {
		productId: "tour",
		playbook:
			context === "edit" ? "" : context === "review" ? "complete-to-publish" : "launch-tour",
		playbookVertical: "tour",
		flow: context === "review" ? "complete" : context === "edit" ? "" : "create",
		returnTo:
			context === "review"
				? "/product/tour/preview?playbook=complete-to-publish&step=preview&flow=complete&variantId=option&ratePlanId=rate"
				: "/product/tour?variantId=option&ratePlanId=rate",
		variantId: "option",
		ratePlanId: "rate",
	}
	class Form {
		dataset = { isTour: "true", programMinimum: String(minimum) }
		listener: any
		addEventListener(_: string, fn: any) {
			this.listener = fn
		}
	}
	const form = new Form()
	const controls = new Map<string, any>()
	for (const [id, value] of Object.entries({
		duration: "1 hora",
		durationMinutes: invalid ? "0" : "60",
		meetingPointAddress: "Sala",
		tourItinerary: program,
		tourIncludes: "Materiales",
	}))
		controls.set(id, { value, setAttribute() {}, focus: vi.fn() })
	const get = (id: string) => {
		if (id === "subtypeForm") return form
		if (!controls.has(id)) {
			const classes = new Set(["hidden"])
			controls.set(id, {
				textContent: "",
				href: "",
				classList: {
					add: (value: string) => classes.add(value),
					remove: (value: string) => classes.delete(value),
					toggle: (value: string, present: boolean) =>
						present ? classes.add(value) : classes.delete(value),
					contains: (value: string) => classes.has(value),
				},
			})
		}
		return controls.get(id)
	}
	const clear = vi.fn(),
		busy = vi.fn()
	let failNetwork = error
	const fetch = vi.fn(async (_url: string, _options: { body: FormData }) => {
		void _url
		void _options
		if (failNetwork) throw new Error("network technical details")
		return {
			ok: status === 200,
			status,
			text: async () => JSON.stringify({ error: "El formato cambió." }),
		}
	})
	const window = {
		location: {
			pathname: "/product/tour/subtype",
			search: "?playbook=launch-tour&variantId=option&ratePlanId=rate",
			href: "",
		},
	}
	const source = readFileSync("src/pages/product/[id]/subtype.astro", "utf8")
		.match(/<script>([\s\S]*?)<\/script>/)![1]
		.replace(/import[\s\S]*?from\s+"[^"]+"\s*/g, "")
	runInNewContext(
		transpileModule(source, {
			compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext },
		}).outputText,
		{
			document: { getElementById: get, addEventListener() {} },
			window,
			HTMLElement: Form,
			HTMLFormElement: Form,
			FormData: class extends FormData {
				constructor() {
					super()
					for (const [key, value] of Object.entries(data)) this.set(key, value)
					for (const [key, control] of controls)
						if ("value" in control) this.set(key, control.value)
				}
			},
			fetch,
			URLSearchParams,
			experienceProgramLines,
			bindPlaybookFormDraft: () => ({ clear }),
			setPlaybookSubmitBusy: busy,
			readPlaybookNavIntent: () => intent,
			isPlaybookMode,
			isCompleteToPublishPlaybookMode,
			resolvePlaybookRedirectAfterSave,
		}
	)
	return {
		submit: () => form.listener({ preventDefault() {}, submitter: null }),
		fetch,
		clear,
		busy,
		get,
		window,
		retry: () => {
			failNetwork = false
		},
	}
}
it("invalid Save and exit never sends, clears or navigates", async () => {
	const page = controller({ invalid: true, intent: "exit" })
	await page.submit()
	expect(page.fetch).not.toHaveBeenCalled()
	expect(page.get("durationMinutes").focus).toHaveBeenCalledOnce()
	expect(page.clear).not.toHaveBeenCalled()
	expect(page.window.location.href).toBe("")
	expect(page.get("durationMinutesError").classList.contains("hidden")).toBe(false)
})
it.each([400, 401, 403, 409, 500])("shows a recoverable %s and preserves edits", async (status) => {
	const page = controller({ status })
	await page.submit()
	expect(page.get("stateDetail").classList.contains("hidden")).toBe(false)
	expect(page.window.location.href).toBe("")
	expect(page.clear).not.toHaveBeenCalled()
	expect(page.busy).toHaveBeenLastCalledWith(expect.anything(), false)
	if (status === 401 || status === 409)
		expect(page.get("stateRecovery").classList.contains("hidden")).toBe(false)
})
it("network failure uses a useful message without technical exception content", async () => {
	const page = controller({ error: true })
	await page.submit()
	expect(page.get("stateDetail").textContent).toContain("Vuelve a intentarlo")
	expect(page.get("stateDetail").textContent).not.toContain("technical")
})
it("only a successful save clears the draft and advances", async () => {
	const page = controller()
	await page.submit()
	expect(page.clear).toHaveBeenCalledOnce()
	expect(page.window.location.href).toContain("/product/tour/location?")
	expect(page.window.location.href).toContain("variantId=option")
})

it.each([
	[3, "Inicio\nCierre", false],
	[3, "Inicio\nRecorrido\nCierre", true],
	[1, "Crear", true],
	[1, "Aprender", true],
	[1, "Degustar", true],
	[3, "Inicio, recorrido, cierre", false],
])("client applies minimum %s to %s", async (minimum, program, valid) => {
	const page = controller({ minimum: minimum as number, program: program as string })
	await page.submit()
	expect(page.fetch.mock.calls.length).toBe(valid ? 1 : 0)
	if (valid) {
		const body = page.fetch.mock.calls[0][1].body as FormData
		expect(body.get("tourItinerary")).toBe(program)
	}
})
it.each(["prepare", "review", "edit"])(
	"successful controller preserves selection from %s",
	async (context) => {
		const page = controller({ context })
		await page.submit()
		const href = new URL(page.window.location.href, "http://test")
		expect(href.pathname).toBe(
			context === "prepare"
				? "/product/tour/location"
				: context === "review"
					? "/product/tour/preview"
					: "/product/tour"
		)
		expect(href.searchParams.get("variantId")).toBe("option")
		expect(href.searchParams.get("ratePlanId")).toBe("rate")
	}
)

it("network retry sends preserved values and only then clears the draft", async () => {
	const page = controller({ error: true })
	await page.submit()
	expect(page.clear).not.toHaveBeenCalled()
	page.retry()
	await page.submit()
	expect(page.fetch.mock.calls[0][1].body.get("tourItinerary")).toBe(
		page.fetch.mock.calls[1][1].body.get("tourItinerary")
	)
	expect(page.clear).toHaveBeenCalledOnce()
})
