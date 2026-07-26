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
const cardSoft = "rounded-[var(--fastt-radius-card)] border border-slate-200 bg-slate-50 p-4"
const panel = "rounded-[var(--fastt-radius-card)] border border-slate-200 bg-white p-5"

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

function pluralizeEs(count, singular, plural) {
	return `${Number(count || 0)} ${Number(count || 0) === 1 ? singular : plural}`
}

function ensureDeferredShell() {
	const root = document.querySelector("[data-settings-deferred-root]")
	if (!root || root.dataset.ready === "true") return
	root.dataset.ready = "true"
	root.innerHTML = `
		<section class="grid gap-4 xl:grid-cols-4" data-settings-blocking-matrix></section>
		<section class="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
			<div class="${panel}" data-settings-simulation>
				<div class="space-y-4">
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div>
							<h2 class="text-xl font-semibold text-slate-950">Prueba de publicación</h2>
							<p class="mt-2 text-sm leading-6 text-slate-600">Una lectura rápida de precio, impuestos y cobro con la configuración actual.</p>
						</div>
						<span class="${badgeBase} ${badgeClasses.neutral}" data-simulation-status>Revisar</span>
					</div>
					<div class="grid gap-3 sm:grid-cols-3">
						<div class="rounded-[var(--fastt-radius-card)] bg-slate-50 p-4">
							<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Base</p>
							<p class="mt-2 text-xl font-semibold text-slate-950" data-simulation-base>USD0.00</p>
						</div>
						<div class="rounded-[var(--fastt-radius-card)] bg-slate-50 p-4">
							<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Impuestos</p>
							<p class="mt-2 text-xl font-semibold text-slate-950" data-simulation-tax>USD0.00</p>
						</div>
						<div class="rounded-[var(--fastt-radius-card)] bg-slate-50 p-4">
							<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pago proveedor</p>
							<p class="mt-2 text-xl font-semibold text-slate-950" data-simulation-payout>USD0.00</p>
						</div>
					</div>
					<p class="text-sm leading-6 text-slate-600" data-simulation-message></p>
				</div>
			</div>
			<div class="${panel}">
				<div class="space-y-4">
					<div>
						<h2 class="text-xl font-semibold text-slate-950">Cambios recientes</h2>
						<p class="mt-2 text-sm leading-6 text-slate-600">Últimas actualizaciones en perfil, fiscalidad, cobros e integraciones.</p>
					</div>
					<div class="space-y-3" data-settings-audit></div>
				</div>
			</div>
		</section>`
}

function formatDate(value) {
	if (!value) return "Sin fecha"
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return "Sin fecha"
	return new Intl.DateTimeFormat("es", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date)
}

function renderBlockingMatrix(items) {
	const container = document.querySelector("[data-settings-blocking-matrix]")
	if (!container) return
	if (!items.length) {
		container.innerHTML = `<div class="${cardSoft} text-sm text-slate-600">Sin áreas adicionales para revisar.</div>`
		return
	}
	container.innerHTML = items
		.map((item) => {
			const blockers = Array.isArray(item.blockers) ? item.blockers : []
			const blockerHtml = blockers.length
				? blockers
						.map(
							(blocker) => `
								<a href="${escapeHtml(blocker.href || "#")}" class="block">
									<div class="${cardSoft} p-3 text-sm font-semibold text-slate-800 transition hover:bg-white">
										${escapeHtml(blocker.label)}
									</div>
								</a>`
						)
						.join("")
				: `<p class="rounded-[var(--fastt-radius-control)] bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Sin bloqueos directos</p>`
			return `
				<div class="rounded-[var(--fastt-radius-card)] border ${item.enabled ? "border-emerald-200" : "border-amber-200"} bg-white p-5">
					<div class="flex h-full flex-col gap-4">
						<div class="flex items-start justify-between gap-3">
							<h2 class="text-lg font-semibold text-slate-950">${escapeHtml(item.label)}</h2>
							<span class="${badgeBase} ${item.enabled ? badgeClasses.success : badgeClasses.warning}">
								${item.enabled ? "Activa" : "Bloqueada"}
							</span>
						</div>
						<p class="text-sm leading-6 text-slate-600">${escapeHtml(item.message)}</p>
						<div class="grid gap-2">${blockerHtml}</div>
					</div>
				</div>`
		})
		.join("")
}

function riskSeverityLabel(severity) {
	return severity === "high" ? "Alto" : severity === "medium" ? "Medio" : "Bajo"
}

function risksForReadinessItem(item, risks) {
	return risks.filter((risk) => {
		if (risk.href && item.href && risk.href === item.href) return true
		const itemCapabilities = Array.isArray(item.capabilities) ? item.capabilities : []
		const riskCapabilities = Array.isArray(risk.capabilities) ? risk.capabilities : []
		return riskCapabilities.some((capability) => itemCapabilities.includes(capability))
	})
}

function renderReadiness(items, risks = []) {
	const container = document.querySelector("[data-settings-readiness]")
	if (!container) return
	const ordered = [...items].sort(
		(a, b) => Number(Boolean(a.complete)) - Number(Boolean(b.complete))
	)
	container.innerHTML = ordered.length
		? ordered
				.map((item) => {
					const areaRisks = risksForReadinessItem(item, risks).slice(0, 2)
					const risksHtml = areaRisks.length
						? `
							<div class="grid gap-2" data-settings-row-risks>
								${areaRisks
									.map((risk) => {
										const variant =
											risk.severity === "high"
												? "error"
												: risk.severity === "medium"
													? "warning"
													: "neutral"
										const palette =
											risk.severity === "high"
												? "border-red-200 bg-red-50 text-red-950"
												: "border-amber-200 bg-amber-50 text-amber-950"
										return `
											<div class="flex items-start justify-between gap-3 rounded-xl border px-3 py-2 ${palette}">
												<p class="text-xs font-semibold leading-5">${escapeHtml(risk.label)}</p>
												<span class="${badgeBase} ${badgeClasses[variant]}">${riskSeverityLabel(risk.severity)}</span>
											</div>`
									})
									.join("")}
							</div>`
						: ""
					return `
						<a href="${escapeHtml(item.href || "#")}" class="block">
							<div class="${cardSoft} space-y-3 transition hover:border-slate-300 hover:bg-white" data-settings-checklist-row>
								<div class="flex items-center justify-between gap-4">
									<div>
										<p class="text-sm font-semibold text-slate-950">${escapeHtml(item.label)}</p>
										<p class="mt-1 text-sm text-slate-600">${item.complete ? "Listo para operar" : "Requiere configuración"}</p>
									</div>
									<span class="${badgeBase} ${item.complete ? badgeClasses.success : badgeClasses.warning}">
										${item.complete ? "Completo" : "Pendiente"}
									</span>
								</div>
								${risksHtml}
							</div>
						</a>`
				})
				.join("")
		: `<div class="${cardSoft} text-sm text-slate-600">Aún no hay estado de tu cuenta disponible.</div>`
}

function renderRisks(items) {
	const container = document.querySelector("[data-settings-risks]")
	if (!container) return
	const highRisks = items.filter((risk) => risk.severity === "high")
	const highRisksSection = document.querySelector("[data-settings-high-risks]")
	if (highRisksSection instanceof HTMLElement) {
		highRisksSection.hidden = highRisks.length === 0
	}
	container.innerHTML = highRisks.length
		? highRisks
				.map((risk) => {
					return `
						<a href="${escapeHtml(risk.href || "#")}" class="block">
							<div class="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-white px-3 py-2">
								<div class="flex items-start justify-between gap-4">
									<p class="text-sm font-semibold text-red-950">${escapeHtml(risk.label)}</p>
									<span class="${badgeBase} ${badgeClasses.error}">Alto</span>
								</div>
							</div>
						</a>`
				})
				.join("")
		: ""
}

function renderAudit(items) {
	const container = document.querySelector("[data-settings-audit]")
	if (!container) return
	container.innerHTML = items.length
		? items
				.map((event) => {
					const variant =
						event.riskLevel === "high"
							? "error"
							: event.riskLevel === "medium"
								? "warning"
								: "neutral"
					return `
						<div class="${cardSoft}">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p class="text-sm font-semibold text-slate-950">${escapeHtml(event.action)}</p>
									<p class="mt-1 text-sm text-slate-600">${escapeHtml(event.entityType)} · ${escapeHtml(event.actorEmail || "Sistema")}</p>
								</div>
								<span class="${badgeBase} ${badgeClasses[variant]}">${escapeHtml(event.riskLevel || "low")}</span>
							</div>
							<p class="mt-2 text-xs text-slate-500">${formatDate(event.createdAt)}</p>
						</div>`
				})
				.join("")
		: `<div class="${cardSoft} text-sm text-slate-600">Aún no hay eventos de auditoría visibles.</div>`
}

let diagnosticsLoaded = false
let diagnosticsLoading = false

function renderDiagnostics(summary) {
	ensureDeferredShell()
	const simulation = summary.publicationSimulation || {}
	renderBlockingMatrix(Array.isArray(summary.blockingMatrix) ? summary.blockingMatrix : [])
	renderAudit(Array.isArray(summary.auditEvents) ? summary.auditEvents : [])

	setBadge(
		document.querySelector("[data-simulation-status]"),
		simulation.canPublishSafely ? "success" : "warning",
		simulation.canPublishSafely ? "Lista" : "Revisar"
	)
	const currency = simulation.currency || "USD"
	setText("[data-simulation-base]", `${currency}${Number(simulation.baseAmount || 0).toFixed(2)}`)
	setText("[data-simulation-tax]", `${currency}${Number(simulation.estimatedTax || 0).toFixed(2)}`)
	setText(
		"[data-simulation-payout]",
		`${currency}${Number(simulation.estimatedPayout || 0).toFixed(2)}`
	)
	setText("[data-simulation-message]", simulation.message || "Prueba no disponible.")
	diagnosticsLoaded = true
}

function hydrateSummary(summary, options = {}) {
	const renderAdvanced = options.renderDiagnostics === true
	const blockers = Array.isArray(summary.blockers) ? summary.blockers : []
	const risks = Array.isArray(summary.risks) ? summary.risks : []
	const progress = summary.progress || {}
	const counts = summary.counts || {}
	const capabilities = summary.capabilities || {}

	setText("[data-settings-provider-name]", summary.provider?.displayName || "Proveedor")
	setText("[data-settings-blockers-count]", pluralizeEs(blockers.length, "bloqueo", "bloqueos"))
	setText("[data-settings-risks-count]", pluralizeEs(risks.length, "riesgo", "riesgos"))
	setText("[data-settings-progress-label]", progress.message || "Configuración base calculada.")
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
	const secondary = document.querySelector("[data-settings-secondary-cta]")
	if (secondary) {
		if (summary.actions?.secondaryCtaAction) {
			secondary.setAttribute("href", summary.actions.secondaryCtaAction)
		}
		if (summary.actions?.secondaryCtaLabel) {
			secondary.textContent = summary.actions.secondaryCtaLabel
		}
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
	if (secondary instanceof HTMLElement) {
		secondary.setAttribute("data-funnel-cta", "secondary")
		secondary.setAttribute("data-funnel-surface", "hub_coach")
		if (primaryBlockerId) {
			secondary.setAttribute("data-funnel-domain", primaryBlockerId)
		}
	}

	document.dispatchEvent(new CustomEvent("settings-summary-hydrated"))

	const capabilityLabels = {
		publish: ["Habilitada", "Bloqueada"],
		booking: ["Habilitadas", "Bloqueadas"],
		payments: ["Habilitados", "Bloqueados"],
		integrations: ["Listas", "Sin activar"],
	}
	for (const [key, labels] of Object.entries(capabilityLabels)) {
		const enabled = Boolean(capabilities[key])
		setBadge(
			document.querySelector(`[data-capability="${key}"]`),
			enabled ? "success" : key === "integrations" ? "neutral" : "warning",
			enabled ? labels[0] : labels[1]
		)
	}

	renderReadiness(Array.isArray(summary.readiness) ? summary.readiness : [], risks)
	renderRisks(risks)

	setText(
		'[data-count="documents"]',
		`${Number(counts.verifiedDocuments || 0)} / ${Number(counts.documents || 0)}`
	)
	setText(
		'[data-count="paymentAccounts"]',
		`${Number(counts.verifiedPaymentAccounts || 0)} / ${Number(counts.paymentAccounts || 0)}`
	)
	setText(
		'[data-count="integrations"]',
		`${Number(counts.connectedIntegrations || 0)} / ${Number(counts.integrations || 0)}`
	)
	setText('[data-count="auditEvents"]', Number(counts.auditEvents || 0))

	if (renderAdvanced) renderDiagnostics(summary)
}

async function loadSettingsSummary(options = {}) {
	try {
		const scope = options.scope === "full" ? "full" : "hub"
		const response = await fetch(`/api/provider/settings/summary?scope=${scope}`, {
			headers: { Accept: "application/json" },
			credentials: "same-origin",
		})
		if (!response.ok) throw new Error(`summary_failed:${response.status}`)
		hydrateSummary(await response.json(), {
			renderDiagnostics: options.renderDiagnostics === true,
		})
	} catch {
		if (options.renderDiagnostics === true) {
			const root = document.querySelector("[data-settings-deferred-root]")
			if (root) {
				root.innerHTML = `<div class="${cardSoft} text-sm text-slate-600">No se pudo cargar el diagnóstico avanzado. Intenta refrescar.</div>`
			}
		}
		document.querySelectorAll("[data-settings-placeholder]").forEach((node) => {
			node.textContent = "No se pudo cargar esta sección. Intenta refrescar."
		})
		const progress = document.querySelector("[data-settings-progress-label]")
		if (progress && /cargar|Cargando/i.test(progress.textContent || "")) {
			progress.textContent = "No se pudo actualizar el estado operativo."
		}
	}
}

async function loadDiagnosticsOnOpen() {
	const details = document.querySelector("[data-settings-details-diagnostics]")
	if (!(details instanceof HTMLDetailsElement)) return
	if (!details.open || diagnosticsLoaded || diagnosticsLoading) return
	diagnosticsLoading = true
	const root = document.querySelector("[data-settings-deferred-root]")
	if (root) {
		root.innerHTML = `<div class="${cardSoft} text-sm text-slate-600">Cargando diagnóstico avanzado...</div>`
	}
	try {
		await loadSettingsSummary({ scope: "full", renderDiagnostics: true })
	} finally {
		diagnosticsLoading = false
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

const diagnosticsDetails = document.querySelector("[data-settings-details-diagnostics]")
if (diagnosticsDetails instanceof HTMLDetailsElement) {
	diagnosticsDetails.addEventListener("toggle", loadDiagnosticsOnOpen)
	loadDiagnosticsOnOpen()
}

if (!bootstrapSummary && "requestIdleCallback" in window) {
	window.requestIdleCallback(loadSettingsSummary, { timeout: 1500 })
} else if (!bootstrapSummary) {
	window.setTimeout(loadSettingsSummary, 250)
}
