const badgeBase = "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold"
const badgeClasses = {
	neutral: "border-slate-200 bg-slate-100 text-slate-700",
	success: "border-emerald-200 bg-emerald-50 text-emerald-800",
	warning: "border-amber-200 bg-amber-50 text-amber-900",
	error: "border-red-200 bg-red-50 text-red-800",
}
const darkBadgeClasses = {
	neutral: "border-white/15 bg-white/10 text-slate-200",
	success: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
	warning: "border-amber-300/30 bg-amber-400/10 text-amber-100",
	error: "border-red-300/30 bg-red-400/10 text-red-100",
}
function escapeHtml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;")
}

function setText(selector, value) {
	const node = document.querySelector(selector)
	if (node) node.textContent = String(value ?? "")
}

function setBadge(node, variant, label) {
	if (!node) return
	const palette = node.hasAttribute("data-settings-dark-badge") ? darkBadgeClasses : badgeClasses
	node.className = `${badgeBase} ${palette[variant] || palette.neutral}`
	node.textContent = label
}

function risksForReadinessItem(item, risks) {
	return risks.filter((risk) => risk.areaId === item.id)
}

function impactLabel(item) {
	if (item.complete) return "Sin bloqueos directos"
	const labels = (Array.isArray(item.capabilities) ? item.capabilities : [])
		.map(
			(capability) =>
				({
					publish: "publicación",
					booking: "reservas",
					payments: "cobros",
					integrations: "integraciones",
				})[capability]
		)
		.filter(Boolean)
	return labels.length ? `Bloquea ${labels.join(", ")}` : "Requiere atención"
}

function primaryRiskForArea(item, risks) {
	const weights = { high: 0, medium: 1, low: 2 }
	return [...risksForReadinessItem(item, risks)].sort(
		(a, b) => (weights[a.severity] ?? 3) - (weights[b.severity] ?? 3)
	)[0]
}

function activationLabel(item, risks) {
	const risk = primaryRiskForArea(item, risks)
	if (risk) return risk.label
	return (
		{
			identity: "Completa los datos del negocio",
			operations: "Completa la operación diaria",
			verification: "Cuenta en revisión",
			documents: "Completa los documentos mínimos",
			fiscality: "Verifica tu registro fiscal",
			payments: "Configura una cuenta para cobrar",
			integrations: "Conecta un canal",
			team: "Añade una persona administradora",
		}[item.id] ||
		item.label ||
		"Configuración pendiente"
	)
}

function activationTitle(capabilities) {
	if (capabilities.publish && capabilities.payments) return "Tu operación está lista"
	if (capabilities.publish) return "Completa la activación para cobrar"
	return "Completa la activación para publicar y cobrar"
}

function areaStatus(item, risks) {
	if (item.complete) return { label: "Completo", variant: "success" }
	const risk = primaryRiskForArea(item, risks)
	if (
		item.id === "verification" ||
		/pendiente de validación|en revisión|enviado/i.test(String(risk?.label || ""))
	) {
		return { label: "En revisión", variant: "warning" }
	}
	if (risk?.severity === "high") return { label: "Acción necesaria", variant: "error" }
	return { label: "Pendiente", variant: "warning" }
}

function renderReadinessRow(item, risks, options = {}) {
	const status = areaStatus(item, risks)
	const complete = options.complete === true
	const label = complete ? item.label : activationLabel(item, risks)
	const href = complete ? item.href : primaryRiskForArea(item, risks)?.href || item.href
	const copy = complete ? "Sin bloqueos directos" : impactLabel(item)
	return `
		<a href="${escapeHtml(href || "#")}" class="${complete ? "flex flex-wrap items-center justify-between" : "grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center border-l-2 border-l-transparent hover:border-l-amber-300"} gap-3 border-b border-neutral-800 px-4 py-4 transition last:border-b-0 hover:bg-neutral-900 sm:px-5" data-settings-checklist-row>
			<div class="min-w-0">
				<p class="text-sm font-semibold text-white">${escapeHtml(label)}</p>
				<p class="mt-1 text-sm text-neutral-400">${escapeHtml(copy)}</p>
			</div>
			<div class="flex flex-wrap items-center gap-2 sm:justify-end">
				<span class="${badgeBase} ${badgeClasses[status.variant] || badgeClasses.neutral}" data-settings-row-status>${escapeHtml(status.label)}</span>
			</div>
		</a>`
}

function renderReadiness(items, risks = []) {
	const container = document.querySelector("[data-settings-readiness]")
	if (!container) return
	if (!items.length) {
		container.innerHTML = `<div class="px-5 py-4 text-sm text-neutral-400">Aún no hay estado de tu cuenta disponible.</div>`
		return
	}
	const incomplete = items.filter((item) => !item.complete)
	const complete = items.filter((item) => item.complete)
	const completeHtml = complete.length
		? `
			<details class="group" ${incomplete.length ? "" : "open"} data-settings-complete-areas>
				<summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-semibold text-neutral-300 transition hover:bg-neutral-900 sm:px-5">
					<span>Áreas completadas (${complete.length})</span>
					<span class="text-xs font-medium text-neutral-500 group-open:hidden">Mostrar</span>
					<span class="hidden text-xs font-medium text-neutral-500 group-open:inline">Ocultar</span>
				</summary>
				<div class="border-t border-neutral-800">${complete.map((item) => renderReadinessRow(item, risks, { complete: true })).join("")}</div>
			</details>`
		: ""
	container.innerHTML = `${incomplete.map((item) => renderReadinessRow(item, risks)).join("")}${completeHtml}`
}

function hydrateSummary(summary) {
	const blockers = Array.isArray(summary.blockers) ? summary.blockers : []
	const risks = Array.isArray(summary.risks) ? summary.risks : []
	const progress = summary.progress || {}
	const capabilities = summary.capabilities || {}

	setText("[data-settings-provider-name]", summary.provider?.displayName || "Proveedor")
	setText(
		"[data-settings-progress-label]",
		`${Number(progress.completed || 0)} de ${Number(progress.total || 0)} requisitos completados`
	)
	setText("[data-settings-activation-title]", activationTitle(capabilities))
	const progressBar = document.querySelector("[data-settings-progress-bar]")
	if (progressBar) {
		const percent = Math.max(0, Math.min(100, Number(progress.progressPercent || 0)))
		progressBar.style.width = `${percent}%`
	}
	setBadge(
		document.querySelector("[data-settings-base-badge]"),
		blockers.length ? "warning" : "success",
		blockers.length ? "Con bloqueos" : "Base lista"
	)

	const nextStepLabel =
		summary.actions?.coachLabel || blockers[0]?.label || "Configuración base lista"
	const nextStepBody = summary.actions?.coachBody
		? summary.actions.coachBody
		: blockers[0]
			? "Un solo paso del mapa de confianza a la vez: Perfil → Verificación → Fiscal → Pagos."
			: "Ya puedes operar lo básico. Revisa las áreas si quieres afinar fiscalidad, pagos o equipo."
	setText("[data-settings-next-step-label]", nextStepLabel)
	setText("[data-settings-next-step-body]", nextStepBody)

	const cta = document.querySelector("[data-settings-primary-cta]")
	if (cta && summary.actions?.primaryCtaAction) {
		cta.setAttribute("href", summary.actions.primaryCtaAction)
		cta.textContent = summary.actions.primaryCtaLabel || "Continuar configuración"
	}
	const nextStep = document.querySelector("[data-settings-next-step]")
	const primaryBlockerId = blockers[0]?.id || ""
	if (nextStep) {
		if (primaryBlockerId) {
			nextStep.setAttribute("data-funnel-blocker-id", primaryBlockerId)
			nextStep.setAttribute("data-funnel-domain", primaryBlockerId)
			nextStep.setAttribute("data-funnel-surface", "hub_coach")
			nextStep.removeAttribute("data-funnel-emitted")
		} else {
			nextStep.removeAttribute("data-funnel-blocker-id")
			nextStep.removeAttribute("data-funnel-domain")
		}
	}
	if (cta instanceof HTMLElement) {
		cta.setAttribute("data-funnel-cta", "primary")
		cta.setAttribute("data-funnel-surface", "hub_coach")
		if (primaryBlockerId) {
			cta.setAttribute("data-funnel-domain", primaryBlockerId)
			cta.setAttribute("data-funnel-blocker-id", primaryBlockerId)
		}
	}
	document.dispatchEvent(new CustomEvent("settings-summary-hydrated"))

	renderReadiness(Array.isArray(summary.readiness) ? summary.readiness : [], risks)
}

async function loadSettingsSummary() {
	try {
		const response = await fetch("/api/provider/settings/summary?scope=hub", {
			headers: { Accept: "application/json" },
			credentials: "same-origin",
		})
		if (!response.ok) throw new Error(`summary_failed:${response.status}`)
		hydrateSummary(await response.json())
	} catch {
		document.querySelectorAll("[data-settings-placeholder]").forEach((node) => {
			node.textContent = "No se pudo cargar esta sección. Intenta refrescar."
		})
		const progress = document.querySelector("[data-settings-progress-label]")
		if (progress && /cargar|Cargando/i.test(progress.textContent || "")) {
			progress.textContent = "No se pudo actualizar el estado operativo."
		}
	}
}

function readBootstrapSummary() {
	const node = document.getElementById("settings-summary-bootstrap")
	if (!node) return null
	const raw = node.textContent?.trim()
	if (!raw || raw === "null") return null
	try {
		return JSON.parse(raw)
	} catch {
		return null
	}
}

const bootstrapSummary = readBootstrapSummary()
if (bootstrapSummary) {
	hydrateSummary(bootstrapSummary)
}

if (!bootstrapSummary && "requestIdleCallback" in window) {
	window.requestIdleCallback(loadSettingsSummary, { timeout: 1500 })
} else if (!bootstrapSummary) {
	window.setTimeout(loadSettingsSummary, 250)
}
