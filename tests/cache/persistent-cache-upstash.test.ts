import { afterEach, describe, expect, it, vi } from "vitest"

const originalEnv = { ...process.env }

describe("persistent cache Upstash REST configuration", () => {
	afterEach(() => {
		process.env = { ...originalEnv }
		vi.unstubAllGlobals()
		vi.resetModules()
	})

	it("activates Upstash without requiring REDIS_URL", async () => {
		delete process.env.REDIS_URL
		process.env.UPSTASH_REDIS_REST_URL = "https://cache.example.test"
		process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"
		const values = new Map<string, string>()
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const args = JSON.parse(String(init?.body)) as string[]
			const [command, key, value] = args
			let result: unknown = null
			if (command === "SET") {
				values.set(key, value)
				result = "OK"
			} else if (command === "GET") {
				result = values.get(key) ?? null
			} else if (command === "DEL") {
				values.delete(key)
				result = 1
			}
			return new Response(JSON.stringify({ result }), { status: 200 })
		})
		vi.stubGlobal("fetch", fetchMock)

		const persistentCache = await import("@/lib/cache/persistentCache")
		await persistentCache.set("upstash-only", { enabled: true }, 30)

		await expect(persistentCache.get("upstash-only")).resolves.toEqual({ enabled: true })
		await expect(persistentCache.getRuntimeStatus()).resolves.toEqual({
			configured: true,
			configuredBackend: "upstash-rest",
			activeBackend: "upstash-rest",
		})
		await expect(persistentCache.verifyRuntimeConnection()).resolves.toEqual({
			ok: true,
			backend: "upstash-rest",
		})
		expect(fetchMock).toHaveBeenCalled()
	})

	it("serves repeated reads from bounded L1 without another REST round trip", async () => {
		delete process.env.REDIS_URL
		process.env.UPSTASH_REDIS_REST_URL = "https://cache.example.test"
		process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"
		process.env.FASTT_CACHE_L1_TTL_SECONDS = "15"
		const values = new Map<string, string>()
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const [command, key, value] = JSON.parse(String(init?.body)) as string[]
			if (command === "SET") values.set(key, value)
			return new Response(
				JSON.stringify({ result: command === "GET" ? (values.get(key) ?? null) : "OK" }),
				{ status: 200 }
			)
		})
		vi.stubGlobal("fetch", fetchMock)

		const persistentCache = await import("@/lib/cache/persistentCache")
		await persistentCache.set("l1-read", { fast: true }, 30)
		fetchMock.mockClear()

		await expect(persistentCache.get("l1-read")).resolves.toEqual({ fast: true })
		expect(fetchMock).not.toHaveBeenCalled()
	})
})
