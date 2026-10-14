import {
	endpointsForFinancialPath,
	getFinancialSourceState,
	fetchFinancialJson,
	financialEndpointUrls,
} from "./financial-data-cache"

export type FinancialViewHealth = "loading" | "ready" | "partial" | "error"
export function financialViewHealth(
	states: readonly { status: "loading" | "ready" | "error"; data?: unknown }[]
): FinancialViewHealth {
	if (!states.length || states.some((s) => s.status === "loading")) return "loading"
	const failed = states.filter((s) => s.status === "error")
	if (!failed.length) return "ready"
	return states.some((s) => s.status === "ready" || s.data != null) ? "partial" : "error"
}
const pageReloaders = new Map<string, () => Promise<void> | void>()
export function registerFinancialPageRetry(path: string, load: () => Promise<void> | void) {
	pageReloaders.set(path, load)
}
const reloaders = new Map<string, () => Promise<void> | void>()
export function registerFinancialReload(path: string, load: () => Promise<void> | void) {
	reloaders.set(path, load)
}

export function reportFinancialBootError() {
	const notice = document.querySelector<HTMLElement>("[data-financial-load-notice]")
	if (!notice) return
	notice.dataset.bootFailed = "true"
	notice.hidden = false
	const message = notice.querySelector<HTMLElement>("[data-financial-load-message]")
	if (message) message.textContent = "No pudimos cargar esta sección. Vuelve a cargarla."
	const retry = notice.querySelector<HTMLButtonElement>("[data-financial-load-retry]")
	if (retry) {
		retry.hidden = false
		retry.textContent = "Volver a cargar"
	}
}

export function initFinancialLoadState() {
	const candidate = document.querySelector<HTMLElement>("[data-financial-load-notice]")
	if (!candidate || candidate.dataset.bound) return
	const notice: HTMLElement = candidate
	notice.dataset.bound = "true"
	const message = notice.querySelector<HTMLElement>("[data-financial-load-message]")!
	const retry = notice.querySelector<HTMLButtonElement>("[data-financial-load-retry]")!
	const correction = notice.querySelector<HTMLAnchorElement>("[data-financial-load-action]")!
	const login = notice.querySelector<HTMLAnchorElement>("[data-financial-load-login]")!
	let paginationFailed = false
	let timer: ReturnType<typeof setTimeout> | undefined
	const sources = () => [
		...new Set([...endpointsForFinancialPath(location.pathname), financialEndpointUrls.operations]),
	]
	function render() {
		if (notice.dataset.bootFailed) return
		const states = sources().map(
			(url) =>
				getFinancialSourceState(url) ?? {
					status: "loading" as const,
					data: undefined,
					error: undefined,
					updatedAt: 0,
				}
		)
		const health = paginationFailed ? "partial" : financialViewHealth(states)
		notice.hidden = health === "ready"
		const status = states.find((s) => s.status === "error" && s.error?.status === 401)
			? 401
			: states.find(
					(s) => s.status === "error" && (s.error?.status === 403 || s.error?.status === 423)
				)?.error?.status
		message.textContent = paginationFailed
			? "No pudimos cargar más casos. Los casos y filtros actuales se conservan; vuelve a intentarlo."
			: status === 401
				? "Tu sesión venció. Inicia sesión para actualizar la información."
				: status === 403
					? "No tienes permiso para consultar esta información financiera."
					: status === 423
						? "Esta información requiere completar la verificación de tu cuenta."
						: health === "loading"
							? "Actualizando información financiera…"
							: health === "partial"
								? "Información parcial: algunas consultas fallaron. Los casos disponibles se conservan; los contadores no están comprobados."
								: "No pudimos comprobar tus pendientes financieros. Vuelve a intentarlo."
		retry.hidden = health === "loading" || health === "ready" || status === 401
		const blocker = states
			.flatMap((source) => source.error?.blockers ?? [])
			.find((row) => {
				try {
					const url = new URL(row.href, location.origin)
					return (
						url.origin === location.origin &&
						url.pathname.startsWith("/provider/") &&
						!row.href.includes("\\")
					)
				} catch {
					return false
				}
			})
		correction.hidden = !blocker || status !== 423
		if (blocker && status === 423) {
			const url = new URL(blocker.href, location.origin)
			url.searchParams.set("returnTo", location.pathname + location.search)
			if (url.pathname.startsWith("/provider/settings/verification")) {
				const context = document.getElementById("financialScopeContext")
				if (context?.dataset.vertical === "tour") url.searchParams.set("line", "tour")
				if (context?.dataset.productId)
					url.searchParams.set("experience", context.dataset.productId)
			}
			correction.href = url.pathname + url.search
			correction.textContent = blocker.label
		}
		login.hidden = status !== 401
		login.href = `/SignInPage?returnTo=${encodeURIComponent(location.pathname + location.search)}`
		const section = document.querySelector<HTMLElement>(`[data-financial-view]:not(.hidden)`)
		section?.setAttribute("aria-busy", health === "loading" ? "true" : "false")
		const anyItems = states.some((s) => Array.isArray(s.data?.items) && s.data.items.length > 0)
		// Counters derived from a partial source must not look authoritative.
		section
			?.querySelectorAll<HTMLElement>(
				"[data-financial-summary], [id$='Segments'], [id$='Summary'], [id$='SummaryHint'], #financialListSummary, #financialListHint"
			)
			.forEach((el) => {
				el.hidden = health !== "ready" || !anyItems || section?.dataset.financialEmpty === "true"
			})

		section?.querySelectorAll<HTMLElement>("[id$='Rows']").forEach((el) => {
			el.hidden = health !== "ready" && !anyItems
		})
	}
	function schedule() {
		clearTimeout(timer)
		timer = setTimeout(render, 0)
	}
	const controller = new AbortController()
	document.addEventListener(
		"astro:before-swap",
		() => {
			controller.abort()
			clearTimeout(timer)
		},
		{ once: true }
	)
	document.addEventListener(
		"financial:source-change",
		(event) => {
			const detail = (event as CustomEvent).detail
			if (detail?.url && new URL(detail.url, location.origin).searchParams.has("cursor"))
				paginationFailed = detail.state.status === "error"
			schedule()
		},
		{ signal: controller.signal }
	)
	document.addEventListener(
		"financial:view-change",
		() => {
			paginationFailed = false
			schedule()
		},
		{ signal: controller.signal }
	)
	retry.addEventListener("click", async () => {
		retry.disabled = true
		if (notice.dataset.bootFailed) {
			location.reload()
			return
		}
		try {
			if (paginationFailed) {
				await pageReloaders.get(location.pathname)?.()
				return
			}
			await Promise.allSettled(
				sources()
					.filter((url) => getFinancialSourceState(url)?.status === "error")
					.map((url) => fetchFinancialJson(url, { force: true }))
			)
			await reloaders.get(location.pathname)?.()
		} finally {
			retry.disabled = false
			render()
		}
	})
	schedule()
}
