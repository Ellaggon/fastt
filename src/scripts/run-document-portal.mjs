import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { dispatcherConfig, dispatch } from "../../services/document-dispatcher/dispatcher.mjs"

if (process.env.NODE_ENV === "production" || process.env.VERCEL)
	throw new Error("local_document_portal_only")
const env = { ...process.env, NODE_ENV: "development" }
const config = dispatcherConfig(env)
if (config.url.origin !== "http://localhost:4321") throw new Error("local_portal_origin_required")
const packagePath = createRequire(import.meta.url).resolve("astro/package.json")
const cli = resolve(dirname(packagePath), JSON.parse(await readFile(packagePath, "utf8")).bin.astro)
const app = spawn(process.execPath, [cli, "dev", "--host", "localhost", "--port", "4321"], {
	env,
	stdio: "inherit",
})
const abort = new AbortController()
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => abort.abort())
app.once("exit", () => abort.abort())
let failures = 0
try {
	while (!abort.signal.aborted) {
		try {
			const counts = await dispatch(config)
			failures = 0
			console.log(JSON.stringify({ event: "document_worker_tick", ...counts }))
		} catch {
			console.error(
				JSON.stringify({ event: "document_worker_unavailable", consecutiveFailures: ++failures })
			)
		}
		await delay(Math.min(config.intervalMs * Math.max(failures, 1), 300000), undefined, {
			signal: abort.signal,
		}).catch(() => {})
	}
} finally {
	app.kill("SIGTERM")
}
