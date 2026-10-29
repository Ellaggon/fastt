type Place = { id: string; name: string; country: string; placeType?: string }
const typeLabels: Record<string, string> = {
	country: "País",
	admin_area_1: "Región",
	admin_area_2: "Provincia",
	city: "Ciudad",
	locality: "Localidad",
	natural_area: "Área natural",
	poi: "Lugar",
}
const placeLabel = (place: Place) =>
	`${place.name} · ${typeLabels[place.placeType ?? ""] ?? place.country} · ${place.country}`
export function initTerritoryPickers() {
	document.querySelectorAll<HTMLElement>("[data-territory-picker]").forEach((root) => {
		if (root.dataset.ready) return
		root.dataset.ready = "true"
		const search = root.querySelector<HTMLInputElement>("[data-territory-search]")!
		const selected = root.querySelector<HTMLElement>("[data-territory-selected]")!
		const results = root.querySelector<HTMLElement>("[data-territory-results]")!
		const status = root.querySelector<HTMLElement>("[data-territory-status]")!
		const more = root.querySelector<HTMLButtonElement>("[data-territory-more]")!
		let request: AbortController | undefined
		let timer: ReturnType<typeof setTimeout>
		let offset = 0
		const choose = (place: Place) => {
			if (root.dataset.single === "true") selected.replaceChildren()
			const existing = Array.from(selected.querySelectorAll<HTMLInputElement>("input")).find(
				(input) => input.value === place.id
			)
			if (existing) {
				existing.checked = true
				existing.dispatchEvent(new Event("change", { bubbles: true }))
				return
			}
			const label = root
				.querySelector<HTMLTemplateElement>("[data-territory-choice-template]")!
				.content.firstElementChild!.cloneNode(true) as HTMLLabelElement
			const input = label.querySelector<HTMLInputElement>("input")!
			input.name = root.dataset.fieldName!
			input.value = place.id
			input.checked = true
			label.dataset.territoryAdded = "true"
			label.querySelector("[data-territory-choice-label]")!.textContent = placeLabel(place)
			selected.append(label)
			input.dispatchEvent(new Event("change", { bubbles: true }))
		}
		const load = async (append = false) => {
			request?.abort()
			request = new AbortController()
			const current = request
			more.hidden = true
			status.textContent = "Buscando territorios…"
			try {
				const response = await fetch(
					`/api/provider/operating-places?${new URLSearchParams({ q: search.value, offset: String(offset) })}`,
					{ signal: current.signal }
				)
				if (!response.ok) throw new Error("search_failed")
				const data = (await response.json()) as { places: Place[]; hasMore: boolean }
				if (current !== request) return
				if (!append) results.replaceChildren()
				for (const place of data.places) {
					const button = root
						.querySelector<HTMLTemplateElement>("[data-territory-result-template]")!
						.content.firstElementChild!.cloneNode(true) as HTMLButtonElement
					button.querySelector("[data-territory-label]")!.textContent = placeLabel(place)
					button.addEventListener("click", () => choose(place))
					results.append(button)
				}
				more.hidden = !data.hasMore
				status.textContent = data.places.length
					? ""
					: "No encontramos territorios. Prueba otro nombre."
			} catch {
				if (!current.signal.aborted)
					status.textContent = "No se pudo cargar el catálogo. Vuelve a buscar."
			}
		}
		search.addEventListener("input", () => {
			clearTimeout(timer)
			request?.abort()
			offset = 0
			timer = setTimeout(() => void load(), 250)
		})
		search.addEventListener("focus", () => {
			if (!results.childElementCount) void load()
		})
		more.addEventListener("click", () => {
			offset += 30
			void load(true)
		})
		root.closest("form")?.addEventListener("reset", () => {
			root.querySelectorAll("[data-territory-added]").forEach((label) => label.remove())
		})
		root.addEventListener(
			"fastt:dispose",
			() => {
				request?.abort()
				clearTimeout(timer)
			},
			{ once: true }
		)
	})
}
