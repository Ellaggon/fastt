import { readdir, readFile, mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve, relative } from "node:path"
import { pathToFileURL } from "node:url"

export function percentile(values, fraction) {
	if (!values.length) return ""
	const sorted = [...values].sort((a, b) => a - b)
	return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}

export function routeForFile(file) {
	return "/" + file.replace(/\.astro$/, "").replace(/(^|\/)index$/, "")
		.replace(/\/$/, "")
}

export function summarize(routes, samples) {
	for (const sample of samples) {
		if (!sample || Object.keys(sample).some((key) =>
			!["route", "phase", "durationMs", "environment", "measuredAt", "cache"].includes(key)) ||
			!routes.includes(sample.route) || !["load", "save"].includes(sample.phase) ||
			!Number.isFinite(sample.durationMs) || sample.durationMs < 0 ||
			!["local-dev", "local-build", "preview", "production"].includes(sample.environment) ||
			!["hit", "miss", "stale", "none", "unknown"].includes(sample.cache) ||
			!/^\d{4}-\d{2}-\d{2}T/.test(sample.measuredAt) ||
			!Number.isFinite(Date.parse(sample.measuredAt))) {
			throw new Error("Invalid sample: use route templates, measured durations and supported fields only")
		}
	}
	return routes.flatMap((route) => ["load", "save"].flatMap((phase) => {
		const matches = samples.filter((s) => s.route === route && s.phase === phase)
		const groups = [...new Set(matches.map((s) => `${s.environment}|${s.cache}`))]
		if (!groups.length) return [[route, phase, "pending", "", "", 0, "", "", "", ""]]
		return groups.map((group) => {
			const [environment, cache] = group.split("|")
			const rows = matches.filter((s) => s.environment === environment && s.cache === cache)
			const values = rows.map((s) => s.durationMs)
			const dates = rows.map((s) => s.measuredAt).sort()
			return [route, phase, "measured", environment, cache, rows.length,
				percentile(values, .5), percentile(values, .75), percentile(values, .95), dates.at(-1)]
		})
	}))
}

async function pages(root, dir = root) {
	const files = []
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = resolve(dir, entry.name)
		if (entry.isDirectory()) files.push(...await pages(root, path))
		else if (entry.name.endsWith(".astro")) files.push(relative(root, path))
	}
	return files
}

async function main() {
	const input = process.argv[2]
	const output = resolve("artifacts/performance/page-performance.csv")
	const routes = [...new Set((await pages(resolve("src/pages"))).map(routeForFile))].sort()
	const samples = input ? JSON.parse(await readFile(input, "utf8")) : []
	if (!Array.isArray(samples)) throw new Error("Samples must be an array")
	const rows = summarize(routes, samples)
	const csv = [
		["route", "phase", "status", "environment", "cache", "samples", "p50_ms", "p75_ms", "p95_ms", "last_measured_at"],
		...rows,
	].map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n") + "\n"
	await mkdir(dirname(output), { recursive: true })
	await writeFile(output, csv, { mode: 0o600 })
	console.log(`Registered ${routes.length} Astro routes; ${samples.length} measured samples. ${output}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	await main()
}
