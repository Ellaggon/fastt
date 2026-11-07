import { expect, it, vi } from "vitest"
import { readTourRequestData, withTourProjectionReads } from "@/lib/tours/tourRequestReads"

it("coalesces post-commit reads without reusing earlier command observations", async () => {
	const request = new Request("https://fastt.test/save", { method: "POST" })
	let value = "before"
	const load = vi.fn(async () => value)
	expect(await readTourRequestData(request, "aggregate:p:x", load)).toBe("before")
	value = "after"
	await withTourProjectionReads(async () => {
		const results = await Promise.all([
			readTourRequestData(request, "aggregate:p:x", load),
			readTourRequestData(request, "aggregate:p:x", load),
		])
		expect(results).toEqual(["after", "after"])
	})
	expect(load).toHaveBeenCalledTimes(2)
	value = "later"
	expect(await readTourRequestData(request, "aggregate:p:x", load)).toBe("later")
})

it("isolates concurrent projections and nested refresh operations", async () => {
	const result = await Promise.all(
		["first", "second"].map((value) =>
			withTourProjectionReads(async () => {
				await Promise.resolve()
				return readTourRequestData(undefined, "same-key", async () => value)
			})
		)
	)
	expect(result).toEqual(["first", "second"])
	await withTourProjectionReads(async () => {
		expect(await readTourRequestData(undefined, "key", async () => 1)).toBe(1)
		expect(
			await withTourProjectionReads(() => readTourRequestData(undefined, "key", async () => 2))
		).toBe(2)
	})
})

it("does not retain rejected observations after the projection ends", async () => {
	await expect(
		withTourProjectionReads(() =>
			readTourRequestData(undefined, "key", async () => {
				throw new Error("read failed")
			})
		)
	).rejects.toThrow("read failed")
	await expect(
		withTourProjectionReads(() => readTourRequestData(undefined, "key", async () => "fresh"))
	).resolves.toBe("fresh")
})
