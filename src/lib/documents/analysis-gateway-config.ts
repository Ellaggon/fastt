export function documentAnalysisGatewayConfig(env: NodeJS.ProcessEnv = process.env) {
	const raw = env.DOCUMENT_ANALYSIS_GATEWAY_URL?.trim()
	const token = env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN?.trim()
	if (!raw || !token) return null
	const endpoint = new URL(raw)
	const localDevelopment =
		env.DOCUMENT_ANALYSIS_LOCAL_DEVELOPMENT === "true" &&
		env.NODE_ENV !== "production" &&
		!env.VERCEL &&
		endpoint.hostname === "127.0.0.1" &&
		endpoint.port === "4319"
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
