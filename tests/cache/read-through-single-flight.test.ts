import { afterEach, describe, expect, it, vi } from "vitest"

const { cache, cacheGet, cacheSet } = vi.hoisted(() => {
	const cache = new Map<string, unknown>()
	return {
		cache,
		cacheGet: vi.fn(async (key: string) => cache.get(key) ?? null),
		cacheSet: vi.fn(async (key: string, value: unknown) => {
			cache.set(key, value)
		}),
	}
})

vi.mock("@/lib/cache/persistentCache", () => ({
	get: cacheGet,
	set: cacheSet,
}))

import { readThrough } from "@/lib/cache/readThrough"

describe("readThrough single-flight", () => {
	afterEach(() => {
		cache.clear()
		vi.clearAllMocks()
	})

	it("coalesces concurrent misses for the same key", async () => {
		let release!: (value: { value: string }) => void
		const pending = new Promise<{ value: string }>((resolve) => {
			release = resolve
		})
		const fetcher = vi.fn(() => pending)
		const key = `single-flight:${crypto.randomUUID()}`

		const reads = Array.from({ length: 12 }, () => readThrough(key, 30, fetcher))
		await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
		release({ value: "shared" })

		await expect(Promise.all(reads)).resolves.toEqual(
			Array.from({ length: 12 }, () => ({ value: "shared" }))
		)
		expect(fetcher).toHaveBeenCalledTimes(1)
		expect(cacheSet).toHaveBeenCalledTimes(1)
	})

	it("clears a rejected calculation so a later request can retry", async () => {
		const key = `single-flight-retry:${crypto.randomUUID()}`
		await expect(
			readThrough(key, 30, async () => {
				throw new Error("temporary")
			})
		).rejects.toThrow("temporary")

		await expect(readThrough(key, 30, async () => "recovered")).resolves.toBe("recovered")
	})

	it("does not block the response on shared cache persistence", async () => {
		let release!: () => void
		const persisted = new Promise<void>((resolve) => {
			release = resolve
		})
		cacheSet.mockImplementationOnce(async (key: string, value: unknown) => {
			cache.set(key, value)
			await persisted
		})

		await expect(
			readThrough(`non-blocking-set:${crypto.randomUUID()}`, 30, async () => "ready")
		).resolves.toBe("ready")
		expect(cacheSet).toHaveBeenCalledTimes(1)
		release()
		await persisted
	})
})
