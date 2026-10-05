/** Keep an upload's identity in memory so a lost response can be retried without recreating it. */
export type ProductImageUpload = {
	file: File
	upload?: { imageId: string; objectKey: string; signedUrl: string }
	confirmedImageId?: string
}
export async function confirmProductImageUpload(
	item: ProductImageUpload,
	productId: string,
	request: typeof fetch = fetch
) {
	if (item.confirmedImageId) return item.confirmedImageId
	if (!item.upload) {
		const body = new FormData()
		body.set("productId", productId)
		body.set("file", item.file)
		const response = await request("/api/uploads/init", { method: "POST", body })
		if (!response.ok) throw new Error(`No se pudo iniciar la carga (${response.status}).`)
		item.upload = await response.json()
	}
	const upload = item.upload!
	const put = await request(upload.signedUrl, {
		method: "PUT",
		body: item.file,
		headers: { "Content-Type": item.file.type },
	})
	if (!put.ok) throw new Error(`No se pudo subir la imagen (${put.status}).`)
	const body = new FormData()
	body.set("productId", productId)
	body.set("imageId", upload.imageId)
	body.set("objectKey", upload.objectKey)
	const response = await request("/api/uploads/complete", { method: "POST", body })
	if (!response.ok) throw new Error(`No se pudo confirmar la imagen (${response.status}).`)
	item.confirmedImageId = upload.imageId
	return upload.imageId
}

export function confirmedProductGalleryIds(
	existing: readonly string[],
	uploads: readonly ProductImageUpload[]
) {
	return [
		...new Set([
			...existing,
			...uploads.flatMap((item) => (item.confirmedImageId ? [item.confirmedImageId] : [])),
		]),
	]
}
