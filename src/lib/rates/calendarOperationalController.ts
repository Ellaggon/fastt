// @ts-nocheck
import {
	addDays,
	countInclusiveDays,
	formatHumanDateLabel,
	formatRangeLabel,
	normalizeCalendarRange,
	selectCalendarRangePreset,
	updateCalendarRangeHighlight,
} from "@/lib/rates/calendarRangeOperations"
import { flashAppliedRange } from "@/lib/rates/mobileCalendarInteraction"

export function initRatesCalendar() {
	const feedback = document.getElementById("pricingCalendarFeedback")
	const operationResult = document.getElementById("pricingOperationResult")
	const generateBtn = document.getElementById("generatePricingCoverageBtn")
	const rangePanel = document.getElementById("pricingRangePanel")
	const manualPriceOpenBtn = document.querySelector("[data-panel-manual-price-action]")
	const manualPriceDrawer = document.getElementById("pricingManualPriceDrawer")
	const manualPriceBackdrop = document.getElementById("pricingManualPriceBackdrop")
	const manualPriceCloseBtn = document.getElementById("pricingManualPriceCloseBtn")
	const manualPriceRangeLabel = document.querySelector("[data-manual-price-range-label]")
	const rangePreview = document.getElementById("pricingRangePreview")
	const rangeOperationType = document.getElementById("pricingRangeOperationType")
	const rangeValueLabel = document.getElementById("pricingRangeValueLabel")
	const rangeValue = document.getElementById("pricingRangeValue")
	const rangePreviewBtn = document.getElementById("pricingRangePreviewBtn")
	const rangeApplyBtn = document.getElementById("pricingRangeApplyBtn")
	const rangeGenerateBtn = document.getElementById("pricingRangeGenerateBtn")
	const rangeClearBtn = document.getElementById("pricingRangeClearBtn")
	const panelInventoryValue = document.querySelector("[data-panel-inventory-value]")
	const panelInventoryPreviewBtn = document.querySelector("[data-panel-inventory-preview]")
	const panelInventoryApplyBtn = document.querySelector("[data-panel-inventory-apply]")
	const panelInventoryFeedback = document.querySelector("[data-panel-inventory-feedback]")
	const inventoryPhysicalOpenBtn = document.querySelector("[data-panel-inventory-action]")
	const inventoryPhysicalDrawer = document.getElementById("inventoryPhysicalDrawer")
	const inventoryPhysicalBackdrop = document.getElementById("inventoryPhysicalBackdrop")
	const inventoryPhysicalCloseBtn = document.getElementById("inventoryPhysicalCloseBtn")
	const inventoryRangeLabel = document.querySelector("[data-inventory-range-label]")
	const inventoryPhysicalDetailToggle = document.getElementById("inventoryPhysicalDetailToggle")
	const calendarHistoryOpenBtn = document.querySelector("[data-panel-calendar-history]")
	const calendarHistoryDrawer = document.getElementById("pricingCalendarHistoryDrawer")
	const calendarHistoryBackdrop = document.getElementById("pricingCalendarHistoryBackdrop")
	const calendarHistoryCloseBtn = document.getElementById("pricingCalendarHistoryCloseBtn")
	const restrictionSimpleBackdrop = document.getElementById("restrictionSimpleBackdrop")
	const restrictionSimpleDrawer = document.getElementById("restrictionSimpleDrawer")
	const restrictionSimpleCloseBtn = document.getElementById("restrictionSimpleCloseBtn")
	const restrictionSimpleOpenBtns = Array.from(
		document.querySelectorAll("[data-panel-restrictions-action]")
	)
	const restrictionStartDate = document.querySelector("[data-restriction-start-date]")
	const restrictionEndDate = document.querySelector("[data-restriction-end-date]")
	const restrictionRangeLabel = document.querySelector("[data-restriction-range-label]")
	const simpleRestrictionType = document.querySelector("[data-simple-restriction-type]")
	const simpleRestrictionValue = document.querySelector("[data-simple-restriction-value]")
	const simpleRestrictionValueRow = document.querySelector("[data-simple-restriction-value-row]")
	const simpleRestrictionImpact = document.querySelector("[data-simple-restriction-impact]")
	const rangePresetButtons = Array.from(document.querySelectorAll("[data-pricing-range-preset]"))
	const rangeCards = Array.from(document.querySelectorAll("[data-pricing-day-card]"))
	const appliedAidToggle = document.getElementById("pricingAppliedAidToggle")
	const extraCalendarMonths = Array.from(
		document.querySelectorAll('[data-pricing-extra-month="true"]')
	)
	const addMonthBtn = document.getElementById("pricingAddMonthBtn")
	const calendarViewFeedback = document.getElementById("pricingCalendarViewFeedback")
	const rangeConfig = JSON.parse(
		document.getElementById("pricingRangeData")?.dataset?.range || "{}"
	)
	const rangeDays = Array.isArray(rangeConfig.days) ? rangeConfig.days : []
	const operationalDays = Array.isArray(rangeConfig.operationalDays)
		? rangeConfig.operationalDays
		: []
	const selectedRatePlanId = String(rangeConfig.ratePlanId || "")
	const selectedRatePlanName = String(rangeConfig.ratePlanName || "")
	const selectedVariantId = String(rangeConfig.variantId || "")
	const selectedCurrency = String(rangeConfig.currency || "USD")
	const isProfessionalCalendar = Boolean(rangeConfig.isProfessional)
	const operationCopy = rangeConfig.copy || {}
	const ratePlans = Array.isArray(rangeConfig.ratePlans) ? rangeConfig.ratePlans : []
	const extensionOperations = Array.isArray(rangeConfig.extensionOperations)
		? rangeConfig.extensionOperations
		: []
	const extensionOpenButtons = Array.from(
		document.querySelectorAll("[data-pricing-open-extension]")
	)
	const extensionBackdrop = document.getElementById("pricingExtensionBackdrop")
	const extensionDrawer = document.getElementById("pricingExtensionDrawer")
	const extensionCloseBtn = document.getElementById("pricingExtensionCloseBtn")
	const extensionTitle = document.getElementById("pricingExtensionTitle")
	const extensionContext = document.getElementById("pricingExtensionContext")
	const extensionOrigin = document.getElementById("pricingExtensionOrigin")
	const extensionOperationType = document.getElementById("pricingExtensionOperationType")
	const extensionValueLabel = document.getElementById("pricingExtensionValueLabel")
	const extensionValue = document.getElementById("pricingExtensionValue")
	const extensionTargetInputs = Array.from(
		document.querySelectorAll("[data-pricing-extension-target]")
	)
	const extensionTargetHint = document.getElementById("pricingExtensionTargetHint")
	const extensionPreviewDays = document.getElementById("pricingExtensionPreviewDays")
	const extensionPriority = document.getElementById("pricingExtensionPriority")
	const extensionPreviewBtn = document.getElementById("pricingExtensionPreviewBtn")
	const extensionApplyBtn = document.getElementById("pricingExtensionApplyBtn")
	const extensionPreview = document.getElementById("pricingExtensionPreview")
	const extensionResult = document.getElementById("pricingExtensionResult")
	const extensionFeedback = document.getElementById("pricingExtensionFeedback")
	let rangeAnchor = null
	let selectedRange = null
	let selectedRangeDayFilter = null
	let rangePreviewPayload = null
	let rangePreviewDays = []
	let inventoryPreviewPayload = null
	let extensionPreviewPayload = null
	let appliedAidsVisible = false
	let availabilityDetailsVisible = false
	let activeOperationalDate = ""
	const allowedOperationalTabs = isProfessionalCalendar
		? ["price", "availability", "restrictions", "policies", "pro"]
		: ["price", "availability", "restrictions", "policies"]
	function normalizeOperationalTab(tab) {
		const next = String(tab || "price")
		if (["recurring", "bulk", "technical"].includes(next)) return "pro"
		return next
	}
	let activeOperationalTab = allowedOperationalTabs.includes(
		normalizeOperationalTab(rangeConfig.focus)
	)
		? normalizeOperationalTab(rangeConfig.focus)
		: "price"

	function setFeedback(message) {
		if (feedback) feedback.textContent = message
	}

	const calendarMutationEndpoints = {
		pricingPreview: "/api/pricing/rules/v2/bulk-preview",
		pricingApply: "/api/pricing/rules/v2/bulk-apply",
		pricingGenerate: "/api/pricing/rules/v2/generate-effective",
		inventoryPreview: "/api/inventory/bulk-preview",
		inventoryApply: "/api/inventory/bulk-apply",
		restrictionsSurface: "/api/rates/commercial-rules",
		policiesSurface: "/provider/policies",
	}

	function setInventoryFeedback(message) {
		if (panelInventoryFeedback) panelInventoryFeedback.textContent = message
	}

	function setInventoryApplyReady(ready) {
		if (panelInventoryApplyBtn instanceof HTMLButtonElement) {
			panelInventoryApplyBtn.disabled = !ready
			panelInventoryApplyBtn.textContent = ready ? "Guardar cupo" : "Revisa primero"
		}
	}

	function setRestrictionDrawerOpen(open) {
		restrictionSimpleDrawer?.classList.toggle("hidden", !open)
		restrictionSimpleBackdrop?.classList.toggle("hidden", !open)
		if (restrictionSimpleBackdrop)
			restrictionSimpleBackdrop.setAttribute("aria-hidden", open ? "false" : "true")
	}

	function syncRestrictionDrawerRange() {
		const from =
			selectedRange?.from || rangeConfig?.checkIn || new Date().toISOString().slice(0, 10)
		const to = selectedRange?.to || selectedRange?.from || from
		if (restrictionStartDate instanceof HTMLInputElement) restrictionStartDate.value = from
		if (restrictionEndDate instanceof HTMLInputElement) restrictionEndDate.value = to
		if (restrictionRangeLabel) restrictionRangeLabel.textContent = `Rango: ${from} a ${to}`
	}

	function syncSimpleRestrictionCopy() {
		const option = simpleRestrictionType?.selectedOptions?.[0]
		const type = String(simpleRestrictionType?.value || "stop_sell")
		const requiresValue = option?.dataset?.requiresValue === "true"
		if (simpleRestrictionValueRow)
			simpleRestrictionValueRow.classList.toggle("hidden", !requiresValue)
		if (simpleRestrictionValue instanceof HTMLInputElement) {
			simpleRestrictionValue.disabled = !requiresValue
			const defaultValue = option?.dataset?.defaultValue
			if (requiresValue && defaultValue && !simpleRestrictionValue.value) {
				simpleRestrictionValue.value = defaultValue
			}
		}
		if (!simpleRestrictionImpact) return
		const value =
			simpleRestrictionValue instanceof HTMLInputElement ? simpleRestrictionValue.value : ""
		const copy = {
			stop_sell: "Cerrará la venta de esta tarifa en el rango seleccionado.",
			min_los: `Exigirá al menos ${value || "N"} noches para vender esta tarifa.`,
			cta: "Bloqueará llegadas en las fechas seleccionadas.",
			ctd: "Bloqueará salidas en las fechas seleccionadas.",
			min_lead_time: `Exigirá reservar al menos ${value || "N"} días antes de la llegada.`,
		}
		simpleRestrictionImpact.textContent = copy[type] || "Afectará la vendibilidad del rango."
	}

	function operationalDayByDate(date) {
		return operationalDays.find((day) => String(day?.date ?? "") === String(date ?? "")) || null
	}

	function selectedOperationalRangeLabel(day) {
		if (selectedRange) return formatRangeLabel(selectedRange)
		return day ? `${day.weekday} ${day.day} · ${day.date}` : "Selecciona una fecha o rango"
	}

	function selectedOperationalScopeLabel(day) {
		const selectedDays = selectedRange ? getSelectedRangeDays() : day ? 1 : 0
		const scope = selectedRatePlanName || "la tarifa seleccionada"
		if (selectedRange && selectedDays > 1) return `${nightsLabel(selectedDays)} en ${scope}`
		if (selectedRange && selectedDays === 1) return `1 noche en ${scope}`
		return scope
	}

	function operationalSummaryForTab(day) {
		if (!day) return "Elige una fecha para operar precio, disponibilidad, venta y condiciones."
		const scopeLabel = selectedOperationalScopeLabel(day)
		const restrictionSummary = day.restrictionSummary || "Venta abierta para la fecha seleccionada"
		const conditionsSummary = day.conditionsSummary || "Condiciones de tarifa pendientes"
		const conditionsDetail = day.conditionsIncomplete
			? day.conditionsMissingSummary || "Contrato incompleto"
			: "Contrato completo"
		const summaryByTab = {
			price: `${scopeLabel} · Actual ${day.price} · Base ${day.basePrice}`,
			availability: `${day.availableUnits}/${day.totalUnits} cupos disponibles · Reservas ${day.bookedUnits} · Holds ${day.heldUnits}`,
			restrictions: `${day.statusLabel} · ${restrictionSummary}`,
			policies: `${conditionsSummary} · ${conditionsDetail}`,
			pro: `${scopeLabel} · Reglas de precio, reglas de venta e historial.`,
		}
		return summaryByTab[activeOperationalTab] || summaryByTab.price
	}

	function updateOperationalPanelHeader(day) {
		const title = document.querySelector("[data-operational-panel-title]")
		const summary = document.querySelector("[data-operational-panel-summary]")
		if (title) title.textContent = selectedOperationalRangeLabel(day)
		if (summary) summary.textContent = operationalSummaryForTab(day)
		if (manualPriceRangeLabel) {
			manualPriceRangeLabel.textContent = selectedOperationalRangeLabel(day)
		}
		if (inventoryRangeLabel) {
			inventoryRangeLabel.textContent = selectedOperationalRangeLabel(day)
		}
	}

	function syncConditionSignals() {
		const showConditionSignals = activeOperationalTab === "policies"
		document.querySelectorAll("[data-conditions-signal]").forEach((signal) => {
			signal.classList.toggle("hidden", !showConditionSignals)
		})
	}

	function syncPriceStatusSignals() {
		const showPriceStatusSignals = activeOperationalTab === "price"
		document.querySelectorAll("[data-price-status-signal]").forEach((signal) => {
			signal.classList.toggle("hidden", !showPriceStatusSignals)
		})
	}

	function syncPricePrimarySignals() {
		const showPricePrimarySignals = activeOperationalTab === "price"
		document.querySelectorAll("[data-price-primary-signal]").forEach((signal) => {
			signal.classList.toggle("hidden", !showPricePrimarySignals)
		})
	}

	function syncAvailabilityStatusSignals() {
		const showAvailabilityStatusSignals = activeOperationalTab === "availability"
		document.querySelectorAll("[data-availability-status-signal]").forEach((signal) => {
			signal.classList.toggle("hidden", !showAvailabilityStatusSignals)
		})
	}

	function syncAvailabilityDetailSignals() {
		const showAvailabilityDetails =
			activeOperationalTab === "availability" && availabilityDetailsVisible
		document.querySelectorAll("[data-availability-detail-signal]").forEach((signal) => {
			signal.classList.toggle("hidden", !showAvailabilityDetails)
		})
		if (inventoryPhysicalDetailToggle instanceof HTMLButtonElement) {
			inventoryPhysicalDetailToggle.setAttribute(
				"aria-pressed",
				availabilityDetailsVisible ? "true" : "false"
			)
			inventoryPhysicalDetailToggle.textContent = availabilityDetailsVisible
				? "Ocultar detalle físico"
				: "Mostrar detalle físico"
		}
	}

	function syncRestrictionStatusSignals() {
		const showRestrictionStatusSignals = activeOperationalTab === "restrictions"
		document.querySelectorAll("[data-restriction-status-signal]").forEach((signal) => {
			signal.classList.toggle("hidden", !showRestrictionStatusSignals)
		})
	}

	function setOperationalPanelTab(tab) {
		const nextTab = normalizeOperationalTab(tab)
		activeOperationalTab = allowedOperationalTabs.includes(nextTab) ? nextTab : "price"
		document.querySelectorAll("[data-operational-tab]").forEach((button) => {
			button.setAttribute(
				"data-active",
				button.getAttribute("data-operational-tab") === activeOperationalTab ? "true" : "false"
			)
		})
		document.querySelectorAll("[data-operational-panel-section]").forEach((section) => {
			section.classList.toggle(
				"hidden",
				section.getAttribute("data-operational-panel-section") !== activeOperationalTab
			)
		})
		syncPricePrimarySignals()
		syncPriceStatusSignals()
		syncAvailabilityStatusSignals()
		syncAvailabilityDetailSignals()
		syncRestrictionStatusSignals()
		syncConditionSignals()
		syncSelectedPricingDetails()
		updateOperationalPanelHeader(operationalDayByDate(activeOperationalDate))
	}

	function renderOperationalPanel(date) {
		const day = operationalDayByDate(date)
		const price = document.querySelector("[data-panel-price]")
		const basePrice = document.querySelector("[data-panel-base-price]")
		const availability = document.querySelector("[data-panel-availability]")
		const locks = document.querySelector("[data-panel-locks]")
		const policies = document.querySelector("[data-panel-policies]")
		const policiesMissing = document.querySelector("[data-panel-policies-missing]")
		const policiesAction = document.querySelector("[data-panel-policies-action]")
		if (!day) return

		activeOperationalDate = String(day.date || date || "")
		updateOperationalPanelHeader(day)
		if (price) price.textContent = day.price
		if (basePrice) basePrice.textContent = `Precio base: ${day.basePrice}`
		if (availability) {
			availability.textContent = `${day.availableUnits}/${day.totalUnits} cupos`
		}
		if (locks) locks.textContent = `Reservas: ${day.bookedUnits} · Holds: ${day.heldUnits}`
		if (policies) {
			policies.textContent = day.conditionsSummary || "Condiciones de tarifa pendientes."
		}
		if (policiesMissing) {
			policiesMissing.textContent = day.conditionsIncomplete
				? day.conditionsMissingSummary || "Esta tarifa todavía no tiene el contrato completo."
				: "Contrato completo para la tarifa seleccionada."
		}
		if (policiesAction) {
			policiesAction.textContent = day.conditionsIncomplete
				? "Resolver condiciones"
				: "Ver condiciones"
		}
		setOperationalPanelTab(activeOperationalTab)
	}

	document.querySelectorAll("[data-operational-tab]").forEach((button) => {
		button.addEventListener("click", () =>
			setOperationalPanelTab(button.getAttribute("data-operational-tab"))
		)
	})

	function syncSelectedPricingDetails() {
		rangeCards.forEach((card) => {
			const date = card.getAttribute("data-date")
			const isSelected = Boolean(date && isSelectedRangeDate(date))
			card.classList.toggle("pricing-date-selected", isSelected)
			card.querySelectorAll("[data-price-default-row]").forEach((row) => {
				row.classList.toggle("hidden", appliedAidsVisible && activeOperationalTab === "price")
			})
			card.querySelectorAll("[data-price-adjustment-row]").forEach((row) => {
				row.classList.toggle("hidden", !appliedAidsVisible || activeOperationalTab !== "price")
			})
			const adjustmentLine = card.querySelector("[data-pricing-applied-aid]")
			const adjustmentOutput = card.querySelector("[data-pricing-adjustment-output]")
			const canShowPriceAdjustment =
				card.getAttribute("data-is-past") !== "true" &&
				card.getAttribute("data-has-price") === "true"
			const hasAdjustment = Boolean(
				adjustmentOutput && String(adjustmentOutput.textContent ?? "").trim()
			)
			adjustmentLine?.classList.toggle(
				"hidden",
				!canShowPriceAdjustment ||
					!hasAdjustment ||
					!appliedAidsVisible ||
					activeOperationalTab !== "price"
			)
		})
	}

	function syncSelectionRequiredActions() {
		const hasSelection = Boolean(selectedRange)
		document.querySelectorAll("[data-selection-required-action]").forEach((action) => {
			action.classList.toggle("hidden", !hasSelection)
			action.classList.toggle("inline-flex", hasSelection)
		})
	}

	function setAppliedAidsVisible(isVisible) {
		appliedAidsVisible = Boolean(isVisible)
		syncSelectedPricingDetails()
		if (appliedAidToggle instanceof HTMLButtonElement) {
			appliedAidToggle.setAttribute("aria-pressed", appliedAidsVisible ? "true" : "false")
			appliedAidToggle.textContent = appliedAidsVisible ? "Ocultar ajustes" : "Mostrar ajustes"
		}
	}

	appliedAidToggle?.addEventListener("click", () => {
		setAppliedAidsVisible(!appliedAidsVisible)
	})
	inventoryPhysicalDetailToggle?.addEventListener("click", () => {
		availabilityDetailsVisible = !availabilityDetailsVisible
		syncAvailabilityDetailSignals()
	})

	addMonthBtn?.addEventListener("click", () => {
		const shouldShow = extraCalendarMonths.some((month) => month.classList.contains("hidden"))
		for (const month of extraCalendarMonths) {
			month.classList.toggle("hidden", !shouldShow)
		}
		if (addMonthBtn instanceof HTMLButtonElement) {
			addMonthBtn.textContent = shouldShow ? "Ocultar mes siguiente" : "Añadir mes siguiente"
		}
		if (calendarViewFeedback) {
			calendarViewFeedback.textContent = shouldShow
				? "Mes siguiente añadido sin recargar la página."
				: "Mostrando solo el mes inicial para mantener la vista limpia."
		}
		if (selectedRange) {
			updateCalendarRangeHighlight({
				cards: rangeCards,
				range: selectedRange,
				isSelectedDate: isSelectedRangeDate,
				selectedClassNames: ["ring-2", "ring-blue-500", "ring-offset-2", "pricing-date-selected"],
			})
			syncSelectedPricingDetails()
		}
	})

	function getExtensionOperationOption(value) {
		return (
			extensionOperations.find((option) => String(option.value) === String(value)) ||
			extensionOperations[0] || {
				value: "fixed_override",
				label: "Usar este precio final",
				help: "Define el precio final para las fechas seleccionadas.",
				valueLabel: "Precio final",
				defaultValue: 0,
				min: 0,
				step: "1",
			}
		)
	}

	function syncOperationControls(source = "range") {
		const rangeOption = getExtensionOperationOption(rangeOperationType?.value)
		if (rangeValueLabel) rangeValueLabel.textContent = rangeOption.valueLabel
		if (rangeValue instanceof HTMLInputElement) {
			rangeValue.step = rangeOption.step || "1"
			if (rangeOption.min == null) rangeValue.removeAttribute("min")
			else rangeValue.min = String(rangeOption.min)
			if (!rangeValue.value) rangeValue.value = String(rangeOption.defaultValue ?? "")
		}
		if (
			source === "range" &&
			(extensionOperationType instanceof HTMLSelectElement ||
				extensionOperationType instanceof HTMLInputElement)
		) {
			extensionOperationType.value = String(rangeOption.value)
		}
		const extensionOption = getExtensionOperationOption(extensionOperationType?.value)
		if (extensionValueLabel) extensionValueLabel.textContent = "Precio a copiar"
		if (extensionValue instanceof HTMLInputElement) {
			extensionValue.step = extensionOption.step || "1"
			if (extensionOption.min == null) extensionValue.removeAttribute("min")
			else extensionValue.min = String(extensionOption.min)
			if (!extensionValue.value) extensionValue.value = String(extensionOption.defaultValue ?? "")
		}
		rangePreviewPayload = null
		setApplyNeedsConfirmation(false)
		resetExtensionReview()
	}

	function renderOperationResult({ kind = "success", title, summary, details = [] }) {
		if (!operationResult) return
		const success = kind === "success"
		operationResult.className = [
			"rounded-lg border p-3 text-sm",
			success
				? "border-emerald-200 bg-emerald-50 text-emerald-950"
				: "border-amber-200 bg-amber-50 text-amber-950",
		].join(" ")
		operationResult.replaceChildren()
		const heading = document.createElement("p")
		heading.className = "font-semibold"
		heading.textContent = title
		operationResult.appendChild(heading)
		const body = document.createElement("p")
		body.className = "mt-1"
		body.textContent = summary
		operationResult.appendChild(body)
		if (details.length > 0) {
			const detailWrap = document.createElement("div")
			detailWrap.className = "mt-2 flex flex-wrap gap-1.5"
			for (const detail of details) {
				const chip = document.createElement("span")
				chip.className = success
					? "rounded-full bg-white/70 px-2 py-1 text-xs font-medium text-emerald-900"
					: "rounded-full bg-white/70 px-2 py-1 text-xs font-medium text-amber-900"
				chip.textContent = detail
				detailWrap.appendChild(chip)
			}
			operationResult.appendChild(detailWrap)
		}
		operationResult.classList.remove("hidden")
	}

	function buildRecoveryGuidance(error, stage = "") {
		const recovery = operationCopy.recovery || {}
		const text = `${stage} ${error}`.toLowerCase()
		if (text.includes("pricing_missing")) {
			return {
				title: "Ese plan necesita precio base",
				summary:
					"El cambio no se puede replicar porque el plan destino todavía no tiene un precio base listo.",
				action: "Configura o regenera el precio base de ese plan y vuelve a revisar la extensión.",
			}
		}
		if (text.includes("valid") || text.includes("required") || text.includes("missing")) {
			return recovery.validation || recovery.unknown
		}
		if (text.includes("coverage") || text.includes("material") || text.includes("recompute")) {
			return recovery.coverage || recovery.unknown
		}
		if (text.includes("network") || text.includes("timeout") || text.includes("fetch")) {
			return recovery.network || recovery.unknown
		}
		if (text.includes("apply") || text.includes("rule") || text.includes("insert")) {
			return recovery.apply || recovery.unknown
		}
		return (
			recovery.unknown || {
				title: "Necesita revisión",
				summary: "Este cambio no pudo completarse automáticamente.",
				action: "Revisa el diagnóstico y vuelve a intentar.",
			}
		)
	}

	function setCalendarHistoryOpen(isOpen) {
		calendarHistoryDrawer?.classList.toggle("hidden", !isOpen)
		calendarHistoryBackdrop?.classList.toggle("hidden", !isOpen)
		document.documentElement.classList.toggle("calendar-history-open", isOpen)
	}

	function setManualPriceDrawerOpen(isOpen) {
		manualPriceDrawer?.classList.toggle("hidden", !isOpen)
		manualPriceBackdrop?.classList.toggle("hidden", !isOpen)
		document.documentElement.classList.toggle("manual-price-drawer-open", isOpen)
		if (isOpen && rangeValue instanceof HTMLInputElement) {
			window.setTimeout(() => rangeValue.focus(), 150)
		}
	}

	function setInventoryPhysicalDrawerOpen(isOpen) {
		inventoryPhysicalDrawer?.classList.toggle("hidden", !isOpen)
		inventoryPhysicalBackdrop?.classList.toggle("hidden", !isOpen)
		document.documentElement.classList.toggle("inventory-physical-drawer-open", isOpen)
		if (isOpen && panelInventoryValue instanceof HTMLInputElement) {
			window.setTimeout(() => panelInventoryValue.focus(), 150)
		}
	}

	function inclusiveDays(from, to) {
		if (!from || !to) return null
		const start = new Date(`${from}T00:00:00`)
		const end = new Date(`${to}T00:00:00`)
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null
		return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
	}

	function formatMoneyLike(sample, value) {
		const rounded = Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 2)
		const text = String(sample || "").trim()
		const prefix = text.match(/^[^\d-]+/)?.[0]?.trim()
		const suffix = text.match(/[^\d\s]+$/)?.[0]?.trim()
		if (prefix) return `${prefix} ${rounded}`
		if (suffix && suffix !== prefix) return `${rounded} ${suffix}`
		return rounded
	}

	function updateSelectedPricingCells(value) {
		if (!selectedRange) return
		rangeCards.forEach((card) => {
			const date = card.getAttribute("data-date")
			if (!date || date < selectedRange.from || date > selectedRange.to) return
			updatePricingCardPrice(card, value)
		})
		flashAppliedRange({ cards: rangeCards, range: selectedRange })
	}

	function updatePricingCardPrice(card, value) {
		const output = card.querySelector("[data-pricing-output]")
		const finalCompareOutput = card.querySelector("[data-pricing-final-compare-output]")
		const nextText = formatMoneyLike(output?.textContent, value)
		const basePrice = Number(card.getAttribute("data-base-price"))
		const isPast = card.getAttribute("data-is-past") === "true"
		const adjustment = Number.isFinite(basePrice) ? Number(value) - basePrice : null
		card.setAttribute("data-current-price", String(value))
		card.setAttribute("data-has-price", "true")
		card.classList.remove("border-amber-200", "bg-amber-50")
		card.classList.add("border-emerald-200", "bg-emerald-50")
		if (output) output.textContent = nextText
		if (finalCompareOutput) finalCompareOutput.textContent = nextText
		if (isPast || adjustment == null) return
		const roundedAdjustment = Math.round(adjustment)
		let adjustmentLine = card.querySelector("[data-pricing-adjustment-line]")
		let adjustmentOutput = card.querySelector("[data-pricing-adjustment-output]")
		if (!adjustmentLine && roundedAdjustment !== 0) {
			adjustmentLine = document.createElement("span")
			adjustmentLine.setAttribute("data-pricing-adjustment-line", "")
			adjustmentLine.setAttribute("data-pricing-applied-aid", "")
			adjustmentLine.className =
				"rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 md:px-2 md:text-[11px]"
			adjustmentLine.classList.toggle("hidden", !appliedAidsVisible)
			adjustmentLine.append("Ajuste ")
			adjustmentOutput = document.createElement("span")
			adjustmentOutput.setAttribute("data-pricing-adjustment-output", "")
			adjustmentLine.appendChild(adjustmentOutput)
			card.querySelector("[data-pricing-signal-row]")?.appendChild(adjustmentLine)
		}
		if (adjustmentLine instanceof HTMLElement && adjustmentOutput) {
			adjustmentOutput.textContent = formatMoneyLike(output?.textContent, roundedAdjustment)
			adjustmentLine.classList.toggle(
				"hidden",
				isPast || roundedAdjustment === 0 || !appliedAidsVisible || activeOperationalTab !== "price"
			)
		}
	}

	function updateSelectedPricingCellsFromPreview(days) {
		if (!selectedRange || !Array.isArray(days) || days.length === 0) return false
		const byDate = new Map(days.map((day) => [String(day?.date), Number(day?.after)]))
		let changed = false
		rangeCards.forEach((card) => {
			const date = card.getAttribute("data-date")
			const value = byDate.get(String(date))
			if (!date || !Number.isFinite(value)) return
			updatePricingCardPrice(card, value)
			changed = true
		})
		if (changed) flashAppliedRange({ cards: rangeCards, range: selectedRange })
		return changed
	}

	function setApplyNeedsConfirmation(ready) {
		if (!(rangeApplyBtn instanceof HTMLButtonElement)) return
		rangeApplyBtn.textContent = ready
			? operationCopy.confirmAction || "Confirmar cambio"
			: operationCopy.applyAction || "Guardar cambio manual"
	}

	function setExtensionFeedback(message) {
		if (extensionFeedback) extensionFeedback.textContent = message
	}

	function getSelectedExtensionTargets() {
		return extensionTargetInputs
			.filter((input) => input instanceof HTMLInputElement && input.checked)
			.map((input) => String(input.value))
			.filter(Boolean)
	}

	function renderExtensionBox(target, { kind = "neutral", title, summary, chips = [] }) {
		if (!target) return
		const tone =
			kind === "success"
				? "border-emerald-200 bg-emerald-50 text-emerald-950"
				: kind === "warning"
					? "border-amber-200 bg-amber-50 text-amber-950"
					: "border-slate-200 bg-slate-50 text-slate-800"
		target.className = `rounded-lg border p-3 text-sm ${tone}`
		target.replaceChildren()
		const heading = document.createElement("p")
		heading.className = "font-semibold"
		heading.textContent = title
		target.appendChild(heading)
		const body = document.createElement("p")
		body.className = "mt-1"
		body.textContent = summary
		target.appendChild(body)
		if (chips.length > 0) {
			const wrap = document.createElement("div")
			wrap.className = "mt-2 flex flex-wrap gap-1.5"
			for (const chipText of chips) {
				const chip = document.createElement("span")
				chip.className = "rounded-full bg-white/80 px-2 py-1 text-xs font-medium"
				chip.textContent = chipText
				wrap.appendChild(chip)
			}
			target.appendChild(wrap)
		}
		target.classList.remove("hidden")
	}

	function resetExtensionReview() {
		extensionPreviewPayload = null
		extensionPreview?.classList.add("hidden")
		extensionResult?.classList.add("hidden")
		if (extensionApplyBtn instanceof HTMLButtonElement) {
			extensionApplyBtn.disabled = true
			extensionApplyBtn.textContent = "Revisa primero"
		}
	}

	function syncExtensionDrawer() {
		const current = (rangeValue instanceof HTMLInputElement && rangeValue.value) || ""
		const priceLabel = current
			? formatMoneyLike(`${selectedCurrency} 0`, current)
			: "el precio elegido"
		if (extensionTitle) {
			extensionTitle.textContent = `Copiar precio ${priceLabel} a estos planes`
		}
		if (extensionContext) {
			extensionContext.textContent = selectedRange
				? `${formatRangeLabel(selectedRange)} · ${nightsLabel(getSelectedRangeDays())}${selectedRangeDayFilter === "weekends" ? " de fines de semana" : ""}. Copia el precio del calendario sin crear una regla automática.`
				: "Selecciona un rango en el calendario para copiar ese precio a otros planes."
		}
		if (extensionOrigin) extensionOrigin.textContent = selectedRatePlanName || "Plan seleccionado"
		if (extensionValue instanceof HTMLInputElement) {
			extensionValue.value = current
		}
		if (
			extensionOperationType instanceof HTMLSelectElement &&
			rangeOperationType instanceof HTMLSelectElement
		) {
			extensionOperationType.value = rangeOperationType.value
		}
		syncOperationControls("range")
		if (extensionPreviewDays instanceof HTMLInputElement && selectedRange) {
			extensionPreviewDays.value = String(countInclusiveDays(selectedRange))
		}
		const availableTargetCount = extensionTargetInputs.filter(
			(input) => input instanceof HTMLInputElement && !input.disabled
		).length
		if (extensionTargetHint) {
			extensionTargetHint.textContent =
				availableTargetCount > 0
					? `Hay ${availableTargetCount} ${availableTargetCount === 1 ? "plan listo" : "planes listos"} para extender este cambio.`
					: "No hay otros planes con precio base listo para recibir este cambio."
		}
		const selectedTargets = getSelectedExtensionTargets().length
		setExtensionFeedback(
			selectedTargets > 0
				? `${selectedTargets} ${selectedTargets === 1 ? "plan seleccionado" : "planes seleccionados"}. Revisa el impacto antes de extender.`
				: availableTargetCount > 0
					? "Selecciona planes y revisa antes de guardar."
					: "Primero configura un precio base en otro plan para poder extender este cambio."
		)
		resetExtensionReview()
	}

	function setExtensionOpen(isOpen) {
		extensionDrawer?.classList.toggle("hidden", !isOpen)
		extensionBackdrop?.classList.toggle("hidden", !isOpen)
		document.documentElement.classList.toggle("pricing-extension-open", isOpen)
		if (isOpen) {
			syncExtensionDrawer()
			window.setTimeout(() => {
				if (extensionValue instanceof HTMLInputElement) extensionValue.focus()
			}, 80)
		}
	}

	function buildExtensionPayload() {
		if (!selectedRange || !selectedRatePlanId) {
			return { error: "Selecciona primero un rango en el calendario." }
		}
		const availableTargets = extensionTargetInputs.filter(
			(input) => input instanceof HTMLInputElement && !input.disabled
		).length
		if (availableTargets === 0) {
			return {
				error:
					"No hay planes listos para copiar este precio. Configura precio en otro plan y vuelve a intentarlo.",
			}
		}
		const targets = getSelectedExtensionTargets()
		if (!targets.length) return { error: "Elige al menos un plan para extender este cambio." }
		const value = Number(extensionValue?.value)
		const type = String(extensionOperationType?.value || "fixed_override")
		const option = getExtensionOperationOption(type)
		const min = Number(option.min)
		if (!Number.isFinite(value) || (Number.isFinite(min) && value < min)) {
			return { error: "Define un valor válido para extender este cambio." }
		}
		const days = countInclusiveDays(selectedRange)
		const selectedDays = getSelectedRangeDays()
		if (selectedDays <= 0) {
			return { error: "Selecciona fechas futuras disponibles para extender este cambio." }
		}
		const priority = Number(extensionPriority?.value)
		const previewDays = Number(extensionPreviewDays?.value)
		return {
			payload: {
				ratePlanIds: targets,
				operation: {
					type,
					value,
					conditions: {
						priority: Number.isFinite(priority) ? priority : 1000,
						dateFrom: selectedRange.from,
						dateTo: selectedRange.to,
						...(selectedRangeDayFilter === "weekends" ? { dayOfWeek: [0, 6] } : {}),
						previewFrom: selectedRange.from,
						previewDays: Number.isFinite(previewDays) ? previewDays : days,
						effectiveFrom: selectedRange.from,
						effectiveTo: addDays(selectedRange.to, 1),
						contextKey: "manual-extension",
					},
				},
				concurrency: 2,
			},
		}
	}

	function summarizeExtensionPreview(body) {
		const results = Array.isArray(body?.results) ? body.results : []
		const changedPlans = results.filter((row) => Number(row?.diff?.changedDays ?? 0) > 0).length
		const changedDays = results.reduce((acc, row) => acc + Number(row?.diff?.changedDays ?? 0), 0)
		const failures = Array.isArray(body?.failures) ? body.failures.length : 0
		return { changedPlans, changedDays, failures, total: results.length }
	}

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			const drawerWasOpen = Boolean(
				(manualPriceDrawer && !manualPriceDrawer.classList.contains("hidden")) ||
				(inventoryPhysicalDrawer && !inventoryPhysicalDrawer.classList.contains("hidden")) ||
				(calendarHistoryDrawer && !calendarHistoryDrawer.classList.contains("hidden"))
			)
			setCalendarHistoryOpen(false)
			setManualPriceDrawerOpen(false)
			setInventoryPhysicalDrawerOpen(false)
			if (drawerWasOpen) event.preventDefault()
		}
	})
	manualPriceOpenBtn?.addEventListener("click", () => {
		if (!selectedRange) {
			const fallbackDate =
				activeOperationalDate || initialFocusableCard?.getAttribute("data-date") || ""
			if (fallbackDate) {
				selectedRange = { from: fallbackDate, to: fallbackDate }
				rangeAnchor = null
				selectedRangeDayFilter = null
				renderRangeSelection()
			}
		}
		if (!selectedRange) {
			setFeedback("Selecciona una fecha o rango para cambiar el precio manualmente.")
			return
		}
		setManualPriceDrawerOpen(true)
	})
	manualPriceCloseBtn?.addEventListener("click", () => setManualPriceDrawerOpen(false))
	manualPriceBackdrop?.addEventListener("click", () => setManualPriceDrawerOpen(false))
	inventoryPhysicalOpenBtn?.addEventListener("click", () => {
		if (!selectedRange) {
			const fallbackDate =
				activeOperationalDate || initialFocusableCard?.getAttribute("data-date") || ""
			if (fallbackDate) {
				selectedRange = { from: fallbackDate, to: fallbackDate }
				rangeAnchor = null
				selectedRangeDayFilter = null
				renderRangeSelection()
			}
		}
		if (!selectedRange) {
			setFeedback("Selecciona una fecha o rango para cambiar el cupo.")
			return
		}
		setInventoryPhysicalDrawerOpen(true)
	})
	inventoryPhysicalCloseBtn?.addEventListener("click", () => setInventoryPhysicalDrawerOpen(false))
	inventoryPhysicalBackdrop?.addEventListener("click", () => setInventoryPhysicalDrawerOpen(false))
	calendarHistoryOpenBtn?.addEventListener("click", () => setCalendarHistoryOpen(true))
	calendarHistoryCloseBtn?.addEventListener("click", () => setCalendarHistoryOpen(false))
	calendarHistoryBackdrop?.addEventListener("click", () => setCalendarHistoryOpen(false))

	extensionOpenButtons.forEach((button) => {
		button.addEventListener("click", (event) => {
			event.preventDefault()
			if (!selectedRange) {
				setFeedback("Selecciona primero una fecha o rango para extender el cambio.")
				return
			}
			setExtensionOpen(true)
		})
	})
	extensionCloseBtn?.addEventListener("click", () => setExtensionOpen(false))
	extensionBackdrop?.addEventListener("click", () => setExtensionOpen(false))
	extensionTargetInputs.forEach((input) =>
		input.addEventListener("change", () => {
			const count = getSelectedExtensionTargets().length
			setExtensionFeedback(
				count > 0
					? `${count} ${count === 1 ? "plan seleccionado" : "planes seleccionados"}. Revisa antes de guardar.`
					: "Selecciona planes y revisa antes de guardar."
			)
			resetExtensionReview()
		})
	)
	rangeOperationType?.addEventListener("change", () => {
		const option = getExtensionOperationOption(rangeOperationType?.value)
		if (rangeValue instanceof HTMLInputElement) rangeValue.value = String(option.defaultValue ?? "")
		syncOperationControls("range")
		if (selectedRange) renderRangeSelection()
	})
	rangeValue?.addEventListener("input", () => {
		rangePreviewPayload = null
		rangePreviewDays = []
		setApplyNeedsConfirmation(false)
		resetExtensionReview()
	})
	panelInventoryValue?.addEventListener("input", () => {
		inventoryPreviewPayload = null
		setInventoryApplyReady(false)
		setInventoryFeedback("Revisa el impacto de inventario antes de guardar.")
	})
	restrictionSimpleOpenBtns.forEach((restrictionSimpleOpenBtn) =>
		restrictionSimpleOpenBtn.addEventListener("click", () => {
			if (!selectedRange) {
				setFeedback("Selecciona una fecha o rango para crear una regla de venta.")
				return
			}
			syncRestrictionDrawerRange()
			syncSimpleRestrictionCopy()
			setRestrictionDrawerOpen(true)
		})
	)
	restrictionSimpleCloseBtn?.addEventListener("click", () => setRestrictionDrawerOpen(false))
	restrictionSimpleBackdrop?.addEventListener("click", () => setRestrictionDrawerOpen(false))
	simpleRestrictionType?.addEventListener("change", syncSimpleRestrictionCopy)
	simpleRestrictionValue?.addEventListener("input", syncSimpleRestrictionCopy)
	panelInventoryPreviewBtn?.addEventListener("click", async () => {
		const payload = buildInventoryRangePayload()
		if (!payload) {
			setInventoryFeedback("Selecciona rango y define un cupo físico válido.")
			return
		}
		setInventoryFeedback("Revisando impacto de inventario...")
		if (panelInventoryPreviewBtn instanceof HTMLButtonElement) {
			panelInventoryPreviewBtn.disabled = true
		}
		const response = await fetch(calendarMutationEndpoints.inventoryPreview, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})
		const body = await response.json().catch(() => ({}))
		if (panelInventoryPreviewBtn instanceof HTMLButtonElement) {
			panelInventoryPreviewBtn.disabled = false
		}
		if (!response.ok) {
			setInventoryFeedback(`No se pudo revisar cupo: ${String(body?.error ?? response.status)}`)
			inventoryPreviewPayload = null
			setInventoryApplyReady(false)
			return
		}
		const changedDays = Number(
			body?.diff?.changedDays ?? body?.summary?.changedDays ?? getSelectedRangeDays()
		)
		inventoryPreviewPayload = {
			...payload,
			context: {
				...payload.context,
				dryRun: false,
			},
		}
		setInventoryApplyReady(true)
		setInventoryFeedback(
			`Revisión lista: ${nightsLabel(changedDays)} con cupo físico revisado desde Inventario.`
		)
	})
	panelInventoryApplyBtn?.addEventListener("click", async () => {
		if (!inventoryPreviewPayload) {
			setInventoryFeedback("Primero revisa el cupo.")
			return
		}
		setInventoryFeedback("Guardando cupo en Inventario...")
		if (panelInventoryApplyBtn instanceof HTMLButtonElement) {
			panelInventoryApplyBtn.disabled = true
		}
		const response = await fetch(calendarMutationEndpoints.inventoryApply, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(inventoryPreviewPayload),
		})
		const body = await response.json().catch(() => ({}))
		if (!response.ok) {
			setInventoryFeedback(`No se pudo guardar cupo: ${String(body?.error ?? response.status)}`)
			setInventoryApplyReady(true)
			return
		}
		const success = Number(
			body?.summary?.successfulDays ?? body?.summary?.changedDays ?? getSelectedRangeDays()
		)
		setInventoryFeedback(`Cupo guardado en Inventario: ${success} cambios aplicados.`)
		inventoryPreviewPayload = null
		setInventoryApplyReady(false)
		window.setTimeout(() => window.location.reload(), 550)
	})
	extensionOperationType?.addEventListener("change", () => {
		const option = getExtensionOperationOption(extensionOperationType?.value)
		if (extensionValue instanceof HTMLInputElement) {
			extensionValue.value = String(option.defaultValue ?? "")
		}
		syncOperationControls("extension")
	})
	extensionValue?.addEventListener("input", () => {
		resetExtensionReview()
	})
	extensionPriority?.addEventListener("input", resetExtensionReview)
	extensionPreviewDays?.addEventListener("input", resetExtensionReview)

	extensionPreviewBtn?.addEventListener("click", async () => {
		const built = buildExtensionPayload()
		if (built.error) {
			setExtensionFeedback(built.error)
			return
		}
		setExtensionFeedback("Revisando extensión...")
		if (extensionPreviewBtn instanceof HTMLButtonElement) extensionPreviewBtn.disabled = true
		const response = await fetch(calendarMutationEndpoints.pricingPreview, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(built.payload),
		})
		const body = await response.json().catch(() => ({}))
		if (extensionPreviewBtn instanceof HTMLButtonElement) extensionPreviewBtn.disabled = false
		if (!response.ok) {
			const error = String(body?.error ?? response.status)
			const guidance = buildRecoveryGuidance(error, "preview-extension")
			renderExtensionBox(extensionPreview, {
				kind: "warning",
				title: guidance.title,
				summary: `${guidance.summary} ${guidance.action}`,
				chips: [`${operationCopy.technicalDetail || "Diagnóstico"}: ${error}`],
			})
			setExtensionFeedback("La extensión necesita revisión antes de continuar.")
			return
		}
		const summary = summarizeExtensionPreview(body)
		const canApply = summary.changedPlans > 0
		extensionPreviewPayload = canApply ? built.payload : null
		renderExtensionBox(extensionPreview, {
			kind: canApply ? "neutral" : "warning",
			title: canApply
				? operationCopy.reviewReady || "Revisión lista"
				: operationCopy.extension?.noApplicableTitle ||
					operationCopy.resultNeedsReview ||
					"Aplicación con revisión",
			summary: canApply
				? `El cambio se extenderá a ${summary.changedPlans} planes y ${nightsLabel(summary.changedDays)} con impacto.`
				: operationCopy.extension?.noApplicableSummary ||
					"No encontramos planes con precio base listo para recibir este cambio. Revisa el detalle del plan destino.",
			chips: [
				formatRangeLabel(selectedRange),
				`${getSelectedExtensionTargets().length} planes elegidos`,
				...(summary.failures > 0 ? [`${summary.failures} por revisar`] : []),
			],
		})
		if (extensionApplyBtn instanceof HTMLButtonElement) extensionApplyBtn.disabled = !canApply
		if (extensionApplyBtn instanceof HTMLButtonElement) {
			extensionApplyBtn.textContent = canApply ? "Extender cambio" : "Sin impacto aplicable"
		}
		setExtensionFeedback(
			canApply
				? "Revisión lista. Si el impacto tiene sentido, extiende el cambio."
				: "La extensión necesita revisión antes de guardar."
		)
	})

	extensionApplyBtn?.addEventListener("click", async () => {
		const payload = extensionPreviewPayload
		if (!payload) {
			setExtensionFeedback("Primero revisa la extensión.")
			return
		}
		setExtensionFeedback("Extendiendo cambio...")
		if (extensionApplyBtn instanceof HTMLButtonElement) extensionApplyBtn.disabled = true
		if (extensionApplyBtn instanceof HTMLButtonElement)
			extensionApplyBtn.textContent = "Extendiendo..."
		const response = await fetch(calendarMutationEndpoints.pricingApply, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})
		const body = await response.json().catch(() => ({}))
		if (!response.ok) {
			const error = String(body?.error ?? response.status)
			const guidance = buildRecoveryGuidance(error, "apply-extension")
			renderExtensionBox(extensionResult, {
				kind: "warning",
				title: guidance.title,
				summary: `${guidance.summary} ${guidance.action}`,
				chips: [`${operationCopy.technicalDetail || "Diagnóstico"}: ${error}`],
			})
			setExtensionFeedback("No se pudo completar la extensión.")
			return
		}
		const success = Number(body?.summary?.success ?? 0)
		const failed = Number(body?.summary?.failed ?? 0)
		renderExtensionBox(extensionResult, {
			kind: failed > 0 ? "warning" : "success",
			title:
				failed > 0
					? operationCopy.resultNeedsReview || "Aplicación con revisión"
					: "Cambio extendido",
			summary:
				failed > 0
					? `Se extendió parcialmente: ${success} OK y ${failed} por revisar.`
					: `El cambio quedó extendido a ${success} planes.`,
			chips: [
				formatRangeLabel(selectedRange),
				`${success} guardados`,
				...(failed > 0 ? [`${failed} por revisar`] : []),
			],
		})
		setExtensionFeedback("Extensión guardada. Puedes seguir operando el calendario.")
		extensionPreviewPayload = null
		if (extensionApplyBtn instanceof HTMLButtonElement) {
			extensionApplyBtn.disabled = true
			extensionApplyBtn.textContent = "Extendido"
		}
	})

	function setSheetExpanded(isExpanded) {
		rangePanel?.setAttribute("data-sheet-state", isExpanded ? "expanded" : "compact")
	}

	function getSelectedRangeDays() {
		if (!selectedRange) return 0
		return rangeDays.filter((day) => isSelectedRangeDate(String(day.date ?? ""))).length
	}

	function nightsLabel(days) {
		return `${days} ${days === 1 ? "noche" : "noches"}`
	}

	function isWeekendDate(date) {
		const parsed = new Date(`${date}T00:00:00.000Z`)
		if (Number.isNaN(parsed.getTime())) return false
		const day = parsed.getUTCDay()
		return day === 0 || day === 6
	}

	function isSelectedRangeDate(date) {
		if (!selectedRange || !date) return false
		const inRange = date >= selectedRange.from && date <= selectedRange.to
		if (!inRange) return false
		if (selectedRangeDayFilter === "weekends") return isWeekendDate(date)
		return true
	}

	function summarizeSelectedRangeDays() {
		const selected = rangeDays.filter((day) => isSelectedRangeDate(String(day.date ?? "")))
		return {
			missing: selected.filter((day) => day.status === "missing").length,
			adjusted: selected.filter((day) => Number(day.ruleAdjustment ?? 0) !== 0).length,
			restricted: selected.filter((day) => Number(day.restrictionCount ?? 0) > 0).length,
		}
	}

	function syncRangeValueFromSingleDate(date) {
		if (!date || !(rangeValue instanceof HTMLInputElement)) return
		if (String(rangeOperationType?.value || "fixed_override") !== "fixed_override") return
		const days = getSelectedRangeDays()
		if (days !== 1) return
		const card = rangeCards.find((item) => item.getAttribute("data-date") === date)
		const current = card?.getAttribute("data-current-price") || ""
		rangeValue.value = current
	}

	function buildPricingRangePayload() {
		if (!selectedRange || !selectedRatePlanId) return null
		const value = Number(rangeValue?.value)
		const type = String(rangeOperationType?.value || "fixed_override")
		const option = getExtensionOperationOption(type)
		const min = Number(option.min)
		if (!Number.isFinite(value) || (Number.isFinite(min) && value < min)) return null
		const days = countInclusiveDays(selectedRange)
		const selectedDays = getSelectedRangeDays()
		if (selectedDays <= 0) return null
		return {
			ratePlanIds: [selectedRatePlanId],
			operation: {
				type,
				value,
				conditions: {
					priority: 1000,
					dateFrom: selectedRange.from,
					dateTo: selectedRange.to,
					...(selectedRangeDayFilter === "weekends" ? { dayOfWeek: [0, 6] } : {}),
					previewFrom: selectedRange.from,
					previewDays: days,
					effectiveFrom: selectedRange.from,
					effectiveTo: addDays(selectedRange.to, 1),
					contextKey: "manual",
				},
			},
			concurrency: 1,
		}
	}

	function buildInventoryRangePayload() {
		if (!selectedRange || !selectedVariantId) return null
		const value = Number(panelInventoryValue?.value)
		if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return null
		const selectedDays = getSelectedRangeDays()
		if (selectedDays <= 0) return null
		return {
			selection: {
				variantIds: [selectedVariantId],
			},
			dateRange: {
				from: selectedRange.from,
				to: addDays(selectedRange.to, 1),
			},
			filters: {
				...(selectedRangeDayFilter === "weekends" ? { daysOfWeek: ["SUN", "SAT"] } : {}),
			},
			operation: {
				type: "SET_INVENTORY",
				value,
			},
			context: {
				dryRun: true,
				source: "rates_calendar_availability_tab",
			},
		}
	}

	function renderRangeSelection() {
		if (!selectedRange) return
		const days = getSelectedRangeDays()
		const summary = summarizeSelectedRangeDays()
		const scopeLabel = selectedRangeDayFilter === "weekends" ? "fines de semana" : "fechas"
		if (rangePreview) {
			rangePreview.textContent = `${nightsLabel(days)} seleccionadas · ${summary.missing} sin precio · ${summary.adjusted} con ajuste manual · ${summary.restricted} con reglas de venta.`
		}
		rangePreviewPayload = null
		rangePreviewDays = []
		inventoryPreviewPayload = null
		setInventoryApplyReady(false)
		setApplyNeedsConfirmation(false)
		updateCalendarRangeHighlight({
			cards: rangeCards,
			range: selectedRange,
			isSelectedDate: isSelectedRangeDate,
			selectedClassNames: ["ring-2", "ring-blue-500", "ring-offset-2", "pricing-date-selected"],
		})
		syncSelectedPricingDetails()
		syncSelectionRequiredActions()
		syncRangeValueFromSingleDate(selectedRange.from)
		syncRestrictionDrawerRange()
		renderOperationalPanel(selectedRange.from)
		if (extensionDrawer && !extensionDrawer.classList.contains("hidden")) syncExtensionDrawer()
	}

	function clearRangeSelection() {
		selectedRange = null
		rangeAnchor = null
		selectedRangeDayFilter = null
		rangePreviewPayload = null
		rangePreviewDays = []
		setManualPriceDrawerOpen(false)
		setInventoryPhysicalDrawerOpen(false)
		setSheetExpanded(false)
		setApplyNeedsConfirmation(false)
		updateCalendarRangeHighlight({ cards: rangeCards, range: null })
		syncSelectedPricingDetails()
		syncSelectionRequiredActions()
		setExtensionOpen(false)
	}

	function selectPricingDate(date) {
		if (!date) return
		selectedRangeDayFilter = null
		if (!rangeAnchor && selectedRange && selectedRange.from !== selectedRange.to) {
			selectedRange = normalizeCalendarRange(selectedRange.from, date)
		} else if (!rangeAnchor) {
			rangeAnchor = date
			selectedRange = { from: date, to: date }
		} else {
			selectedRange = normalizeCalendarRange(rangeAnchor, date)
			rangeAnchor = null
		}
		renderRangeSelection()
	}

	rangeCards.forEach((card) => {
		card.addEventListener("click", (event) => {
			if (card.getAttribute("tabindex") !== "0") return
			if (event.target?.closest?.("a,button,input,select,textarea")) return
			selectPricingDate(card.getAttribute("data-date"))
		})
		card.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return
			event.preventDefault()
			selectPricingDate(card.getAttribute("data-date"))
		})
	})

	const initialFocusableCard = rangeCards.find((card) => card.getAttribute("tabindex") === "0")
	renderOperationalPanel(initialFocusableCard?.getAttribute("data-date"))
	if (rangeConfig.focus && initialFocusableCard) {
		selectPricingDate(initialFocusableCard.getAttribute("data-date"))
		setOperationalPanelTab(activeOperationalTab)
		if (activeOperationalTab === "restrictions") {
			window.setTimeout(() => {
				syncRestrictionDrawerRange()
				syncSimpleRestrictionCopy()
				setRestrictionDrawerOpen(true)
			}, 150)
		}
	}

	rangePresetButtons.forEach((button) => {
		button.addEventListener("click", () => {
			const preset = button.getAttribute("data-pricing-range-preset")
			const nextRange = selectCalendarRangePreset(preset, rangeDays)
			if (!nextRange) {
				setFeedback("Ese preset no tiene fechas visibles en esta vista.")
				return
			}
			selectedRange = nextRange
			rangeAnchor = null
			selectedRangeDayFilter = preset === "visible_weekend" ? "weekends" : null
			renderRangeSelection()
		})
	})

	rangeClearBtn?.addEventListener("click", clearRangeSelection)
	document.addEventListener("keydown", (event) => {
		if (event.defaultPrevented) return
		if (event.key !== "Escape" || !selectedRange) return
		const manualDrawerOpen = manualPriceDrawer && !manualPriceDrawer.classList.contains("hidden")
		const historyOpen = calendarHistoryDrawer && !calendarHistoryDrawer.classList.contains("hidden")
		if (manualDrawerOpen || historyOpen) return
		clearRangeSelection()
	})

	rangePreviewBtn?.addEventListener("click", async () => {
		const payload = buildPricingRangePayload()
		if (!payload) {
			setFeedback("Selecciona rango y precio valido.")
			return
		}
		setFeedback(operationCopy.reviewingAction || "Revisando impacto...")
		const response = await fetch(calendarMutationEndpoints.pricingPreview, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})
		const body = await response.json().catch(() => ({}))
		if (!response.ok) {
			const error = String(body?.error ?? response.status)
			const guidance = buildRecoveryGuidance(error, "preview-range")
			setFeedback(`No se pudo revisar: ${error}`)
			renderOperationResult({
				kind: "warning",
				title: guidance.title,
				summary: `${guidance.summary} ${guidance.action}`,
				details: [
					formatRangeLabel(selectedRange),
					`${operationCopy.technicalDetail || "Diagnóstico"}: ${error}`,
				],
			})
			return
		}
		const first = Array.isArray(body?.results) ? body.results[0] : null
		const previewDays = Array.isArray(first?.preview?.days) ? first.preview.days : []
		rangePreviewDays = previewDays
		const changedFromDays = previewDays.filter((day) => Number(day?.delta ?? 0) !== 0).length
		const changed = Number(changedFromDays > 0 ? changedFromDays : (first?.diff?.changedDays ?? 0))
		const avg = Number(first?.preview?.priceSummary?.after?.avg ?? payload.operation.value)
		if (rangePreview) {
			rangePreview.textContent = `${operationCopy.reviewReady || "Revisión lista"}: ${nightsLabel(changed)} con cambio · precio final promedio ${avg.toFixed(0)}.`
		}
		rangePreviewPayload = payload
		setApplyNeedsConfirmation(true)
		setFeedback("Revisión lista. Confirma para aplicar el cambio.")
	})

	rangeApplyBtn?.addEventListener("click", async () => {
		const payload = rangePreviewPayload ?? buildPricingRangePayload()
		if (!payload) {
			setFeedback("Selecciona rango y precio valido.")
			return
		}
		if (!rangePreviewPayload) {
			setFeedback(operationCopy.reviewingAction || "Revisando impacto...")
			const previewResponse = await fetch(calendarMutationEndpoints.pricingPreview, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			})
			const previewBody = await previewResponse.json().catch(() => ({}))
			if (!previewResponse.ok) {
				const error = String(previewBody?.error ?? previewResponse.status)
				const guidance = buildRecoveryGuidance(error, "preview-range")
				setFeedback(`No se pudo revisar: ${error}`)
				renderOperationResult({
					kind: "warning",
					title: guidance.title,
					summary: `${guidance.summary} ${guidance.action}`,
					details: [
						formatRangeLabel(selectedRange),
						`${operationCopy.technicalDetail || "Diagnóstico"}: ${error}`,
					],
				})
				return
			}
			const first = Array.isArray(previewBody?.results) ? previewBody.results[0] : null
			const previewDays = Array.isArray(first?.preview?.days) ? first.preview.days : []
			rangePreviewDays = previewDays
			const changedFromDays = previewDays.filter((day) => Number(day?.delta ?? 0) !== 0).length
			const changed = Number(
				changedFromDays > 0 ? changedFromDays : (first?.diff?.changedDays ?? 0)
			)
			if (rangePreview) {
				rangePreview.textContent = `${operationCopy.reviewReady || "Revisión lista"}: ${nightsLabel(changed)} con cambio · confirma nuevamente para aplicar.`
			}
			rangePreviewPayload = payload
			setApplyNeedsConfirmation(true)
			setFeedback(
				"Revisión lista. Revisa el impacto y vuelve a tocar Guardar cambio manual para confirmar."
			)
			return
		}
		setFeedback(operationCopy.applyingAction || "Aplicando cambio...")
		if (rangeApplyBtn instanceof HTMLButtonElement) rangeApplyBtn.disabled = true
		const response = await fetch(calendarMutationEndpoints.pricingApply, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(rangePreviewPayload),
		})
		const body = await response.json().catch(() => ({}))
		if (!response.ok) {
			const error = String(body?.error ?? response.status)
			const guidance = buildRecoveryGuidance(error, "apply-range")
			setFeedback(`No se pudo aplicar: ${error}`)
			renderOperationResult({
				kind: "warning",
				title: guidance.title,
				summary: `${guidance.summary} ${guidance.action}`,
				details: [
					formatRangeLabel(selectedRange),
					`${operationCopy.technicalDetail || "Diagnóstico"}: ${error}`,
				],
			})
			if (rangeApplyBtn instanceof HTMLButtonElement) rangeApplyBtn.disabled = false
			return
		}
		const applied = Number(body?.summary?.success ?? 0)
		const failed = Number(body?.summary?.failed ?? 0)
		setFeedback(`Cambio manual guardado. Cambios guardados: ${applied}. Puedes seguir operando.`)
		renderOperationResult({
			kind: failed > 0 ? "warning" : "success",
			title:
				failed > 0
					? operationCopy.resultNeedsReview || "Aplicación con revisión"
					: operationCopy.resultReady || "Cambio aplicado",
			summary:
				failed > 0
					? `Se aplicó parcialmente: ${applied} OK y ${failed} por revisar.`
					: `Se aplicó el cambio en ${nightsLabel(getSelectedRangeDays())}.`,
			details: [
				formatRangeLabel(selectedRange),
				`${applied} cambios guardados`,
				...(failed > 0 ? [`${failed} por revisar`] : []),
			],
		})
		if (rangePreviewPayload.operation.type === "fixed_override") {
			updateSelectedPricingCells(rangePreviewPayload.operation.value)
		} else if (!updateSelectedPricingCellsFromPreview(rangePreviewDays)) {
			setFeedback("Cambio guardado. Actualizando calendario...")
			window.location.reload()
			return
		}
		if (rangeApplyBtn instanceof HTMLButtonElement) rangeApplyBtn.disabled = false
		rangePreviewPayload = null
		rangePreviewDays = []
		setApplyNeedsConfirmation(false)
	})

	rangeGenerateBtn?.addEventListener("click", async () => {
		if (!selectedRange || !selectedRatePlanId) {
			setFeedback("Selecciona un rango para regenerar cobertura.")
			return
		}
		setFeedback("Regenerando cobertura del rango...")
		const response = await fetch(calendarMutationEndpoints.pricingGenerate, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				ratePlanId: selectedRatePlanId,
				from: selectedRange.from,
				to: addDays(selectedRange.to, 1),
			}),
		})
		const body = await response.json().catch(() => ({}))
		if (!response.ok) {
			setFeedback(`No se pudo regenerar: ${String(body?.error ?? response.status)}`)
			return
		}
		setFeedback("Cobertura regenerada. Actualizando calendario...")
		window.location.reload()
	})

	generateBtn?.addEventListener("click", async () => {
		const ratePlanId = generateBtn.getAttribute("data-rate-plan-id")
		if (!ratePlanId) return
		setFeedback("Regenerando cobertura del mes...")
		const response = await fetch(calendarMutationEndpoints.pricingGenerate, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				ratePlanId,
				from: generateBtn.getAttribute("data-from"),
				to: generateBtn.getAttribute("data-to"),
			}),
		})
		if (!response.ok) {
			const body = await response.json().catch(() => ({}))
			setFeedback(`No se pudo regenerar: ${String(body?.error ?? response.status)}`)
			return
		}
		setFeedback("Cobertura regenerada. Actualizando calendario...")
		window.location.reload()
	})

	syncOperationControls("range")
}
