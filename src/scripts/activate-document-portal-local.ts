import { randomBytes } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFile, writeFile, chmod } from "node:fs/promises"
import { parse } from "dotenv"
import { documentStorageConfig } from "@/lib/documents/storage-config"

if (
	!process.argv.includes("--development") ||
	process.env.NODE_ENV === "production" ||
	process.env.VERCEL
)
	throw new Error("local_activation_only")
const path = new URL("../../.env", import.meta.url)
const original = await readFile(path, "utf8")
const env = parse(original)
if (!documentStorageConfig(env)?.bucket.endsWith("-development"))
	throw new Error("development_document_bucket_required")
if (
	env.PUBLIC_APP_URL &&
	!["http://localhost:4321", "http://127.0.0.1:4321"].includes(new URL(env.PUBLIC_APP_URL).origin)
)
	throw new Error("local_portal_required")
const [gateway] = JSON.parse(
	execFileSync("docker", ["inspect", "fastt-r2-analysis-beta"], { encoding: "utf8" })
)
if (!gateway?.State.Running) throw new Error("certified_gateway_not_running")
const entries = Object.fromEntries(
	gateway.Config.Env.map((line: string) => {
		const separator = line.indexOf("=")
		return [line.slice(0, separator), line.slice(separator + 1)]
	})
)
const token = entries.DOCUMENT_ANALYSIS_GATEWAY_TOKEN
if (!token || token.length < 32) throw new Error("gateway_token_invalid")
const ready = await fetch("http://127.0.0.1:4329/readyz", { signal: AbortSignal.timeout(5000) })
if (!ready.ok) throw new Error("certified_gateway_not_ready")
const values = {
	FASTT_DOCUMENT_PIPELINE_ENABLED: "true",
	FASTT_DOCUMENT_LOCAL_PORTAL_ENABLED: "true",
	DOCUMENT_ANALYSIS_LOCAL_DEVELOPMENT: "true",
	DOCUMENT_ANALYSIS_GATEWAY_URL: "http://127.0.0.1:4329/v1/documents/analyze",
	DOCUMENT_ANALYSIS_GATEWAY_TOKEN: token,
	DOCUMENT_PROCESSING_APP_ORIGIN: "http://localhost:4321",
	DOCUMENT_PROCESSING_WORKER_TOKEN:
		env.DOCUMENT_PROCESSING_WORKER_TOKEN || randomBytes(32).toString("hex"),
}
let updated = original
for (const [key, value] of Object.entries(values)) {
	const pattern = new RegExp(`^${key}=.*$`, "m")
	const line = `${key}=${value}`
	updated = pattern.test(updated)
		? updated.replace(pattern, line)
		: `${updated.trimEnd()}\n${line}\n`
}
await writeFile(path, updated, { mode: 0o600 })
await chmod(path, 0o600)
console.log(
	JSON.stringify({
		event: "local_document_portal_configured",
		productionChanged: false,
		secretsPrinted: false,
	})
)
