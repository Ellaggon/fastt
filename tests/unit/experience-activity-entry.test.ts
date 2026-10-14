import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { transpileModule, ScriptTarget } from "typescript"
import { expect, it, vi } from "vitest"
function setup(stored = "museum", confirmResult = false) {
	const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	const key = "fastt:tour-presentation-create:provider"
	const values = new Map([
		[key, id],
		[
			`fastt:playbook-form-draft:tour-presentation:provider:${id}`,
			JSON.stringify({ entries: [{ key: "primaryActivityCategoryId", value: stored }] }),
		],
	])
	const resume = { hidden: true, href: "" },
		confirm = vi.fn(() => confirmResult),
		prevent = vi.fn()
	let submit: Function = () => {}
	let selected = "tasting"
	const form = {
		dataset: { owner: "provider" },
		action: "https://fastt.test/product/create",
		querySelectorAll: () => [{ value: "museum" }, { value: "tasting" }],
		addEventListener: (_event: string, callback: Function) => {
			submit = callback
		},
	}
	const source = readFileSync("src/pages/product/create/activity.astro", "utf8").match(
		/<script>([\s\S]*?)<\/script>/
	)![1]
	runInNewContext(
		transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2022 } }).outputText,
		{
			document: {
				querySelector: (selector: string) => (selector.includes("activity-entry") ? form : resume),
				addEventListener() {},
			},
			sessionStorage: {
				getItem: (k: string) => values.get(k) ?? null,
				removeItem: (k: string) => values.delete(k),
			},
			HTMLFormElement: Object,
			URL,
			confirm,
			FormData: class extends FormData {
				constructor() {
					super()
					this.set("type", "Tour")
					this.set("playbook", "launch-tour")
					this.set("activityId", selected)
					this.set("variantId", "option")
					this.set("ratePlanId", "rate")
					this.set("returnTo", "/catalog/tours")
				}
			},
		}
	)
	return {
		resume,
		values,
		confirm,
		key,
		submit: () => submit({ preventDefault: prevent }),
		prevent,
		choose: (value: string) => {
			selected = value
		},
	}
}
it("resume keeps the saved activity, option, rate and return", () => {
	const page = setup()
	expect(page.resume.hidden).toBe(false)
	const url = new URL(page.resume.href, "https://fastt.test")
	expect(url.searchParams.get("activityId")).toBe("museum")
	expect(url.searchParams.get("variantId")).toBe("option")
	expect(url.searchParams.get("ratePlanId")).toBe("rate")
	expect(url.searchParams.get("returnTo")).toBe("/catalog/tours")
})
it("cancelling another activity keeps the original draft identity", () => {
	const page = setup()
	page.submit()
	expect(page.prevent).toHaveBeenCalledOnce()
	expect(page.values.has(page.key)).toBe(true)
})
it("starting another activity preserves the original draft content for recovery", () => {
	const page = setup("museum", true)
	const before = page.values.size
	page.submit()
	expect(page.prevent).not.toHaveBeenCalled()
	expect(page.values.has(page.key)).toBe(false)
	expect(page.values.size).toBe(before - 1)
})
it("an obsolete stored activity never becomes a valid automatic selection", () => {
	const page = setup("obsolete")
	expect(page.resume.hidden).toBe(true)
})
