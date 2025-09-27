export const uploadFilesToR2 = async (fileList: FileList, prefix = "products") => {
	if (!fileList || fileList.length === 0) return []

	// 1) Pedimos URLs firmadas al server
	const formData = new FormData()
	Array.from(fileList).forEach((el) => formData.append("file", el))
	formData.append("prefix", prefix)

	const res = await fetch("/api/upload/create-signed", { method: "POST", body: formData })
	if (!res.ok) {
		const err = await res.text()
		console.error("Error response from server: ", err)
		return []
	}

	const { urls } = (await res.json()) as {
		urls: { key: string; signedUrl: string; publicUrl: string }[]
	}

	// 2) Subimos cada archivo a su signedUrl
	await Promise.all(
		urls.map(async (entry, idx) => {
			const file = fileList[idx]
			if (!file) return
			await fetch(entry.signedUrl, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": file.type },
			})
			console.log(`Archivo subido: ${entry.key}`)
		})
	)

	// 3) Devolvemos las publicUrl (lista de strings)
	return urls.map((el) => el.publicUrl)
}
