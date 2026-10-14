import { expect, it, vi } from "vitest"
import { bindOptionSessionDismissal } from "@/lib/tours/optionSessionDismissal"
function setup(response?: () => Promise<Response>) {
	const handlers = new Map<string, Function>()
	const row = { remove: vi.fn() },
		feedback = { textContent: "", focus: vi.fn() },
		error = { textContent: "" }
	const button = {
		dataset: { abandonOptionSession: "session" },
		disabled: false,
		focus: vi.fn(),
		closest: () => row,
	}
	const control = (key: string) => ({
		disabled: false,
		addEventListener: (event: string, fn: Function) => handlers.set(key + event, fn),
	})
	const confirm = control("confirm"),
		cancel = control("cancel")
	const dialog = {
		showModal: vi.fn(),
		close: vi.fn(),
		addEventListener: (event: string, fn: Function) => handlers.set("dialog" + event, fn),
		querySelector: (selector: string) =>
			selector.includes("confirm") ? confirm : selector.includes("cancel") ? cancel : error,
	}
	const root = {
		dataset: {},
		addEventListener: vi.fn((event: string, fn: Function) => handlers.set("root" + event, fn)),
		querySelector: (selector: string) => (selector.includes("dialog") ? dialog : feedback),
	}
	const request = vi.fn<typeof fetch>(async () =>
		response ? response() : Response.json({ ok: true })
	)
	bindOptionSessionDismissal(root as never, request as typeof fetch)
	return {
		root,
		dialog,
		button,
		row,
		feedback,
		error,
		request,
		confirm,
		cancel,
		open: () => handlers.get("rootclick")!({ target: { closest: () => button } }),
		cancelClick: () => handlers.get("cancelclick")!(),
		submit: () => handlers.get("confirmclick")!(),
	}
}
it("binds only once per page instance, including a fresh instance after navigation", () => {
	const page = setup()
	bindOptionSessionDismissal(page.root as never, page.request as never)
	expect(page.root.addEventListener).toHaveBeenCalledOnce()
	const next = setup()
	next.open()
	expect(next.dialog.showModal).toHaveBeenCalledOnce()
})
it("cancellation never calls the endpoint or removes the row", () => {
	const page = setup()
	page.open()
	page.cancelClick()
	expect(page.request).not.toHaveBeenCalled()
	expect(page.row.remove).not.toHaveBeenCalled()
})
it("only abandons the selected session and confirms preservation of saved data", async () => {
	const page = setup()
	page.open()
	await page.submit()
	expect(JSON.parse(page.request.mock.calls[0][1]!.body as string)).toEqual({
		action: "abandon",
		sessionId: "session",
	})
	expect(page.row.remove).toHaveBeenCalledOnce()
	expect(page.feedback.textContent).toContain("se conservan")
})
it.each([401, 503])("keeps the session row and permits retry after HTTP %s", async (status) => {
	const page = setup(async () => Response.json({ message: "Reintenta" }, { status }))
	page.open()
	await page.submit()
	expect(page.row.remove).not.toHaveBeenCalled()
	expect(page.confirm.disabled).toBe(false)
	expect(page.button.disabled).toBe(false)
	expect(page.error.textContent).not.toBe("")
})
it("never treats a login HTML response as success", async () => {
	const page = setup(async () => new Response("<html>Sign in</html>"))
	page.open()
	await page.submit()
	expect(page.row.remove).not.toHaveBeenCalled()
	expect(page.error.textContent).toContain("Reintenta")
})
