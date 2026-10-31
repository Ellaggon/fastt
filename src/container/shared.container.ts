import { S3Client } from "@aws-sdk/client-s3"
import { documentStorageConfig } from "@/lib/documents/storage-config"

// External clients belong in the composition root.
const testEndpoint =
	process.env.FASTT_DATA_ENV === "test" ? process.env.FASTT_TEST_S3_ENDPOINT : undefined
if (testEndpoint && !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(testEndpoint))
	throw new Error("Test S3 endpoint must use loopback HTTP")
export const r2 = new S3Client({
	region: "auto",
	endpoint: testEndpoint ?? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	forcePathStyle: Boolean(testEndpoint),
	credentials: {
		accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
		secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
	},
})

let documentClient: S3Client | undefined
export function getDocumentR2Client() {
	const config = documentStorageConfig()
	if (!config) throw new Error("document_storage_not_configured")
	documentClient ??= new S3Client({
		region: "auto",
		endpoint: testEndpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
		forcePathStyle: Boolean(testEndpoint),
		credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
	})
	return documentClient
}
