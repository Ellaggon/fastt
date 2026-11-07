export const DOCUMENT_MULTIPART_FALLBACK_LIMIT_BYTES = 4 * 1024 * 1024

export async function submitDocumentMultipartFallback(params: {
	action: URL
	formData: FormData
	fileSizeBytes: number
	request?: typeof fetch
}) {
	if (params.fileSizeBytes <= 0 || params.fileSizeBytes > DOCUMENT_MULTIPART_FALLBACK_LIMIT_BYTES)
		return null

	try {
		const response = await (params.request ?? fetch)(params.action, {
			method: "POST",
			body: params.formData,
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(60_000),
		})
		if (!response.ok) return null

		const result = (await response.json()) as { ok?: boolean; redirectTo?: unknown }
		if (!result.ok || typeof result.redirectTo !== "string") return null

		const destination = new URL(result.redirectTo, params.action)
		return destination.origin === params.action.origin ? destination.href : null
	} catch {
		return null
	}
}
