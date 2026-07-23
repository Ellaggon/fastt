const badgeBase = "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold"
const badgeClasses = {
	neutral: "border-slate-200 bg-slate-100 text-slate-700",
	success: "border-emerald-200 bg-emerald-50 text-emerald-800",
	warning: "border-amber-200 bg-amber-50 text-amber-900",
	error: "border-red-200 bg-red-50 text-red-800",
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
	node.className = `${badgeBase} ${badgeClasses[variant] || badgeClasses.neutral}`
	node.textContent = label
}

function ensureDeferredShell() {
	const root = document.querySelector("[data-settings-deferred-root]")
	if (!root || root.dataset.ready === "true") return
	root.dataset.ready = "true"
	root.innerHTML = `
		<div data-settings-blockers-notice class="hidden rounded-[var(--fastt-radius-card)] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
			<p class="font-semibold">Qué bloquea qué</p>
			<p class="mt-1">Este resumen muestra exactamente qué capacidad queda bloqueada y por qué.</p>
		</div>
		<section class="grid gap-4 xl:grid-cols-4" data-settings-blocking-matrix></section>
		<section class="grid gap-4 xl:grid-cols-2">
			<div class="${panel}">
				<div class="space-y-4">
					<div>
						<h2 class="text-xl font-semibold text-slate-950">Readiness</h2>
						<p class="mt-2 text-sm leading-6 text-slate-600">Estado consolidado de cada área de configuración.</p>
					</div>
					<div class="space-y-3" data-settings-readiness></div>
				</div>
			</div>
			<div class="${panel}">
				<div class="space-y-4">
					<div>
						<h2 class="text-xl font-semibold text-slate-950">Riesgos y permisos</h2>
						<p class="mt-2 text-sm leading-6 text-slate-600">Señales que necesitan gobernanza antes de activar automatizaciones.</p>
					</div>
					<div class="space-y-3" data-settings-risks></div>
				</div>
			</div>
		</section>
		<section class="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
			<div class="${panel}" data-settings-simulation>
				<div class="space-y-4">
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div>
							<h2 class="text-xl font-semibold text-slate-950">Simulación antes de publicar</h2>
							<p class="mt-2 text-sm leading-6 text-slate-600">Estimación fiscal y de pagos con la configuración actual.</p>
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
						<h2 class="text-xl font-semibold text-slate-950">Auditoría reciente</h2>
						<p class="mt-2 text-sm leading-6 text-slate-600">Cambios sensibles registrados en perfil, fiscalidad, pagos e integraciones.</p>
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
		container.innerHTML = `<div class="${cardSoft} text-sm text-slate-600">Sin capacidades para mostrar.</div>`
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

function renderReadiness(items) {
	const container = document.querySelector("[data-settings-readiness]")
	if (!container) return
	container.innerHTML = items.length
		? items
				.map(
					(item) => `
						<a href="${escapeHtml(item.href || "#")}" class="block">
							<div class="${cardSoft} flex items-center justify-between gap-4 transition hover:border-slate-300 hover:bg-white">
								<div>
									<p class="text-sm font-semibold text-slate-950">${escapeHtml(item.label)}</p>
									<p class="mt-1 text-sm text-slate-600">${item.complete ? "Listo para operar" : "Requiere configuración"}</p>
								</div>
								<span class="${badgeBase} ${item.complete ? badgeClasses.success : badgeClasses.warning}">
									${item.complete ? "Completo" : "Pendiente"}
								</span>
							</div>
						</a>`
				)
				.join("")
		: `<div class="${cardSoft} text-sm text-slate-600">No hay readiness disponible.</div>`
}

function renderRisks(items) {
	const container = document.querySelector("[data-settings-risks]")
	if (!container) return
	container.innerHTML = items.length
		? items
				.map(
					(risk) => `
						<a href="${escapeHtml(risk.href || "#")}" class="block">
							<div class="${cardSoft} transition hover:border-slate-300 hover:bg-white">
								<div class="flex items-start justify-between gap-4">
									<p class="text-sm font-semibold text-slate-950">${escapeHtml(risk.label)}</p>
									<span class="${badgeBase} ${risk.severity === "medium" ? badgeClasses.warning : badgeClasses.neutral}">
										${risk.severity === "medium" ? "Medio" : "Bajo"}
									</span>
								</div>
							</div>
						</a>`
				)
				.join("")
		: `<div class="${cardSoft} text-sm text-slate-600">No hay riesgos activos en el resumen actual.</div>`
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

function hydrateSummary(summary) {
	ensureDeferredShell()
	const blockers = Array.isArray(summary.blockers) ? summary.blockers : []
	const risks = Array.isArray(summary.risks) ? summary.risks : []
	const progress = summary.progress || {}
	const counts = summary.counts || {}
	const simulation = summary.publicationSimulation || {}
	const capabilities = summary.capabilities || {}

	setText("[data-settings-provider-name]", summary.provider?.displayName || "Proveedor")
	setText("[data-settings-blockers-count]", blockers.length)
	setText("[data-settings-risks-count]", risks.length)
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
	document
		.querySelector("[data-settings-blockers-notice]")
		?.classList.toggle("hidden", blockers.length === 0)

	const cta = document.querySelector("[data-settings-primary-cta]")
	if (cta && summary.actions?.primaryCtaAction) {
		cta.setAttribute("href", summary.actions.primaryCtaAction)
		cta.textContent = summary.actions.primaryCtaLabel || "Continuar configuración"
	}

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

	renderBlockingMatrix(Array.isArray(summary.blockingMatrix) ? summary.blockingMatrix : [])
	renderReadiness(Array.isArray(summary.readiness) ? summary.readiness : [])
	renderRisks(risks)
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
	setText("[data-simulation-message]", simulation.message || "Simulación no disponible.")

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
}

async function loadSettingsSummary() {
	try {
		const response = await fetch("/api/provider/settings/summary", {
			headers: { Accept: "application/json" },
			credentials: "same-origin",
		})
		if (!response.ok) throw new Error(`summary_failed:${response.status}`)
		hydrateSummary(await response.json())
	} catch {
		document.querySelectorAll("[data-settings-placeholder]").forEach((node) => {
			node.textContent = "No se pudo cargar esta sección. Intenta refrescar."
		})
		setText("[data-settings-progress-label]", "No se pudo cargar el estado operativo.")
	}
}

if ("requestIdleCallback" in window) {
	window.requestIdleCallback(loadSettingsSummary, { timeout: 800 })
} else {
	window.setTimeout(loadSettingsSummary, 120)
}
