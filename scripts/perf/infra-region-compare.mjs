const rawUrls = process.env.FASTT_INFRA_URLS || process.argv.slice(2).join(",")
const token = process.env.FASTT_INFRA_HEALTH_TOKEN?.trim()
const attempts = Number(process.env.FASTT_INFRA_ATTEMPTS || 3)

const urls = rawUrls
	.split(",")
	.map((url) => url.trim())
	.filter(Boolean)

if (urls.length === 0) {
	console.error("Set FASTT_INFRA_URLS or pass one or more deployment URLs.")
	process.exit(1)
}

function endpointFor(baseUrl) {
	return new URL("/api/internal/observability/infra-region", baseUrl).toString()
}

function summarize(values) {
	const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
	if (sorted.length === 0) return { min: null, p50: null, p95: null, max: null }
	const pick = (percentile) =>
		sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1)]
	return {
		min: Number(sorted[0].toFixed(1)),
		p50: Number(pick(0.5).toFixed(1)),
		p95: Number(pick(0.95).toFixed(1)),
		max: Number(sorted[sorted.length - 1].toFixed(1)),
	}
}

async function measure(baseUrl, attempt) {
	const startedAt = performance.now()
	const response = await fetch(endpointFor(baseUrl), {
		headers: {
			accept: "application/json",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		cache: "no-store",
	})
	const totalMs = Number((performance.now() - startedAt).toFixed(1))
	let body = {}
	try {
		body = await response.json()
	} catch {
		body = { error: "invalid_json" }
	}
	return {
		url: baseUrl,
		attempt,
		status: response.status,
		totalMs,
		region: response.headers.get("x-fastt-region") || body.region || null,
		dbMs: body.database?.postgres?.durationMs ?? null,
		redisMs: body.cache?.durationMs ?? null,
		runtimeUsesPooler: body.database?.runtimeUsesPooler ?? null,
		hasDirectUrl: body.database?.hasDirectUrl ?? null,
		cacheConfigured: body.cache?.driverConfigured ?? null,
		error: body.error || body.database?.postgres?.error || body.cache?.error || null,
	}
}

let exitCode = 0

for (const url of urls) {
	const samples = []
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const sample = await measure(url, attempt)
			samples.push(sample)
			console.log(JSON.stringify(sample))
			if (sample.status >= 400) exitCode = 1
		} catch (error) {
			exitCode = 1
			console.error(
				JSON.stringify({
					url,
					attempt,
					error: error instanceof Error ? error.message : "measure_failed",
				})
			)
		}
	}
	const ok = samples.filter((sample) => sample.status >= 200 && sample.status < 300)
	console.log(
		JSON.stringify({
			url,
			summary: {
				totalMs: summarize(ok.map((sample) => sample.totalMs)),
				dbMs: summarize(ok.map((sample) => Number(sample.dbMs))),
				redisMs: summarize(ok.map((sample) => Number(sample.redisMs))),
				regions: [...new Set(ok.map((sample) => sample.region).filter(Boolean))],
				runtimeUsesPooler: ok.every((sample) => sample.runtimeUsesPooler === true),
				cacheConfigured: ok.some((sample) => sample.cacheConfigured === true),
			},
		})
	)
}

process.exit(exitCode)
