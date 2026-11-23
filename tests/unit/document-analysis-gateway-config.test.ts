import { expect, it } from "vitest"
import { documentAnalysisGatewayConfig } from "@/lib/documents/analysis-gateway-config"
const env = {
	DOCUMENT_ANALYSIS_GATEWAY_URL: "http://127.0.0.1:4319/v1/documents/analyze",
	DOCUMENT_ANALYSIS_GATEWAY_TOKEN: "x".repeat(48),
	DOCUMENT_ANALYSIS_LOCAL_DEVELOPMENT: "true",
}
it("permits HTTP only for the explicit loopback development service", () => {
	expect(documentAnalysisGatewayConfig(env)?.endpoint.hostname).toBe("127.0.0.1")
	for (const change of [
		{ NODE_ENV: "production" },
		{ VERCEL: "1" },
		{ DOCUMENT_ANALYSIS_LOCAL_DEVELOPMENT: "false" },
		{ DOCUMENT_ANALYSIS_GATEWAY_URL: "http://example.com/inspect" },
	])
		expect(() => documentAnalysisGatewayConfig({ ...env, ...change })).toThrow(
			"configuration_invalid"
		)
})
it("requires a strong token and rejects URL credentials", () => {
	expect(() =>
		documentAnalysisGatewayConfig({ ...env, DOCUMENT_ANALYSIS_GATEWAY_TOKEN: "short" })
	).toThrow()
	expect(() =>
		documentAnalysisGatewayConfig({
			...env,
			DOCUMENT_ANALYSIS_GATEWAY_URL: "https://user:password@gateway.example/inspect",
		})
	).toThrow()
	expect(documentAnalysisGatewayConfig({})).toBeNull()
})
it("allows the certified analyzer in the explicitly activated local development portal only", () => {
	const local = {
		...env,
		DOCUMENT_ANALYSIS_GATEWAY_URL: "http://127.0.0.1:4329/v1/documents/analyze",
		FASTT_DOCUMENT_LOCAL_PORTAL_ENABLED: "true",
		FASTT_DOCUMENT_PIPELINE_ENABLED: "true",
		R2_DOCUMENTS_BUCKET_NAME: "documents-development",
		NODE_ENV: "development",
	}
	expect(documentAnalysisGatewayConfig(local)?.endpoint.port).toBe("4329")
	for (const change of [
		{ NODE_ENV: "production" },
		{ VERCEL: "1" },
		{ FASTT_DOCUMENT_LOCAL_PORTAL_ENABLED: "false" },
		{ FASTT_DOCUMENT_PIPELINE_ENABLED: "false" },
		{ R2_DOCUMENTS_BUCKET_NAME: "documents-production" },
	])
		expect(() => documentAnalysisGatewayConfig({ ...local, ...change })).toThrow()
})
