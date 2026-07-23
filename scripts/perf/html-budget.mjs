const baseUrl = process.env.FASTT_HTML_BUDGET_BASE_URL?.trim()

if (!baseUrl) {
	console.log("html-budget skipped: set FASTT_HTML_BUDGET_BASE_URL to measure route HTML.")
	process.exit(0)
}

const productId = process.env.FASTT_HTML_BUDGET_PRODUCT_ID?.trim()
const cookie = process.env.FASTT_HTML_BUDGET_COOKIE?.trim()
const rawBudgets = process.env.FASTT_HTML_BUDGET_ROUTES?.trim()

const defaultBudgets = [
	{ path: "/provider/settings", maxBytes: 145_000 },
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
	const response = await fetch(url, {
		redirect: "manual",
		headers: {
			accept: "text/html",
			...(cookie ? { cookie } : {}),
		},
	})

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
	const percentOfBudget = Math.round((bytes / budget.maxBytes) * 100)
	console.log(
		JSON.stringify({
			route: budget.path,
			bytes,
			maxBytes: budget.maxBytes,
			percentOfBudget,
			withinBudget,
		})
	)
	if (!withinBudget) failed = true
}

if (failed) process.exit(1)
