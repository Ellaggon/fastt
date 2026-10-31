import { randomBytes } from "node:crypto"
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { parse } from "dotenv"
import { createProviderDocumentProcessingUrl } from "@/lib/provider-document-storage"

const path = new URL("../../.env", import.meta.url)
const original = await readFile(path, "utf8")
const env = parse(original)
const app = env.PUBLIC_APP_URL ? new URL(env.PUBLIC_APP_URL) : null
if (
	!process.argv.includes("--development") ||
	(app && !["localhost", "127.0.0.1"].includes(app.hostname)) ||
	process.env.NODE_ENV === "production" ||
	process.env.VERCEL
)
	throw new Error("development_environment_required")
const source = await createProviderDocumentProcessingUrl({
	fileUrl: "r2-documents:provider-documents/gateway-certification/probe/original",
})
if (!source) throw new Error("private_document_storage_required")
const sourceUrl = new URL(source)
const token = env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN || randomBytes(48).toString("base64url")
if (token.length < 32) throw new Error("gateway_token_too_short")
const values = {
	DOCUMENT_ANALYSIS_LOCAL_DEVELOPMENT: "true",
	DOCUMENT_ANALYSIS_GATEWAY_URL: "http://127.0.0.1:4319/v1/documents/analyze",
	DOCUMENT_ANALYSIS_GATEWAY_TOKEN: token,
}
let updated = original
for (const [key, value] of Object.entries(values)) {
	const line = `${key}=${value}`
	const pattern = new RegExp(`^${key}=.*$`, "m")
	updated = pattern.test(updated)
		? updated.replace(pattern, line)
		: `${updated.trimEnd()}\n${line}\n`
}
await mkdir("tmp", { recursive: true })
await writeFile(
	"tmp/document-analysis.env",
	`DOCUMENT_ANALYSIS_GATEWAY_TOKEN=${token}\nDOCUMENT_ANALYSIS_SOURCE_ORIGIN=${sourceUrl.origin}\nDOCUMENT_ANALYSIS_SOURCE_PATH_PREFIX=/provider-documents/\n`,
	{ mode: 0o600 }
)
await writeFile(path, updated, { mode: 0o600 })
await chmod(path, 0o600)
await chmod("tmp/document-analysis.env", 0o600)
console.log(
	"Development gateway configured. Credentials were not printed. No documents were processed."
)
