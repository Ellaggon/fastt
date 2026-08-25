const badgeBase = "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold"
const badgeClasses = {
	neutral: "border-slate-200 bg-slate-100 text-slate-700",
	success: "border-emerald-200 bg-emerald-50 text-emerald-800",
	warning: "border-amber-200 bg-amber-50 text-amber-900",
	error: "border-red-200 bg-red-50 text-red-800",
	info: "border-sky-200 bg-sky-50 text-sky-800",
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
		return { label: "En revisión", variant: "info" }
	}
	if (risk?.severity === "high") return { label: "Acción necesaria", variant: "error" }
	return { label: "Pendiente", variant: "warning" }
}

function readinessRowClass(status, complete = false) {
	const base = "fastt-row-card group flex flex-wrap items-center gap-3 p-4 transition"
	if (complete) return base
	if (status.variant === "error") return `${base} fastt-row-card-danger`
	if (status.variant === "warning") return `${base} fastt-row-card-alert`
	return `${base} fastt-row-card-info`
}

function lucideIcon(paths) {
	return `<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
}

const areaIcons = {
	identity: lucideIcon(
		'<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>'
	),
	operations: lucideIcon(
		'<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 0 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/>'
	),
	verification: lucideIcon(
		'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'
	),
	documents: lucideIcon(
		'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'
	),
	fiscality: lucideIcon(
		'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>'
	),
	payments: lucideIcon(
		'<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>'
	),
	integrations: lucideIcon(
		'<path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/><path d="m2 22 3-3"/><path d="M7.5 13.5 10 11"/><path d="M10.5 16.5 13 14"/><path d="m18 3-4 4h6l-4 4"/>'
	),
	team: lucideIcon(
		'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
	),
}

function readinessAreaIcon(id) {
	return areaIcons[id] || areaIcons.verification
}

function readinessIconWellClass(status, complete = false) {
	if (complete || status.variant === "success") {
		return "flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700"
	}
	if (status.variant === "error") {
		return "flex size-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700"
	}
	if (status.variant === "warning") {
		return "flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-800"
	}
	return "flex size-9 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700"
}

const rowChevron = `<svg class="size-4 shrink-0 text-slate-400 transition group-hover:text-[var(--fastt-color-selection)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`
const completeAreasIcon = lucideIcon('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>')

function renderReadinessRow(item, risks, options = {}) {
	const status = areaStatus(item, risks)
	const complete = options.complete === true
	const label = complete ? item.label : activationLabel(item, risks)
	const href = complete ? item.href : primaryRiskForArea(item, risks)?.href || item.href
	const copy = complete ? "Sin bloqueos directos" : impactLabel(item)
	return `
		<a href="${escapeHtml(href || "#")}" class="${readinessRowClass(status, complete)}" data-settings-checklist-row>
			<span class="${readinessIconWellClass(status, complete)}" data-settings-row-icon="${escapeHtml(item.id || "")}">${readinessAreaIcon(item.id)}</span>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold text-slate-950">${escapeHtml(label)}</p>
				<p class="mt-1 text-sm leading-5 text-slate-500">${escapeHtml(copy)}</p>
			</div>
			<div class="flex flex-wrap items-center gap-2 sm:justify-end">
				<span class="${badgeBase} ${badgeClasses[status.variant] || badgeClasses.neutral}" data-settings-row-status>${escapeHtml(status.label)}</span>
				${rowChevron}
			</div>
		</a>`
}

function renderReadiness(items, risks = []) {
	const container = document.querySelector("[data-settings-readiness]")
	if (!container) return
	if (!items.length) {
		container.innerHTML = `<div class="px-5 py-6 text-sm text-slate-500">Aún no hay estado de tu cuenta disponible.</div>`
		return
	}
	const incomplete = items.filter((item) => !item.complete)
	const complete = items.filter((item) => item.complete)
	const completeHtml = complete.length
		? `
			<details class="fastt-soft-box group border border-slate-200 bg-white" ${incomplete.length ? "" : "open"} data-settings-complete-areas>
				<summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-sky-50">
					<span class="inline-flex items-center gap-2"><span class="text-emerald-600">${completeAreasIcon}</span><span>Áreas completadas (${complete.length})</span></span>
					<span class="text-xs font-medium text-slate-500 group-open:hidden">Mostrar</span>
					<span class="hidden text-xs font-medium text-slate-500 group-open:inline">Ocultar</span>
				</summary>
				<div class="space-y-3 border-t border-slate-100 p-3">${complete.map((item) => renderReadinessRow(item, risks, { complete: true })).join("")}</div>
			</details>`
		: ""
	container.innerHTML = `
		<header class="border-b border-sky-100 bg-sky-50/80 px-5 py-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h2 class="text-lg font-semibold text-slate-950">Pendientes</h2>
				<span class="${badgeBase} ${incomplete.length ? badgeClasses.info : badgeClasses.success}">${incomplete.length ? incomplete.length : "Listo"}</span>
			</div>
			<p class="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Un requisito a la vez. El detalle de cada revisión permanece en su propia sección.</p>
		</header>
		<div class="space-y-3 bg-slate-50/90 p-4 sm:p-5">
			${incomplete.map((item) => renderReadinessRow(item, risks)).join("")}
			${completeHtml}
		</div>`
}

function hydrateSummary(summary) {
	const blockers = Array.isArray(summary.blockers) ? summary.blockers : []
	const risks = Array.isArray(summary.risks) ? summary.risks : []
	const progress = summary.progress || {}
	const capabilities = summary.capabilities || {}

	setText("[data-settings-provider-name]", summary.provider?.displayName || "Proveedor")
	setText(
		"[data-settings-progress-label]",
		`${Number(progress.completed || 0)} de ${Number(progress.total || 0)}`
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
		blockers.length ? "En curso" : "Lista"
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
		const ctaLabel = document.querySelector("[data-settings-primary-cta-label]")
		if (ctaLabel) {
			ctaLabel.textContent = summary.actions.primaryCtaLabel || "Continuar configuración"
		} else {
			cta.textContent = summary.actions.primaryCtaLabel || "Continuar configuración"
		}
	}
	const nextStepIcon = document.querySelector("[data-settings-next-step-icon]")
	if (nextStepIcon) {
		nextStepIcon.innerHTML = blockers[0]?.id ? readinessAreaIcon(blockers[0].id) : completeAreasIcon
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
