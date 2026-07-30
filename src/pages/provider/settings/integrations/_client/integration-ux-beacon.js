const ENDPOINT = "/api/provider/integrations/ux"
const STORAGE_KEY = "fastt.integrationUx.journey"
const MAX_JOURNEY_AGE_MS = 24 * 60 * 60 * 1000
const STEP_ORDER = ["provider", "access", "property", "review", "mapping"]

function newJourney() {
	const value = {
		id: crypto.randomUUID(),
		startedAt: Date.now(),
		completed: false,
	}
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
	return value
}

function journey(options = {}) {
	try {
		const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null")
		const expired = !stored?.startedAt || Date.now() - stored.startedAt > MAX_JOURNEY_AGE_MS
		if (options.restart || !stored?.id || stored.completed || expired) return newJourney()
		return stored
	} catch {
		return newJourney()
	}
}

function updateJourney(patch) {
	const current = journey()
	const next = { ...current, ...patch }
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
	return next
}

function eventKey(event, journeyId, detail = "") {
	return `fastt.integrationUx.sent:${journeyId}:${event}:${detail}`
}

function send(event, detail = {}, options = {}) {
	const current = journey()
	const dedupeKey = eventKey(event, current.id, options.dedupe || "")
	if (options.once && sessionStorage.getItem(dedupeKey) === "true") return
	if (options.once) sessionStorage.setItem(dedupeKey, "true")
	const payload = {
		event,
		journeyId: current.id,
		durationMs: Math.max(
			0,
			Math.round(performance.timeOrigin + performance.now() - current.startedAt)
		),
		surface: "integrations",
		...detail,
	}
	fetch(ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
		keepalive: true,
		credentials: "same-origin",
	}).catch(() => {})
}

function completeStep(step) {
	if (!STEP_ORDER.includes(step)) return
	send(
		"provider.integrations.ux.step_completed",
		{ connectorKey: "channel_manager", step },
		{ once: true, dedupe: step }
	)
}

function isAuthorizationError(errorCode) {
	return /(AUTH|OAUTH|CREDENTIAL|TOKEN|FORBIDDEN|UNAUTHORIZED|401|403)/i.test(
		String(errorCode || "")
	)
}

function bindCatalog() {
	const catalog = document.querySelector("[data-integration-catalog]")
	if (!catalog) return
	const current = journey()
	const isNewCatalogVisit = !sessionStorage.getItem(
		eventKey("provider.integrations.ux.journey_started", current.id)
	)
	const active = isNewCatalogVisit ? current : journey({ restart: current.completed })
	send(
		"provider.integrations.ux.journey_started",
		{ step: "catalog" },
		{ once: true, dedupe: active.id }
	)
	catalog.querySelectorAll("[data-catalog-connector] a").forEach((link) => {
		if (link.dataset.integrationUxBound === "true") return
		link.dataset.integrationUxBound = "true"
		link.addEventListener("click", () => {
			const connectorKey = link.closest("[data-catalog-connector]")?.dataset.catalogConnector
			send(
				"provider.integrations.ux.connector_selected",
				{ connectorKey, step: "catalog" },
				{ once: true, dedupe: connectorKey }
			)
		})
	})
}

function bindWizard() {
	const active = document.querySelector("[data-channel-wizard-step]")
	if (!(active instanceof HTMLElement)) return
	const step = active.dataset.channelWizardStep
	if (!STEP_ORDER.includes(step)) return
	send(
		"provider.integrations.ux.step_viewed",
		{ connectorKey: "channel_manager", step },
		{ once: true, dedupe: step }
	)

	active.querySelectorAll("form").forEach((form) => {
		if (form.dataset.integrationUxBound === "true") return
		form.dataset.integrationUxBound = "true"
		form.addEventListener("submit", () => completeStep(step))
	})
	active.querySelectorAll("a[href]").forEach((link) => {
		if (link.dataset.integrationUxBound === "true") return
		link.dataset.integrationUxBound = "true"
		link.addEventListener("click", () => {
			try {
				const target = new URL(link.href).searchParams.get("step")?.trim()
				if (STEP_ORDER.indexOf(target) > STEP_ORDER.indexOf(step)) completeStep(step)
				if (step === "review" && link.href.includes("/mapping")) completeStep(step)
			} catch {
				/* Ignore malformed internal links. */
			}
		})
	})

	const url = new URL(window.location.href)
	const errorCode = url.searchParams.get("error")
	if (errorCode && isAuthorizationError(errorCode)) {
		send(
			"provider.integrations.ux.authorization_error",
			{ connectorKey: "channel_manager", step, errorCode },
			{ once: true, dedupe: `${step}:${errorCode}` }
		)
	}
}

function bindMapping() {
	if (!document.querySelector("[data-mapping-workspace]")) return
	send(
		"provider.integrations.ux.step_viewed",
		{ connectorKey: "channel_manager", step: "mapping" },
		{ once: true, dedupe: "mapping" }
	)
}

function bindFirstSync() {
	if (new URL(window.location.href).searchParams.get("success") !== "sync_tested") return
	send(
		"provider.integrations.ux.first_sync_valid",
		{ connectorKey: "channel_manager", step: "review" },
		{ once: true, dedupe: "first-sync" }
	)
	updateJourney({ completed: true, completedAt: Date.now() })
}

function bindAll() {
	bindCatalog()
	bindWizard()
	bindMapping()
	bindFirstSync()
}

document.addEventListener("integration:mapping-snapshot", (event) => {
	const detail = event instanceof CustomEvent ? event.detail : {}
	send("provider.integrations.ux.mapping_snapshot", {
		connectorKey: "channel_manager",
		step: "mapping",
		pendingMappings: Number(detail?.pendingMappings ?? 0),
		totalMappings: Number(detail?.totalMappings ?? 0),
	})
})

document.addEventListener("integration:authorization-error", (event) => {
	const detail = event instanceof CustomEvent ? event.detail : {}
	if (!isAuthorizationError(detail?.errorCode)) return
	send("provider.integrations.ux.authorization_error", {
		connectorKey: "channel_manager",
		step: String(detail?.step ?? "access"),
		errorCode: String(detail?.errorCode ?? "AUTHORIZATION_FAILED"),
	})
})

document.addEventListener("integration:mappings-saved", () => completeStep("mapping"))

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindAll)
else bindAll()
document.addEventListener("astro:page-load", bindAll)
