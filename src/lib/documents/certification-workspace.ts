export function documentCertificationWorkspaceEnabled(env: NodeJS.ProcessEnv, url: URL) {
	if (
		env.FASTT_DOCUMENT_CERTIFICATION_WORKSPACE !== "true" ||
		env.FASTT_DATA_ENV !== "test" ||
		env.NODE_ENV === "production" ||
		env.VERCEL ||
		env.LOCAL_QA_AUTH_ENABLED !== "true" ||
		!env.LOCAL_QA_PROVIDER_ID?.startsWith("document-workspace-certification-") ||
		url.protocol !== "http:" ||
		url.hostname !== "127.0.0.1" ||
		url.port !== "4333"
	)
		return false
	try {
		const database = new URL(env.FASTT_TEST_DATABASE_URL ?? "")
		return (
			database.hostname === "127.0.0.1" &&
			database.port === "55439" &&
			database.pathname === "/fastt_document_certification"
		)
	} catch {
		return false
	}
}
