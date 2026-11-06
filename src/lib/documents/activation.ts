/** Deployment opt-in, independent of credentials. Never infer readiness from secrets. */
export function documentPipelineEnabled(): boolean {
	return process.env.FASTT_DOCUMENT_PIPELINE_ENABLED === "true"
}

export const documentPipelineUnavailableMessage =
	"La recepción de documentos está temporalmente deshabilitada. Puedes consultar el historial; no envíes archivos por otros canales."

export function assertDocumentPipelineEnabled(): void {
	if (!documentPipelineEnabled())
		throw Object.assign(new Error("document_pipeline_disabled"), { status: 503 })
}

export function documentPipelineDisabledResponse(): Response {
	return Response.json(
		{ ok: false, error: "document_pipeline_disabled", message: documentPipelineUnavailableMessage },
		{ status: 503, headers: { "Cache-Control": "no-store" } }
	)
}
