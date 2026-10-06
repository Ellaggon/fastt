import { afterEach, describe, expect, it, vi } from "vitest"
import {
	CalendarReadError,
	calendarContinueState,
	readCalendarResponse,
} from "../../src/lib/rates/calendarClientRequest"

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})
describe("calendar read recovery", () => {
	it("keeps the exact requested offer and month when reading", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ surface: { month: "2026-11" } })))
		vi.stubGlobal("fetch", fetch)
		const url = "/api/rates/calendar?variantId=A&ratePlanId=rate-A&month=2026-11"
		expect(await readCalendarResponse(url)).toEqual({ surface: { month: "2026-11" } })
		expect(fetch.mock.calls[0][0]).toBe(url)
	})
	it("distinguishes expired authentication", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })))
		await expect(readCalendarResponse("/api/rates/calendar")).rejects.toMatchObject({
			requiresSignIn: true,
		})
	})
	it("ends a stalled read with a recoverable error", async () => {
		vi.useFakeTimers()
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(_url, { signal }) =>
					new Promise((_resolve, reject) =>
						signal.addEventListener("abort", () =>
							reject(new DOMException("Aborted", "AbortError"))
						)
					)
			)
		)
		const pending = expect(readCalendarResponse("/api/rates/calendar")).rejects.toBeInstanceOf(
			CalendarReadError
		)
		await vi.advanceTimersByTimeAsync(20000)
		await pending
	})
	it("preserves cancellation when switching months", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(_url, { signal }) =>
					new Promise((_resolve, reject) =>
						signal.addEventListener("abort", () => reject(signal.reason))
					)
			)
		)
		const controller = new AbortController()
		const pending = expect(
			readCalendarResponse("/api/rates/calendar", controller.signal)
		).rejects.toMatchObject({ name: "AbortError" })
		controller.abort()
		await pending
	})
	it("does not accept an unsuccessful response as saved data", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response('{"error":"Consulta no disponible"}', { status: 503 }))
		)
		await expect(readCalendarResponse("/api/rates/calendar")).rejects.toThrow(
			"Consulta no disponible"
		)
	})
})
describe("truthful guided calendar actions", () => {
	const ready = {
		loading: false,
		failed: false,
		saving: false,
		dirty: false,
		hasAvailability: true,
	}
	it.each([
		[{}, "Continuar a publicación", false],
		[{ dirty: true }, "Guardar y continuar", false],
		[{ hasAvailability: false }, "Completar después", false],
		[{ loading: true }, "Cargando calendario…", true],
		[{ failed: true }, "Calendario no disponible", true],
		[{ saving: true, dirty: true }, "Guardando…", true],
	])("represents %j without claiming a save", (changes, label, disabled) => {
		expect(calendarContinueState({ ...ready, ...changes })).toEqual({ label, disabled })
	})
})

describe("saving before navigation", () => {
	it("waits for confirmed persistence", async () => {
		const { continueCalendarAfterSave } = await import("../../src/lib/rates/calendarClientRequest")
		const navigate = vi.fn()
		let confirm!: (saved: boolean) => void
		const save = () =>
			new Promise<boolean>((resolve) => {
				confirm = resolve
			})
		const pending = continueCalendarAfterSave({
			dirty: true,
			save,
			href: "/product/A/preview?variantId=B&ratePlanId=C",
			navigate,
		})
		expect(navigate).not.toHaveBeenCalled()
		confirm(true)
		expect(await pending).toBe(true)
		expect(navigate).toHaveBeenCalledWith("/product/A/preview?variantId=B&ratePlanId=C")
	})
	it("does not advance after failed saving, but permits a clean summary with pending availability", async () => {
		const { continueCalendarAfterSave } = await import("../../src/lib/rates/calendarClientRequest")
		const navigate = vi.fn(),
			save = vi.fn().mockResolvedValue(false)
		expect(await continueCalendarAfterSave({ dirty: true, save, href: "/review", navigate })).toBe(
			false
		)
		expect(navigate).not.toHaveBeenCalled()
		expect(await continueCalendarAfterSave({ dirty: false, save, href: "/review", navigate })).toBe(
			true
		)
		expect(save).toHaveBeenCalledTimes(1)
	})
})

describe("authentication return", () => {
	it("preserves the failed month's intent and all guided parameters", async () => {
		const { calendarRecoveryReturnTo } = await import("../../src/lib/rates/calendarClientRequest")
		const result = new URL(
			calendarRecoveryReturnTo(
				"http://localhost:4321/rates/calendar?productId=P&playbook=launch-tour&month=2026-10&variantId=B",
				{ month: "2026-11", variantId: "A", ratePlanId: "rate-A" }
			),
			"http://localhost"
		)
		expect(result.searchParams.get("month")).toBe("2026-11")
		expect(result.searchParams.get("variantId")).toBe("A")
		expect(result.searchParams.get("ratePlanId")).toBe("rate-A")
		expect(result.searchParams.get("productId")).toBe("P")
		expect(result.searchParams.get("playbook")).toBe("launch-tour")
	})
})
describe("bounded availability saving", () => {
	it("requires explicit confirmation and rejects partial failures", async () => {
		const { saveCalendarAvailability } = await import("../../src/lib/rates/calendarClientRequest")
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response(
						JSON.stringify({
							summary: { failed: 1 },
							failures: [{ error: "No puedes reducir cupos reservados" }],
						})
					)
				)
		)
		await expect(saveCalendarAvailability({})).rejects.toThrow("No puedes reducir cupos reservados")
	})
	it("ends a lost write response without an automatic retry", async () => {
		const { saveCalendarAvailability } = await import("../../src/lib/rates/calendarClientRequest")
		vi.useFakeTimers()
		const fetch = vi.fn(
			(_url, { signal }) =>
				new Promise((_resolve, reject) =>
					signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
				)
		)
		vi.stubGlobal("fetch", fetch)
		const pending = expect(saveCalendarAvailability({})).rejects.toThrow(
			"No pudimos confirmar el guardado"
		)
		await vi.advanceTimersByTimeAsync(30000)
		await pending
		expect(fetch).toHaveBeenCalledOnce()
	})
})
