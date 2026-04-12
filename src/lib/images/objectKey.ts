export function deriveObjectKeyFromUrl(urlValue: string): string | null {
	const raw = String(urlValue ?? "").trim()
	if (!raw) return null
	try {
		const parsed = new URL(raw)
		const pathname = parsed.pathname.replace(/^\/+/, "")
		return pathname || null
	} catch {
		const trimmed = raw.replace(/^https?:\/\/[^/]+\//i, "").replace(/^\/+/, "")
		return trimmed || null
	}
}

export function ensureObjectKey(params: {
	objectKey?: string | null
	url?: string | null
	context: string
	imageId: string
}): string | null {
	const objectKey = String(params.objectKey ?? "").trim()
	if (objectKey) return objectKey
	const fallback = deriveObjectKeyFromUrl(String(params.url ?? ""))
	if (fallback) {
		console.warn("image_object_key_fallback_from_url", {
			context: params.context,
			imageId: params.imageId,
		})
		return fallback
	}
	console.warn("image_object_key_missing", {
		context: params.context,
		imageId: params.imageId,
	})
	return null
}
