import type { CatalogTerritoryNode } from "@/lib/commercial-policy/catalog-territories"
import { catalogTerritorySelection } from "@/lib/commercial-policy/catalog-territories"
export function initPolicyCatalogSearch() {
	document.querySelectorAll<HTMLFormElement>("[data-policy-catalog-search]").forEach((root) => {
		if (root.dataset.bound) return
		root.dataset.bound = "true"
		const nodes: CatalogTerritoryNode[] = JSON.parse(root.dataset.nodes ?? "[]")
		const details = root.querySelector<HTMLDetailsElement>("[data-territory-details]")!
		const input = root.querySelector<HTMLInputElement>("[data-territory-value]")!
		const label = root.querySelector<HTMLElement>("[data-territory-label]")!
		const options = root.querySelector<HTMLElement>("[data-territory-options]")!
		const back = root.querySelector<HTMLButtonElement>("[data-territory-back]")!
		const select = root.querySelector<HTMLButtonElement>("[data-territory-select]")!
		const more = root.querySelector<HTMLButtonElement>("[data-territory-more]")!
		let parent: string | null = null,
			limit = 30
		function path(id: string | null) {
			const result: string[] = []
			const visited = new Set<string>()
			while (id && !visited.has(id)) {
				visited.add(id)
				const node = nodes.find((item) => item.id === id)
				if (!node) break
				result.unshift(node.label)
				id = node.parentId
			}
			return result.join(" / ")
		}
		function choose(id: string) {
			input.value = id
			label.textContent = catalogTerritorySelection(id, nodes)
			details.open = false
			details.querySelector("summary")?.focus()
			input.dispatchEvent(new Event("change", { bubbles: true }))
		}
		function render() {
			const children = nodes.filter((node) => node.parentId === parent)
			const node = nodes.find((item) => item.id === parent)
			root.querySelector<HTMLElement>("[data-territory-heading]")!.textContent =
				node?.label ?? "Países"
			root.querySelector<HTMLElement>("[data-territory-location]")!.textContent = path(parent)
			select.textContent = node
				? node.id.startsWith("country:")
					? `${node.label} · Todos sus territorios`
					: `Elegir todo ${node.label}`
				: "Todos los territorios"
			back.disabled = parent === null
			options.replaceChildren()
			for (const child of children.slice(0, limit)) {
				const button = document.createElement("button")
				button.type = "button"
				const name = document.createElement("span")
				name.textContent = child.label
				const kind = document.createElement("small")
				kind.textContent = child.kind
				name.append(kind)
				button.append(name)
				const hasChildren = nodes.some((item) => item.parentId === child.id)
				if (hasChildren) {
					const arrow = document.createElement("span")
					arrow.textContent = "›"
					arrow.setAttribute("aria-hidden", "true")
					button.append(arrow)
				}
				button.addEventListener("click", () => {
					if (hasChildren) {
						parent = child.id
						limit = 30
						render()
						select.focus()
					} else choose(child.id)
				})
				options.append(button)
			}
			more.hidden = children.length <= limit
			root.querySelector<HTMLElement>("[data-territory-status]")!.textContent = children.length
				? `${children.length} territorios en el catálogo`
				: node
					? "No hay subdivisiones en este catálogo."
					: "No hay territorios disponibles."
		}
		select.onclick = () => choose(parent ?? "")
		back.onclick = () => {
			parent = nodes.find((node) => node.id === parent)?.parentId ?? null
			limit = 30
			render()
		}
		more.onclick = () => {
			limit += 30
			render()
		}
		root.querySelector<HTMLButtonElement>("[data-territory-close]")!.onclick = () => {
			details.open = false
			details.querySelector("summary")?.focus()
		}
		details.addEventListener("toggle", () => {
			if (details.open) {
				const selected = nodes.find((node) => node.id === input.value)
				parent = selected?.parentId ?? null
				limit = 30
				render()
			}
		})
		const controller = new AbortController()
		document.addEventListener(
			"click",
			(event) => {
				if (!event.composedPath().includes(details)) details.open = false
			},
			{ signal: controller.signal }
		)
		document.addEventListener(
			"keydown",
			(event) => {
				if (event.key === "Escape" && details.open) {
					details.open = false
					details.querySelector("summary")?.focus()
				}
			},
			{ signal: controller.signal }
		)
		document.addEventListener("astro:before-swap", () => controller.abort(), {
			once: true,
			signal: controller.signal,
		})
	})
}
