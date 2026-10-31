import { auditProviderDocumentStorage } from "@/lib/documents/storage-reconciliation"
import { closePostgresClients } from "@/shared/infrastructure/db/client"

try {
	const report = await auditProviderDocumentStorage()
	console.log(JSON.stringify(report, null, 2))
} finally {
	await closePostgresClients()
}
