const rawUrls = process.env.FASTT_PERF_URLS || process.argv.slice(2).join(",")
const urls = rawUrls
	.split(",")
	.map((url) => url.trim())
	.filter(Boolean)

if (urls.length === 0) {
	console.error("Set FASTT_PERF_URLS or pass one or more public URLs.")
	process.exit(1)
}

const strategy = process.env.FASTT_PERF_STRATEGY || "mobile"
const apiKey = process.env.PAGESPEED_API_KEY

function score(value) {
	return typeof value === "number" ? Math.round(value * 100) : null
}

for (const targetUrl of urls) {
	const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed")
	endpoint.searchParams.set("url", targetUrl)
	endpoint.searchParams.set("strategy", strategy)
	endpoint.searchParams.append("category", "performance")
	if (apiKey) endpoint.searchParams.set("key", apiKey)

	const response = await fetch(endpoint)
	if (!response.ok) {
		console.error(`${targetUrl}: PageSpeed failed with ${response.status}`)
		process.exitCode = 1
		continue
	}

	const data = await response.json()
	const lighthouse = data.lighthouseResult || {}
	const audits = lighthouse.audits || {}
	const metrics = {
		url: targetUrl,
		strategy,
		performance: score(lighthouse.categories?.performance?.score),
		firstContentfulPaintMs: audits["first-contentful-paint"]?.numericValue ?? null,
		largestContentfulPaintMs: audits["largest-contentful-paint"]?.numericValue ?? null,
		totalBlockingTimeMs: audits["total-blocking-time"]?.numericValue ?? null,
		cumulativeLayoutShift: audits["cumulative-layout-shift"]?.numericValue ?? null,
		speedIndexMs: audits["speed-index"]?.numericValue ?? null,
	}
	console.log(JSON.stringify(metrics))
}

