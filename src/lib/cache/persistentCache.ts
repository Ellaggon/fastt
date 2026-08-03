type MemoryEntry = {
	value: string
	expiresAt: number
}

type RedisDriver = {
	kind: "redis" | "upstash-rest"
	get: (key: string) => Promise<string | null>
	set: (key: string, value: string, ttlSeconds: number) => Promise<void>
	del: (key: string) => Promise<void>
	delByPrefix: (prefix: string) => Promise<void>
}

const memory = new Map<string, MemoryEntry>()
let redisDriverPromise: Promise<RedisDriver | null> | null = null
const SCAN_COUNT = 200
const DEFAULT_L1_TTL_SECONDS = 15

function l1TtlMs(ttlSeconds = DEFAULT_L1_TTL_SECONDS): number {
	const configured = Number(process.env.FASTT_CACHE_L1_TTL_SECONDS ?? DEFAULT_L1_TTL_SECONDS)
	const maxSeconds = Number.isFinite(configured) && configured > 0 ? configured : 0
	return Math.max(0, Math.min(ttlSeconds, maxSeconds) * 1000)
}

function readMemory(key: string, now = Date.now()): unknown | null {
	const entry = memory.get(key)
	if (!entry) return null
	if (entry.expiresAt <= now) {
		memory.delete(key)
		return null
	}
	return JSON.parse(entry.value)
}

function writeMemory(key: string, raw: string, ttlSeconds?: number): void {
	const ttlMs = l1TtlMs(ttlSeconds)
	if (ttlMs <= 0) return
	memory.set(key, { value: raw, expiresAt: Date.now() + ttlMs })
	if (memory.size > 500) sweepMemory()
}

function sweepMemory(now = Date.now()): void {
	for (const [key, entry] of memory.entries()) {
		if (entry.expiresAt <= now) memory.delete(key)
	}
}

async function createRedisDriverFromNodeRedis(redisUrl: string): Promise<RedisDriver | null> {
	if (!redisUrl.startsWith("redis://") && !redisUrl.startsWith("rediss://")) return null
	try {
		const dynamicImport = new Function("specifier", "return import(specifier)") as (
			specifier: string
		) => Promise<any>
		const mod = await dynamicImport("redis")
		const client = mod.createClient({ url: redisUrl })
		client.on("error", () => {})
		await client.connect()
		return {
			kind: "redis",
			async get(key: string) {
				return await client.get(key)
			},
			async set(key: string, value: string, ttlSeconds: number) {
				await client.setEx(key, ttlSeconds, value)
			},
			async del(key: string) {
				await client.del(key)
			},
			async delByPrefix(prefix: string) {
				const keys: string[] = []
				if (typeof client.scanIterator === "function") {
					for await (const key of client.scanIterator({
						MATCH: `${prefix}*`,
						COUNT: SCAN_COUNT,
					})) {
						keys.push(String(key))
						if (keys.length >= SCAN_COUNT) {
							await client.del(keys.splice(0))
						}
					}
				} else {
					let cursor = "0"
					do {
						const result = await client.scan(cursor, {
							MATCH: `${prefix}*`,
							COUNT: SCAN_COUNT,
						})
						cursor = String(result.cursor ?? result[0] ?? "0")
						const batch = (result.keys ?? result[1] ?? []) as string[]
						keys.push(...batch)
						if (keys.length >= SCAN_COUNT) {
							await client.del(keys.splice(0))
						}
					} while (cursor !== "0")
				}
				if (keys.length > 0) await client.del(keys)
			},
		}
	} catch {
		return null
	}
}

async function createRedisDriverFromUpstashRest(redisUrl: string): Promise<RedisDriver | null> {
	const token = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
	const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim() || redisUrl
	if (!token) return null
	if (!restUrl.startsWith("http://") && !restUrl.startsWith("https://")) return null

	const endpoint = restUrl.replace(/\/+$/, "")

	async function command(args: string[]): Promise<any> {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(args),
		})
		if (!response.ok) throw new Error(`cache_command_failed:${response.status}`)
		const data = (await response.json()) as { result?: unknown }
		return data.result
	}

	return {
		kind: "upstash-rest",
		async get(key: string) {
			const value = await command(["GET", key])
			return value == null ? null : String(value)
		},
		async set(key: string, value: string, ttlSeconds: number) {
			await command(["SET", key, value, "EX", String(ttlSeconds)])
		},
		async del(key: string) {
			await command(["DEL", key])
		},
		async delByPrefix(prefix: string) {
			let cursor = "0"
			do {
				const result = (await command([
					"SCAN",
					cursor,
					"MATCH",
					`${prefix}*`,
					"COUNT",
					String(SCAN_COUNT),
				])) as [string, string[]] | null
				cursor = String(result?.[0] ?? "0")
				const keys = result?.[1] ?? []
				if (keys.length > 0) await command(["DEL", ...keys])
			} while (cursor !== "0")
		},
	}
}

async function resolveRedisDriver(): Promise<RedisDriver | null> {
	const upstashRestUrl = process.env.UPSTASH_REDIS_REST_URL?.trim()
	if (upstashRestUrl) {
		return await createRedisDriverFromUpstashRest(upstashRestUrl)
	}

	const redisUrl = process.env.REDIS_URL?.trim()
	if (!redisUrl) return null

	const upstashDriver = await createRedisDriverFromUpstashRest(redisUrl)
	if (upstashDriver) return upstashDriver

	return await createRedisDriverFromNodeRedis(redisUrl)
}

async function getDriver(): Promise<RedisDriver | null> {
	if (!redisDriverPromise) {
		redisDriverPromise = resolveRedisDriver().catch(() => null)
	}
	return await redisDriverPromise
}

export async function getRuntimeStatus(): Promise<{
	configured: boolean
	configuredBackend: "redis" | "upstash-rest" | "none"
	activeBackend: "redis" | "upstash-rest" | "memory"
}> {
	const hasUpstashRest = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim())
	const hasRedis = Boolean(process.env.REDIS_URL?.trim())
	const driver = await getDriver()
	return {
		configured: hasUpstashRest || hasRedis,
		configuredBackend: hasUpstashRest ? "upstash-rest" : hasRedis ? "redis" : "none",
		activeBackend: driver?.kind ?? "memory",
	}
}

export async function verifyRuntimeConnection(): Promise<{
	ok: boolean
	backend: "redis" | "upstash-rest" | "memory"
}> {
	const driver = await getDriver()
	if (!driver) return { ok: false, backend: "memory" }

	const key = `infra:cache:${crypto.randomUUID()}`
	const value = JSON.stringify({ ok: true })
	try {
		await driver.set(key, value, 15)
		return { ok: (await driver.get(key)) === value, backend: driver.kind }
	} catch {
		return { ok: false, backend: driver.kind }
	} finally {
		await driver.del(key).catch(() => {})
	}
}

export async function get(key: string): Promise<unknown | null> {
	const local = readMemory(key)
	if (local !== null) return local

	const driver = await getDriver()
	if (driver) {
		try {
			const raw = await driver.get(key)
			if (raw == null) return null
			writeMemory(key, raw)
			return JSON.parse(raw)
		} catch {
			// Fallback to in-memory when Redis is unavailable.
		}
	}

	return readMemory(key)
}

export async function set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
	const raw = JSON.stringify(value)
	writeMemory(key, raw, Math.max(1, Math.floor(ttlSeconds)))
	const driver = await getDriver()
	if (driver) {
		try {
			await driver.set(key, raw, Math.max(1, Math.floor(ttlSeconds)))
			return
		} catch {
			// Fallback to in-memory when Redis is unavailable.
		}
	}
}

export async function del(key: string): Promise<void> {
	const driver = await getDriver()
	if (driver) {
		try {
			await driver.del(key)
		} catch {
			// Fallback still clears local memory.
		}
	}
	memory.delete(key)
}

export async function delByPrefix(prefix: string): Promise<void> {
	const driver = await getDriver()
	if (driver) {
		try {
			await driver.delByPrefix(prefix)
		} catch {
			// Fallback still clears local memory.
		}
	}
	for (const key of memory.keys()) {
		if (key.startsWith(prefix)) memory.delete(key)
	}
}
