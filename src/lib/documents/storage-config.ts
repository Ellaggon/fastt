export function documentStorageConfig(env: NodeJS.ProcessEnv = process.env) {
	const accountId = env.R2_DOCUMENTS_ACCOUNT_ID?.trim()
	const bucket = env.R2_DOCUMENTS_BUCKET_NAME?.trim()
	const accessKeyId = env.R2_DOCUMENTS_ACCESS_KEY_ID?.trim()
	const secretAccessKey = env.R2_DOCUMENTS_SECRET_ACCESS_KEY?.trim()
	if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null
	if (accountId === env.R2_ACCOUNT_ID?.trim() && bucket === env.R2_BUCKET_NAME?.trim())
		throw new Error("document_bucket_must_be_separate")
	if (accessKeyId === env.R2_ACCESS_KEY_ID?.trim())
		throw new Error("document_credentials_must_be_separate")
	return { accountId, bucket, accessKeyId, secretAccessKey }
}
