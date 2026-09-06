import { runProviderDocumentProcessingWorker } from "@/lib/documents/document-processing"

const localOnly = process.argv.includes("--local-only")
const requestedLimit = Number(
	process.argv.find((argument) => argument.startsWith("--limit="))?.split("=")[1] ?? "10"
)

if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 25) {
	throw new Error("document_processing_limit_must_be_between_1_and_25")
}

const result = await runProviderDocumentProcessingWorker({
	limit: requestedLimit,
	workerId: localOnly ? "manual-document-worker:local-only" : "manual-document-worker:configured",
	gatewayMode: localOnly ? "disabled" : "configured",
})

console.log(
	JSON.stringify(
		{
			mode: localOnly ? "local-only-no-egress" : "configured-gateway",
			...result,
		},
		null,
		2
	)
)
