type MemoryEntry = {
	value: string
	expiresAt: number
}

type RedisDriver = {
	get: (key: string) => Promise<string | null>
	set: (key: string, value: string, ttlSeconds: number) => Promise<void>
	del: (key: string) => Promise<void>
	delByPrefix: (prefix: string) => Promise<void>
}

const memory = new Map<string, MemoryEntry>()
let redisDriverPromise: Promise<RedisDriver | null> | null = null

function sweepMemory(now = Date.now()): void {
	for (const [key, entry] of memory.entries()) {
		if (entry.expiresAt <= now) memory.delete(key)
	}
}

async function createRedisDriverFromNodeRedis(redisUrl: string): Promise<RedisDriver | null> {
	try {
		const dynamicImport = new Function("specifier", "return import(specifier)") as (
			specifier: string
		) => Promise<any>
		const mod = await dynamicImport("redis")
		const client = mod.createClient({ url: redisUrl })
		client.on("error", () => {})
		await client.connect()
		return {
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
				const keys = await client.keys(`${prefix}*`)
				if (keys.length > 0) await client.del(keys)
			},
		}
	} catch {
		return null
	}
}

async function createRedisDriverFromUpstashRest(redisUrl: string): Promise<RedisDriver | null> {
	const token = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
	if (!token) return null
	if (!redisUrl.startsWith("http://") && !redisUrl.startsWith("https://")) return null

	const endpoint = redisUrl.replace(/\/+$/, "")

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
			const keys = (await command(["KEYS", `${prefix}*`])) as string[] | null
			if (!keys || keys.length === 0) return
			await Promise.all(keys.map((key) => command(["DEL", key])))
		},
	}
}

async function resolveRedisDriver(): Promise<RedisDriver | null> {
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

export async function get(key: string): Promise<unknown | null> {
	const driver = await getDriver()
	if (driver) {
		try {
			const raw = await driver.get(key)
			return raw == null ? null : JSON.parse(raw)
		} catch {
			// Fallback to in-memory when Redis is unavailable.
		}
	}

	const now = Date.now()
	const entry = memory.get(key)
	if (!entry) return null
	if (entry.expiresAt <= now) {
		memory.delete(key)
		return null
	}
	return JSON.parse(entry.value)
}

export async function set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
	const ttlMs = Math.max(1, Math.floor(ttlSeconds)) * 1000
	const raw = JSON.stringify(value)
	const driver = await getDriver()
	if (driver) {
		try {
			await driver.set(key, raw, Math.max(1, Math.floor(ttlSeconds)))
			return
		} catch {
			// Fallback to in-memory when Redis is unavailable.
		}
	}

	memory.set(key, { value: raw, expiresAt: Date.now() + ttlMs })
	if (memory.size > 500) sweepMemory()
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
