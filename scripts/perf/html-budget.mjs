const baseUrl = process.env.FASTT_HTML_BUDGET_BASE_URL?.trim()

if (!baseUrl) {
	console.log("html-budget skipped: set FASTT_HTML_BUDGET_BASE_URL to measure route HTML.")
	process.exit(0)
}

const productId = process.env.FASTT_HTML_BUDGET_PRODUCT_ID?.trim()
const cookie = process.env.FASTT_HTML_BUDGET_COOKIE?.trim()
const rawBudgets = process.env.FASTT_HTML_BUDGET_ROUTES?.trim()
const maxTtfbMs = Math.max(1, Number(process.env.FASTT_HTML_BUDGET_MAX_TTFB_MS ?? 1000))

const defaultBudgets = [
	{ path: "/", maxBytes: 135_000 },
	{ path: "/hotels", maxBytes: 160_000 },
	{ path: "/tours", maxBytes: 175_000 },
	{ path: "/destinos/la-paz/alojamientos", maxBytes: 175_000 },
	{ path: "/destinos/la-paz/tours", maxBytes: 175_000 },
	{ path: "/buscar/alojamientos", maxBytes: 180_000 },
	{ path: "/buscar/tours", maxBytes: 180_000 },
	{ path: "/provider/settings", maxBytes: 145_000 },
	{ path: "/provider/settings/integrations", maxBytes: 100_000 },
	{ path: "/provider/settings/integrations/catalog", maxBytes: 100_000 },
	{ path: "/provider/settings/integrations/connections", maxBytes: 100_000 },
	{ path: "/rates/plans/manage", maxBytes: 150_000 },
	...(productId ? [{ path: `/product/${encodeURIComponent(productId)}`, maxBytes: 155_000 }] : []),
]

function parseBudgets(value) {
	if (!value) return defaultBudgets
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [path, rawMaxBytes] = entry.split(":")
			const maxBytes = Number(rawMaxBytes)
			if (!path || !Number.isFinite(maxBytes) || maxBytes <= 0) {
				throw new Error(`Invalid FASTT_HTML_BUDGET_ROUTES entry: ${entry}`)
			}
			return { path, maxBytes }
		})
}

function absoluteUrl(path) {
	return new URL(path, baseUrl).toString()
}

const budgets = parseBudgets(rawBudgets)
if (budgets.length === 0) {
	console.log("html-budget skipped: no routes configured.")
	process.exit(0)
}

let failed = false

for (const budget of budgets) {
	const url = absoluteUrl(budget.path)
	const startedAt = performance.now()
	const response = await fetch(url, {
		redirect: "manual",
		headers: {
			accept: "text/html",
			...(cookie ? { cookie } : {}),
		},
	})
	const ttfbMs = Math.round(performance.now() - startedAt)

	if (response.status < 200 || response.status >= 300) {
		console.error(
			JSON.stringify({
				route: budget.path,
				url,
				status: response.status,
				error: "route_not_measured",
			})
		)
		failed = true
		continue
	}

	const html = await response.text()
	const bytes = Buffer.byteLength(html, "utf8")
	const withinBudget = bytes <= budget.maxBytes
	const withinTtfbBudget = ttfbMs <= maxTtfbMs
	const percentOfBudget = Math.round((bytes / budget.maxBytes) * 100)
	console.log(
		JSON.stringify({
			route: budget.path,
			bytes,
			maxBytes: budget.maxBytes,
			percentOfBudget,
			withinBudget,
			ttfbMs,
			maxTtfbMs,
			withinTtfbBudget,
		})
	)
	if (!withinBudget || !withinTtfbBudget) failed = true
}

if (failed) process.exit(1)
