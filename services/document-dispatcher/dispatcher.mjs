import { setTimeout as delay } from "node:timers/promises"
import { pathToFileURL } from "node:url"

export function dispatcherConfig(env) {
	const target = new URL(env.DOCUMENT_PROCESSING_APP_ORIGIN ?? "")
	if (
		target.protocol !== "https:" ||
		target.username ||
		target.password ||
		target.pathname !== "/" ||
		target.search ||
		target.hash
	)
		throw new Error("worker_https_origin_required")
	const token = env.DOCUMENT_PROCESSING_WORKER_TOKEN ?? ""
	if (token.length < 32) throw new Error("worker_token_required")
	return { url: new URL("/api/cron/document-processing", target), token }
}

export async function dispatch(config, fetcher = fetch) {
	const response = await fetcher(config.url, {
		headers: { Authorization: `Bearer ${config.token}` },
		redirect: "error",
		signal: AbortSignal.timeout(65_000),
	})
	if (!response.ok) throw new Error("worker_request_failed")
	const text = await response.text()
	if (text.length > 8192) throw new Error("worker_response_too_large")
	const result = JSON.parse(text)
	if (result.ok !== true) throw new Error("worker_result_invalid")
	const counts = {}
	for (const name of ["claimed", "completed", "blocked", "retry", "failed", "skipped"]) {
		if (!Number.isInteger(result[name]) || result[name] < 0 || result[name] > 25)
			throw new Error("worker_result_invalid")
		counts[name] = result[name]
	}
	return counts
}

async function main() {
	const config = dispatcherConfig(process.env)
	const stop = new AbortController()
	for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => stop.abort())
	let failures = 0
	while (!stop.signal.aborted) {
		try {
			const counts = await dispatch(config)
			failures = 0
			console.log(JSON.stringify({ event: "document_worker_tick", ...counts }))
		} catch {
			failures++
			console.error(
				JSON.stringify({ event: "document_worker_unavailable", consecutiveFailures: failures })
			)
		}
		// Sequential ticks; no overlapping requests or customer data in logs.
		await delay(Math.min(60_000 * Math.max(failures, 1), 300_000), undefined, {
			signal: stop.signal,
		}).catch(() => {})
	}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
