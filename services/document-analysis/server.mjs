import { createServer } from "node:http"
import { timingSafeEqual } from "node:crypto"
import { analyzeDocument, engineReadiness } from "./analyze.mjs"

const token = process.env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN ?? ""
const sourceOrigin = process.env.DOCUMENT_ANALYSIS_SOURCE_ORIGIN ?? ""
const sourcePathPrefix = process.env.DOCUMENT_ANALYSIS_SOURCE_PATH_PREFIX ?? ""
if (token.length < 32 || !sourceOrigin.startsWith("https://") || !sourcePathPrefix.startsWith("/"))
	throw new Error("gateway_configuration_required")
let busy = false
function authorized(value) {
	const actual = Buffer.from(value ?? ""),
		expected = Buffer.from(`Bearer ${token}`)
	return actual.length === expected.length && timingSafeEqual(actual, expected)
}
const server = createServer(async (request, response) => {
	const send = (status, body) => {
		response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
		response.end(JSON.stringify(body))
	}
	if (!authorized(request.headers.authorization)) return send(401, { error: "unauthorized" })
	if (request.method === "GET" && request.url === "/health") {
		try {
			return send(200, { ready: true, engine: await engineReadiness() })
		} catch {
			return send(503, { ready: false })
		}
	}
	if (request.method !== "POST" || request.url !== "/v1/documents/analyze")
		return send(404, { error: "not_found" })
	if (busy) return send(503, { error: "analysis_busy" })
	busy = true
	try {
		const chunks = []
		let length = 0
		for await (const chunk of request) {
			length += chunk.length
			if (length > 8192) throw new Error("invalid_request")
			chunks.push(chunk)
		}
		const input = JSON.parse(Buffer.concat(chunks).toString("utf8"))
		if (
			request.headers["idempotency-key"] !== `document-analysis:${input.documentId}:${input.sha256}`
		)
			return send(400, { error: "invalid_idempotency_key" })
		const result = await analyzeDocument(input, { sourceOrigin, sourcePathPrefix })
		return send(200, result)
	} catch (error) {
		const code = [
			"invalid_request",
			"source_not_allowed",
			"source_hash_mismatch",
			"pdf_structure_invalid",
		].includes(error.message)
			? error.message
			: "analysis_unavailable"
		return send(code === "analysis_unavailable" ? 503 : 422, { error: code })
	} finally {
		busy = false
	}
})
server.requestTimeout = 70_000
server.headersTimeout = 10_000
server.listen(Number(process.env.PORT ?? 4319), process.env.GATEWAY_BIND_ADDRESS ?? "127.0.0.1")
