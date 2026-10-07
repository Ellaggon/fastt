import { describe, expect, it, vi } from "vitest"
import { createTourBookingQuestionsEditor } from "@/lib/tours/tourBookingQuestionsEditor"

const question = { id: "existing-id", code: "language" as const, label: "Idioma", required: false }
describe("tour booking questions recovery", () => {
	it.each([401, 404, 500])(
		"does not treat HTTP %s as an empty configuration or allow a save",
		async (status) => {
			const fetcher = vi.fn().mockResolvedValue(Response.json({ error: "failed" }, { status }))
			const editor = createTourBookingQuestionsEditor("tour", fetcher)
			await expect(editor.load()).rejects.toThrow()
			await expect(editor.save([])).rejects.toThrow("Carga las preguntas")
			expect(fetcher).toHaveBeenCalledTimes(1)
			expect(editor.questions).toBeNull()
		}
	)
	it("recovers a lost read without erasing existing optional questions", async () => {
		const fetcher = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("offline"))
			.mockResolvedValueOnce(Response.json({ questions: [question] }))
		const editor = createTourBookingQuestionsEditor("tour", fetcher)
		await expect(editor.load()).rejects.toThrow("offline")
		expect(await editor.load()).toEqual([question])
		expect(editor.questions).toEqual([question])
	})
	it("rejects a malformed read instead of enabling the editor", async () => {
		const fetcher = vi.fn().mockResolvedValue(Response.json({ questions: null }))
		const editor = createTourBookingQuestionsEditor("tour", fetcher)
		await expect(editor.load()).rejects.toThrow()
		await expect(editor.save([])).rejects.toThrow()
	})
	it("confirms a real empty configuration and an explicit save", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ questions: [] }))
			.mockResolvedValueOnce(Response.json({ ok: true, questions: [question] }))
		const editor = createTourBookingQuestionsEditor("tour", fetcher)
		expect(await editor.load()).toEqual([])
		expect(await editor.save([question])).toEqual([question])
		expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
			productId: "tour",
			questions: [question],
		})
	})
	it("keeps the confirmed state after a lost save response and permits a retry", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ questions: [question] }))
			.mockRejectedValueOnce(new TypeError("lost response"))
			.mockResolvedValueOnce(Response.json({ ok: true, questions: [] }))
		const editor = createTourBookingQuestionsEditor("tour", fetcher)
		await editor.load()
		await expect(editor.save([])).rejects.toThrow("lost response")
		expect(editor.questions).toEqual([question])
		expect(await editor.save([])).toEqual([])
	})
	it("coalesces duplicate submissions and does not claim success before the response", async () => {
		let complete!: (response: Response) => void
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ questions: [question] }))
			.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						complete = resolve
					})
			)
		const editor = createTourBookingQuestionsEditor("tour", fetcher)
		await editor.load()
		const first = editor.save([])
		expect(editor.save([])).toBe(first)
		expect(editor.questions).toEqual([question])
		complete(Response.json({ ok: true, questions: [] }))
		await first
		expect(fetcher).toHaveBeenCalledTimes(2)
	})
})
