import type { ProviderContractSurface } from "@/lib/commercial-policy/provider-contract-surface"
import { withFinancialApiScope } from "./financial-api-scope"
import { financialReturnTo } from "./financial-navigation-scope"
import { FinancialLoadError } from "./financial-data-cache"

export function financialContractSummaryMessage(model: ProviderContractSurface): string {
	if (!model.offerings.length) return "No hay ofertas en este contexto."
	const onlyExperiences = model.offerings.every((row) => row.commercialLine === "tour")
	const singular = onlyExperiences ? "experiencia" : "oferta"
	const plural = onlyExperiences ? "experiencias" : "ofertas"
	const unread = model.offerings.filter((row) => row.status === "read_failed").length
	if (unread) return "No pudimos comprobar todas las condiciones. Vuelve a intentarlo."
	const pending = model.offerings.filter((row) => row.status !== "requirements_satisfied").length
	const reviewing = model.offerings.filter((row) => row.status === "in_review").length
	if (!pending) return "Los requisitos aplicables están satisfechos."
	if (pending === reviewing)
		return `${reviewing} ${reviewing === 1 ? `${singular} en revisión` : `${plural} en revisión`}. Puedes consultar su estado.`
	return `${pending} ${pending === 1 ? `${singular} tiene` : `${plural} tienen`} condiciones por revisar.`
}
export function initFinancialContractSummary() {
	const candidate = document.querySelector<HTMLElement>("[data-financial-contract-summary]")
	if (!candidate || candidate.dataset.bound) return
	const root: HTMLElement = candidate
	root.dataset.bound = "true"
	const message = root.querySelector<HTMLElement>("[data-contract-summary-message]")!
	const retry = root.querySelector<HTMLButtonElement>("[data-contract-summary-retry]")!
	const link = root.querySelector<HTMLAnchorElement>("[data-contract-summary-link]")!
	const lifetime = new AbortController()
	document.addEventListener("astro:before-swap", () => lifetime.abort(), { once: true })
	let running = false
	async function load() {
		if (running) return
		running = true
		retry.disabled = true
		root.setAttribute("aria-busy", "true")
		try {
			const url = new URL(
				withFinancialApiScope("/api/internal/financial/contract-summary"),
				location.origin
			)
			url.searchParams.set("returnTo", financialReturnTo() ?? "/financial")
			const response = await fetch(url, {
				headers: { accept: "application/json" },
				signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)]),
			})
			if (!response.ok) throw new FinancialLoadError(url.pathname, response.status)
			const model = (await response.json()) as ProviderContractSurface
			message.textContent = financialContractSummaryMessage(model)
			retry.hidden = !model.offerings.some((row) => row.status === "read_failed")
		} catch (error) {
			message.textContent =
				error instanceof FinancialLoadError && error.status === 401
					? "Tu sesión venció. Inicia sesión para comprobar las condiciones."
					: "No pudimos comprobar las condiciones. Vuelve a intentarlo."
			retry.hidden = false
		} finally {
			running = false
			retry.disabled = false
			root.removeAttribute("aria-busy")
		}
	}
	function updateLink() {
		const url = new URL(withFinancialApiScope("/provider/settings/payments"), location.origin)
		url.searchParams.set("returnTo", financialReturnTo() ?? "/financial")
		link.href = url.pathname + url.search
	}
	retry.addEventListener("click", () => void load())
	document.addEventListener("financial:view-change", updateLink, { signal: lifetime.signal })
	updateLink()
	void load()
}
