export function documentAnalysisGatewayConfig(
	env: NodeJS.ProcessEnv = process.env,
	targeted = false
) {
	const raw = env.DOCUMENT_ANALYSIS_GATEWAY_URL?.trim()
	const token = env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN?.trim()
	if (!raw || !token) return null
	const endpoint = new URL(raw)
	const localDevelopment =
		env.DOCUMENT_ANALYSIS_LOCAL_DEVELOPMENT === "true" &&
		env.NODE_ENV !== "production" &&
		!env.VERCEL &&
		endpoint.hostname === "127.0.0.1" &&
		(endpoint.port === "4319" ||
			(endpoint.port === "4329" &&
				(targeted ||
					(env.FASTT_DATA_ENV === "test" && env.FASTT_CERTIFY_LOCAL_GATEWAY === "1") ||
					(env.FASTT_DOCUMENT_LOCAL_PORTAL_ENABLED === "true" &&
						env.FASTT_DOCUMENT_PIPELINE_ENABLED === "true" &&
						env.NODE_ENV === "development" &&
						env.R2_DOCUMENTS_BUCKET_NAME?.endsWith("-development")))))
	if (
		endpoint.username ||
		endpoint.password ||
		endpoint.hash ||
		token.length < 32 ||
		(endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && localDevelopment))
	)
		throw new Error("document_analysis_gateway_configuration_invalid")
	return { endpoint, token }
}
