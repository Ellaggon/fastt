function qs<T extends Element>(sel: string, el: ParentNode = document) {
	return el.querySelector(sel) as T | null
}

document.addEventListener("DOMContentLoaded", () => {
	const form = qs<HTMLFormElement>("#imagesForm")
	const out = qs<HTMLElement>("#out")
	const btn = qs<HTMLButtonElement>("#submitBtn")
	const files = qs<HTMLInputElement>("#files")

	if (!form || !out || !btn || !files) return

	form.addEventListener("submit", async (e) => {
		e.preventDefault()
		out.textContent = ""
		btn.disabled = true

		try {
			if (!files.files || files.files.length === 0) {
				out.textContent = "Required field"
				btn.disabled = false
				return
			}

			const productId = String(new FormData(form).get("productId") || "")

			// SAFE MINIMUM: init -> PUT -> complete per file, then set product gallery by imageIds.
			const imageIds: string[] = []
			for (const file of Array.from(files.files)) {
				const initFd = new FormData()
				initFd.set("productId", productId)
				initFd.set("file", file)

				const initRes = await fetch("/api/uploads/init", { method: "POST", body: initFd })
				const initTxt = await initRes.text()
				if (!initRes.ok) {
					out.textContent = `init failed status=${initRes.status}\n${initTxt}`
					btn.disabled = false
					return
				}

				const initJson = JSON.parse(initTxt) as {
					imageId: string
					objectKey: string
					signedUrl: string
				}

				const putRes = await fetch(initJson.signedUrl, {
					method: "PUT",
					body: file,
					headers: { "Content-Type": file.type },
				})
				if (!putRes.ok) {
					out.textContent = `upload failed status=${putRes.status}`
					btn.disabled = false
					return
				}

				const completeFd = new FormData()
				completeFd.set("productId", productId)
				completeFd.set("imageId", initJson.imageId)
				completeFd.set("objectKey", initJson.objectKey)

				const completeRes = await fetch("/api/uploads/complete", {
					method: "POST",
					body: completeFd,
				})
				const completeTxt = await completeRes.text()
				if (!completeRes.ok) {
					out.textContent = `complete failed status=${completeRes.status}\n${completeTxt}`
					btn.disabled = false
					return
				}

				imageIds.push(initJson.imageId)
			}

			// Set gallery ordering by imageIds (no URLs).
			const setFd = new FormData()
			setFd.set("productId", productId)
			for (const id of imageIds) setFd.append("imageId", id)

			const res = await fetch("/api/product-v2/images", { method: "POST", body: setFd })
			const txt = await res.text()
			if (!res.ok) {
				out.textContent = `status=${res.status}\n${txt}`
				btn.disabled = false
				return
			}

			window.location.href = `/product-v2/${encodeURIComponent(productId)}/subtype`
		} catch (err) {
			out.textContent = `network error: ${String(err)}`
			btn.disabled = false
		}
	})
})
