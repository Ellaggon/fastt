/** @jsxRuntime classic */
import React, { startTransition, useEffect, useMemo, useState } from "react"

import CalendarResponsiveDrawer from "@/components/rates/CalendarResponsiveDrawer"
import {
	Badge,
	Button,
	Card,
	ChoiceCard,
	IconButton,
	Input,
	Notice,
	SegmentedControl,
	SegmentedItem,
	Select,
} from "@/components/ui-react"
import {
	CALENDAR_CONTROL_MODES,
	type CalendarControlMode,
	visibleCalendarActions,
} from "@/lib/rates/calendarControlCatalog"
import type { SingleCalendarDay, SingleCalendarSurface } from "@/lib/rates/singleCalendarSurface"

type Props = {
	initialSurface: SingleCalendarSurface
	isProfessional: boolean
	initialMode?: CalendarControlMode
	guidedAvailability?: {
		playbook: "add-room" | "launch" | null
		productName: string
		variantName: string
		ratePlanName: string
		requiredDays: number
		initialInventoryDays: number
	}
}

type DrawerAction = "manual_price" | "inventory_units" | "stop_sell" | "min_los" | null

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
const RANGE_PRESETS = [
	["visible_weekend", "Fin de semana"],
	["visible_month", "Vista visible"],
	["next_7", "Prox. 7 días"],
	["next_30", "Prox. 30 días"],
] as const

function localIsoDate() {
	const date = new Date()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${date.getFullYear()}-${month}-${day}`
}

function addDays(value: string, days: number) {
	const date = new Date(`${value}T12:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

function formatDate(value: string, weekday = false) {
	if (!value) return "Sin fecha"
	return new Intl.DateTimeFormat("es-BO", {
		...(weekday ? { weekday: "short" as const } : {}),
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	})
		.format(new Date(`${value}T12:00:00.000Z`))
		.replaceAll(".", "")
		.toLowerCase()
}

function formatRange(from: string, to: string, weekday = false) {
	return !to || from === to
		? formatDate(from, weekday)
		: `${formatDate(from, weekday)} → ${formatDate(to, weekday)}`
}

function monthLabel(value: string) {
	const label = new Intl.DateTimeFormat("es-BO", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${value}-01T12:00:00.000Z`))
	return `${label.charAt(0).toUpperCase()}${label.slice(1)}`
}

function money(value: number | null, currency: string) {
	return value == null ? "Sin precio" : `${currency} ${Number(value).toFixed(0)}`
}

function cellPresentation(
	mode: CalendarControlMode,
	day: SingleCalendarDay,
	showComparison: boolean,
	showInventoryDetail: boolean
) {
	if (day.isPast) return { primary: "", secondary: "", tone: "past" }
	if (mode === "availability") {
		return {
			primary: `${day.availableUnits}/${day.totalUnits} cupos`,
			secondary: showInventoryDetail
				? `${day.bookedUnits} reservados · ${day.heldUnits} retenidos`
				: day.availableUnits > 0
					? "Disponible"
					: "Sin cupo",
			tone: day.availableUnits > 0 ? "neutral" : "warning",
		}
	}
	if (mode === "sellability") {
		return {
			primary: day.restrictionSignals.hasCommercialBlocker
				? "Venta cerrada"
				: day.restrictionSignals.count > 0
					? "Con reglas"
					: "Venta abierta",
			secondary: day.restrictionSignals.summary || "Sin restricciones",
			tone: day.restrictionSignals.hasCommercialBlocker
				? "danger"
				: day.restrictionSignals.count > 0
					? "info"
					: "neutral",
		}
	}
	if (mode === "conditions") {
		return {
			primary: "",
			secondary: "",
			tone: "neutral",
		}
	}
	return {
		primary: money(day.finalPrice, day.currency),
		secondary:
			showComparison && day.finalPrice != null
				? `Base ${money(day.baseComponent, day.currency)}`
				: day.finalPrice == null
					? ""
					: day.ruleAdjustment
						? `Ajuste ${day.ruleAdjustment > 0 ? "+" : ""}${day.ruleAdjustment}`
						: "Precio final",
		tone: day.finalPrice == null ? "warning" : "neutral",
	}
}

function toneClass(tone: string) {
	const tones: Record<string, string> = {
		past: "border-slate-100 bg-slate-50/50 text-slate-300",
		neutral: "border-slate-200 bg-white text-slate-950",
		warning: "border-slate-200 border-l-2 border-l-amber-400 bg-white text-slate-950",
		danger: "border-red-300 bg-red-50 text-red-950",
		info: "border-sky-300 bg-sky-50 text-sky-950",
	}
	return tones[tone] || tones.neutral
}

function actionTitle(action: DrawerAction) {
	if (action === "manual_price") return "Cambiar precio"
	if (action === "inventory_units") return "Cambiar cupo"
	if (action === "stop_sell") return "Cerrar venta"
	if (action === "min_los") return "Mínimo de noches"
	return "Editar selección"
}

export default function SingleCalendarWorkspace({
	initialSurface,
	isProfessional,
	initialMode = "price",
	guidedAvailability,
}: Props) {
	const [surface, setSurface] = useState(initialSurface)
	const [mode, setMode] = useState<CalendarControlMode>(
		!isProfessional && initialMode === "conditions" ? "price" : initialMode
	)
	const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
	const [rangeAnchor, setRangeAnchor] = useState("")
	const [drawerAction, setDrawerAction] = useState<DrawerAction>(null)
	const [showComparison, setShowComparison] = useState(false)
	const [showInventoryDetail, setShowInventoryDetail] = useState(false)
	const [value, setValue] = useState("")
	const [reviewed, setReviewed] = useState(false)
	const [loading, setLoading] = useState(false)
	const [feedback, setFeedback] = useState("")
	const [guidedFeedback, setGuidedFeedback] = useState("")
	const [guidedInventoryDays, setGuidedInventoryDays] = useState(
		Math.max(0, Number(guidedAvailability?.initialInventoryDays ?? 0))
	)
	const [guidedRange, setGuidedRange] = useState<"next_30" | "next_60" | "custom">("next_30")
	const [guidedFrom, setGuidedFrom] = useState(localIsoDate())
	const [guidedTo, setGuidedTo] = useState(addDays(localIsoDate(), 29))
	const [guidedUnits, setGuidedUnits] = useState(() => {
		const firstAvailable = initialSurface.days.find((day) => !day.isPast && day.totalUnits > 0)
		return Math.max(1, Number(firstAvailable?.totalUnits ?? 1))
	})
	const [gridDirection, setGridDirection] = useState<"previous" | "next" | "neutral">("neutral")
	const [updatedDates, setUpdatedDates] = useState<Set<string>>(new Set())
	const today = localIsoDate()
	const visibleControlModes = isProfessional
		? CALENDAR_CONTROL_MODES
		: CALENDAR_CONTROL_MODES.filter((item) => item.key !== "conditions")
	const isGuidedAvailability = Boolean(guidedAvailability)
	const requiredGuidedDays = Math.max(1, Number(guidedAvailability?.requiredDays ?? 30))
	const guidedProgressPercent = Math.min(
		100,
		Math.round((guidedInventoryDays / requiredGuidedDays) * 100)
	)
	const guidedIsReady = guidedInventoryDays >= requiredGuidedDays

	const selected = useMemo(() => [...selectedDates].sort(), [selectedDates])
	const selection = {
		from: selected[0] || "",
		to: selected[selected.length - 1] || "",
		count: selected.length,
	}

	async function loadSurface(params: { ratePlanId?: string; month?: string } = {}) {
		const requestedMonth = params.month || surface.month
		setGridDirection(
			requestedMonth < surface.month
				? "previous"
				: requestedMonth > surface.month
					? "next"
					: "neutral"
		)
		setLoading(true)
		setFeedback("")
		try {
			const query = new URLSearchParams({
				ratePlanId: params.ratePlanId || surface.selectedRatePlanId,
				month: params.month || surface.month,
			})
			const response = await fetch(`/api/rates/calendar?${query.toString()}`)
			const body = await response.json().catch(() => ({}))
			if (!response.ok) throw new Error(body?.error || "No se pudo actualizar el calendario")
			startTransition(() => {
				setSurface(body.surface)
				setSelectedDates(new Set())
				setRangeAnchor("")
			})
			const nextUrl = new URL(window.location.href)
			nextUrl.searchParams.set("ratePlanId", params.ratePlanId || surface.selectedRatePlanId)
			nextUrl.searchParams.set("month", params.month || surface.month)
			nextUrl.searchParams.set("focus", mode)
			window.history.replaceState(null, "", nextUrl)
		} catch (error) {
			setFeedback(error instanceof Error ? error.message : "No se pudo actualizar el calendario")
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		if (!updatedDates.size) return
		const timeout = window.setTimeout(() => setUpdatedDates(new Set()), 850)
		return () => window.clearTimeout(timeout)
	}, [updatedDates])

	function selectDate(day: SingleCalendarDay) {
		if (day.isPast) return
		if (!rangeAnchor || selectedDates.size !== 1) {
			setSelectedDates(new Set([day.date]))
			setRangeAnchor(day.date)
			return
		}
		const from = rangeAnchor < day.date ? rangeAnchor : day.date
		const to = rangeAnchor < day.date ? day.date : rangeAnchor
		setSelectedDates(
			new Set(
				surface.days
					.filter((item) => !item.isPast && item.date >= from && item.date <= to)
					.map((item) => item.date)
			)
		)
		setRangeAnchor("")
	}

	function applyPreset(kind: string) {
		const today = new Date().toISOString().slice(0, 10)
		const max =
			kind === "next_7" ? addDays(today, 6) : kind === "next_30" ? addDays(today, 29) : "9999-12-31"
		setSelectedDates(
			new Set(
				surface.days
					.filter((day) => {
						if (day.isPast) return false
						const weekday = new Date(`${day.date}T12:00:00.000Z`).getUTCDay()
						if (kind === "visible_weekend") return weekday === 5 || weekday === 6
						if (kind === "visible_month") return true
						return day.date >= today && day.date <= max
					})
					.map((day) => day.date)
			)
		)
		setRangeAnchor("")
	}

	function setGuidedPreset(kind: "next_30" | "next_60" | "custom") {
		setGuidedRange(kind)
		const start = localIsoDate()
		if (kind === "next_30") {
			setGuidedFrom(start)
			setGuidedTo(addDays(start, 29))
		}
		if (kind === "next_60") {
			setGuidedFrom(start)
			setGuidedTo(addDays(start, 59))
		}
	}

	function guidedNightCount() {
		if (!guidedFrom || !guidedTo || guidedTo < guidedFrom) return 0
		const start = new Date(`${guidedFrom}T12:00:00.000Z`)
		const end = new Date(`${guidedTo}T12:00:00.000Z`)
		return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
	}

	async function applyGuidedAvailability() {
		const nights = guidedNightCount()
		const units = Math.trunc(Number(guidedUnits))
		if (!surface.selectedVariantId) {
			setGuidedFeedback("No hay una habitación seleccionada para abrir disponibilidad.")
			return
		}
		if (!guidedFrom || !guidedTo || guidedTo < guidedFrom || nights <= 0) {
			setGuidedFeedback("Elige un rango de fechas válido.")
			return
		}
		if (!Number.isFinite(units) || units < 1) {
			setGuidedFeedback("El cupo por noche debe ser al menos 1.")
			return
		}

		setLoading(true)
		setGuidedFeedback("Abriendo disponibilidad inicial...")
		try {
			const response = await fetch("/api/inventory/bulk-apply", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					selection: { variantIds: [surface.selectedVariantId] },
					dateRange: { from: guidedFrom, to: addDays(guidedTo, 1) },
					operation: { type: "SET_INVENTORY", value: units },
					context: { source: "playbook-availability" },
				}),
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok || Number(body?.summary?.failed || 0) > 0) {
				throw new Error(
					body?.failures?.[0]?.error || body?.error || "No se pudo abrir disponibilidad"
				)
			}
			const changedDates = new Set(
				surface.days
					.filter((day) => day.date >= guidedFrom && day.date <= guidedTo)
					.map((day) => day.date)
			)
			await loadSurface()
			setUpdatedDates(changedDates)
			setSelectedDates(changedDates)
			setRangeAnchor("")
			setGuidedInventoryDays((current) => Math.max(current, nights))
			setGuidedFeedback(
				`Disponibilidad abierta para ${nights} ${nights === 1 ? "noche" : "noches"} con ${units} ${units === 1 ? "unidad" : "unidades"} por noche.`
			)
		} catch (error) {
			setGuidedFeedback(error instanceof Error ? error.message : "No se pudo abrir disponibilidad")
		} finally {
			setLoading(false)
		}
	}

	function multiCalendarHref(tab: string) {
		const query = new URLSearchParams({
			tab,
			ratePlanId: surface.selectedRatePlanId,
			month: surface.month,
		})
		if (selection.from) query.set("from", selection.from)
		if (selection.to) query.set("to", selection.to)
		return `/rates/multi-calendar?${query.toString()}`
	}

	function openAction(id: string) {
		if (id === "price_comparison") return setShowComparison((current) => !current)
		if (id === "inventory_detail") return setShowInventoryDetail((current) => !current)
		if (id === "conditions") {
			window.location.href = `/rates/plans/${encodeURIComponent(surface.selectedRatePlanId)}?vista=conditions`
			return
		}
		if (["price_rules", "availability_scale", "sellability_rules", "applied_rules"].includes(id)) {
			window.location.href = multiCalendarHref(
				id === "price_rules"
					? "price"
					: id === "availability_scale"
						? "availability"
						: id === "applied_rules"
							? "rules"
							: "sellability"
			)
			return
		}
		if (!selection.count) return setFeedback("Selecciona una fecha o rango primero.")
		setValue(id === "min_los" ? "2" : "")
		setReviewed(false)
		setFeedback("")
		setDrawerAction(id as DrawerAction)
	}

	async function reviewMutation() {
		const numeric = drawerAction === "stop_sell" ? 0 : Number(value)
		if (!Number.isFinite(numeric) || numeric < 0) return setFeedback("Ingresa un valor válido.")
		setLoading(true)
		try {
			if (drawerAction === "manual_price") {
				const response = await fetch("/api/pricing/rules/v2/bulk-preview", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						ratePlanIds: [surface.selectedRatePlanId],
						operation: {
							type: "fixed_override",
							value: numeric,
							conditions: {
								priority: 1000,
								dateFrom: selection.from,
								dateTo: selection.to,
								previewFrom: selection.from,
								effectiveFrom: selection.from,
								effectiveTo: addDays(selection.to, 1),
								contextKey: "manual",
							},
						},
						dryRun: true,
					}),
				})
				const body = await response.json().catch(() => ({}))
				if (!response.ok) throw new Error(body?.error || "No se pudo revisar el cambio")
			}
			if (drawerAction === "inventory_units") {
				const response = await fetch("/api/inventory/bulk-preview", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						selection: { variantIds: [surface.selectedVariantId] },
						dateRange: { from: selection.from, to: addDays(selection.to, 1) },
						operation: { type: "SET_INVENTORY", value: Math.trunc(numeric) },
						context: { dryRun: true, source: "calendar" },
					}),
				})
				const body = await response.json().catch(() => ({}))
				if (!response.ok) throw new Error(body?.error || "No se pudo revisar el cupo")
			}
			setReviewed(true)
			setFeedback(`Impactará ${selection.count} ${selection.count === 1 ? "noche" : "noches"}.`)
		} catch (error) {
			setFeedback(error instanceof Error ? error.message : "No se pudo revisar el cambio")
		} finally {
			setLoading(false)
		}
	}

	async function saveMutation() {
		if (!drawerAction || !reviewed) return
		const numeric = Number(value)
		setLoading(true)
		try {
			let response: Response
			if (drawerAction === "manual_price") {
				response = await fetch("/api/pricing/rules/v2/bulk-apply", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						ratePlanIds: [surface.selectedRatePlanId],
						operation: {
							type: "fixed_override",
							value: numeric,
							conditions: {
								priority: 1000,
								dateFrom: selection.from,
								dateTo: selection.to,
								previewFrom: selection.from,
								effectiveFrom: selection.from,
								effectiveTo: addDays(selection.to, 1),
								contextKey: "manual",
							},
						},
					}),
				})
			} else if (drawerAction === "inventory_units") {
				response = await fetch("/api/inventory/bulk-apply", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						selection: { variantIds: [surface.selectedVariantId] },
						dateRange: { from: selection.from, to: addDays(selection.to, 1) },
						operation: { type: "SET_INVENTORY", value: Math.trunc(numeric) },
						context: { source: "calendar" },
					}),
				})
			} else {
				const form = new FormData()
				form.set("action", "create")
				form.set("scope", "rate_plan")
				form.set("rate_planScopeId", surface.selectedRatePlanId)
				form.set("startDate", selection.from)
				form.set("endDate", selection.to)
				form.set("type", drawerAction)
				if (drawerAction === "min_los") form.set("value", String(Math.trunc(numeric)))
				response = await fetch("/api/rates/commercial-rules", {
					method: "POST",
					body: form,
					headers: { Accept: "application/json" },
				})
			}
			const body = await response.json().catch(() => ({}))
			if (!response.ok || Number(body?.summary?.failed || 0) > 0) {
				throw new Error(body?.failures?.[0]?.error || body?.error || "No se pudo guardar")
			}
			const changedDates = new Set(selected)
			await loadSurface()
			setUpdatedDates(changedDates)
			setDrawerAction(null)
			setFeedback("Cambio guardado.")
		} catch (error) {
			setFeedback(error instanceof Error ? error.message : "No se pudo guardar")
		} finally {
			setLoading(false)
		}
	}

	const actions = visibleCalendarActions(mode, isProfessional)
	const activeDays = surface.days.filter((day) => !day.isPast)
	const missingPriceDays = activeDays.filter((day) => day.finalPrice == null).length
	const noInventoryDays = activeDays.filter((day) => day.availableUnits <= 0).length
	const closedDays = activeDays.filter((day) => day.restrictionSignals.hasCommercialBlocker).length
	const summary =
		mode === "price"
			? missingPriceDays
				? `${missingPriceDays} días sin precio`
				: "Precios completos"
			: mode === "availability"
				? noInventoryDays
					? `${noInventoryDays} días sin cupo`
					: "Cupo disponible"
				: mode === "sellability"
					? closedDays
						? `${closedDays} días cerrados`
						: "Venta abierta"
					: surface.conditions.complete
						? "Condiciones completas"
						: surface.conditions.missingSummary
	const guidedNights = guidedNightCount()

	return (
		<div className="space-y-4" aria-busy={loading}>
			{isGuidedAvailability && guidedAvailability && (
				<Card as="section" className="fastt-workspace-panel overflow-hidden p-0 text-slate-900">
					<div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
						<div className="space-y-5 p-5 md:p-6">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<div className="flex flex-wrap items-center gap-2">
										<h2 className="text-xl font-semibold text-slate-950">
											Abrir disponibilidad inicial
										</h2>
										<Badge variant={guidedIsReady ? "success" : "warning"}>
											{guidedIsReady ? "Lista" : "Pendiente"}
										</Badge>
									</div>
									<p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
										Configura un primer rango vendible. Esto solo abre cupo; precios y condiciones
										ya se revisaron en los pasos anteriores.
									</p>
								</div>
								<div className="min-w-36 text-right">
									<p className="text-xs font-semibold text-slate-500 uppercase">Meta</p>
									<p className="mt-1 text-sm font-semibold text-slate-950">
										{Math.min(guidedInventoryDays, requiredGuidedDays)}/{requiredGuidedDays} noches
									</p>
									<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
										<div
											className="h-full rounded-full bg-[var(--fastt-color-selection)]"
											style={{ width: `${guidedProgressPercent}%` }}
										/>
									</div>
								</div>
							</div>

							<div className="grid gap-3 md:grid-cols-3">
								<ChoiceCard
									selected={guidedRange === "next_30"}
									onClick={() => setGuidedPreset("next_30")}
									className="py-3"
								>
									<p className="text-sm font-semibold text-slate-950">Próximos 30 días</p>
									<p className="mt-1 text-xs leading-5 text-slate-500">
										Recomendado para publicar.
									</p>
								</ChoiceCard>
								<ChoiceCard
									selected={guidedRange === "next_60"}
									onClick={() => setGuidedPreset("next_60")}
									className="py-3"
								>
									<p className="text-sm font-semibold text-slate-950">Próximos 60 días</p>
									<p className="mt-1 text-xs leading-5 text-slate-500">Más margen para reservas.</p>
								</ChoiceCard>
								<ChoiceCard
									selected={guidedRange === "custom"}
									onClick={() => setGuidedPreset("custom")}
									className="py-3"
								>
									<p className="text-sm font-semibold text-slate-950">Personalizado</p>
									<p className="mt-1 text-xs leading-5 text-slate-500">Elige fechas exactas.</p>
								</ChoiceCard>
							</div>

							<div className="grid gap-4 md:grid-cols-[1fr_1fr_160px]">
								<label className="block text-sm">
									<span className="font-medium text-slate-800">Desde</span>
									<Input
										type="date"
										value={guidedFrom}
										min={localIsoDate()}
										onChange={(event) => {
											setGuidedRange("custom")
											setGuidedFrom(event.target.value)
										}}
										className="mt-1.5"
									/>
								</label>
								<label className="block text-sm">
									<span className="font-medium text-slate-800">Hasta</span>
									<Input
										type="date"
										value={guidedTo}
										min={guidedFrom || localIsoDate()}
										onChange={(event) => {
											setGuidedRange("custom")
											setGuidedTo(event.target.value)
										}}
										className="mt-1.5"
									/>
								</label>
								<label className="block text-sm">
									<span className="font-medium text-slate-800">Cupo por noche</span>
									<Input
										type="number"
										min="1"
										step="1"
										value={guidedUnits}
										onChange={(event) => setGuidedUnits(Number(event.target.value))}
										className="mt-1.5"
									/>
								</label>
							</div>

							<div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
								<p className="text-sm leading-6 text-slate-500">
									{guidedNights > 0
										? `Abrirás ${guidedNights} ${guidedNights === 1 ? "noche" : "noches"} con ${guidedUnits || 0} ${Number(guidedUnits) === 1 ? "unidad" : "unidades"} disponible por noche.`
										: "Selecciona un rango para calcular la disponibilidad inicial."}
								</p>
								<Button
									type="button"
									onClick={() => void applyGuidedAvailability()}
									disabled={loading}
									className="fastt-playbook-cta"
								>
									Abrir disponibilidad
								</Button>
							</div>

							{guidedFeedback && (
								<Notice variant={guidedIsReady ? "success" : "info"}>{guidedFeedback}</Notice>
							)}
						</div>

						<aside className="border-t border-slate-200 bg-slate-50 p-5 md:p-6 lg:border-t-0 lg:border-l">
							<p className="text-xs font-semibold text-slate-500 uppercase">Contexto</p>
							<dl className="mt-4 space-y-4 text-sm">
								<div>
									<dt className="text-slate-500">Habitación</dt>
									<dd className="mt-1 font-semibold text-slate-950">
										{guidedAvailability.variantName || surface.selectedContext}
									</dd>
								</div>
								<div>
									<dt className="text-slate-500">Tarifa</dt>
									<dd className="mt-1 font-semibold text-slate-950">
										{guidedAvailability.ratePlanName || surface.selectedRatePlanName}
									</dd>
								</div>
								<div>
									<dt className="text-slate-500">Después de este paso</dt>
									<dd className="mt-1 leading-6 text-slate-700">
										Podrás ajustar cierres, reglas y cupos diarios desde el calendario operativo.
									</dd>
								</div>
							</dl>
						</aside>
					</div>
				</Card>
			)}

			<Card
				as="section"
				className="fastt-workspace-panel relative overflow-hidden p-4 text-slate-900"
			>
				{loading && <span className="calendar-loading-bar" aria-hidden="true" />}
				{!isGuidedAvailability && (
					<div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_auto] lg:items-end">
						<label className="space-y-1 text-sm">
							<span className="text-xs font-semibold text-slate-500">Tarifa</span>
							<Select
								value={surface.selectedRatePlanId}
								onChange={(event) => void loadSurface({ ratePlanId: event.target.value })}
							>
								{surface.ratePlans.map((ratePlan) => (
									<option key={ratePlan.id} value={ratePlan.id}>
										{ratePlan.context} · {ratePlan.name}
									</option>
								))}
							</Select>
						</label>
						{isProfessional && (
							<Button
								href={multiCalendarHref(mode === "sellability" ? "sellability" : mode)}
								variant="secondary"
							>
								Multicalendario
							</Button>
						)}
					</div>
				)}

				<div className="fastt-calendar-toolbar sticky top-3 z-20 mt-4 p-3">
					{isGuidedAvailability ? (
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="font-semibold text-slate-950">Vista de apoyo</p>
								<p className="text-xs text-slate-500">
									Revisa visualmente los cupos abiertos para esta habitación.
								</p>
							</div>
							<Button
								type="button"
								onClick={() => setShowInventoryDetail((current) => !current)}
								variant="secondary"
								size="sm"
							>
								{showInventoryDetail ? "Ocultar detalle" : "Ver detalle físico"}
							</Button>
						</div>
					) : (
						<>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="min-w-0">
									<p className="font-semibold text-slate-950">
										{selection.count
											? formatRange(selection.from, selection.to, true)
											: mode === "conditions"
												? surface.conditions.summary
												: "Selecciona una fecha o rango"}
									</p>
									{selection.count > 0 && (
										<p className="text-xs text-slate-500">
											{selection.count} {selection.count === 1 ? "noche" : "noches"} ·{" "}
											{surface.selectedRatePlanName}
										</p>
									)}
								</div>
								<div className="hidden flex-wrap gap-1.5 sm:flex" aria-label="Atajos de rango">
									{RANGE_PRESETS.map(([id, label]) => (
										<Button
											key={id}
											type="button"
											onClick={() => applyPreset(id)}
											variant="secondary"
											size="sm"
										>
											{label}
										</Button>
									))}
								</div>
								<details className="relative sm:hidden">
									<summary className="fastt-button inline-flex min-h-8 cursor-pointer list-none items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
										Rangos
									</summary>
									<div className="fastt-soft-box absolute top-full left-0 z-30 mt-2 w-44 space-y-1 border border-slate-200 bg-white p-1.5 shadow-lg">
										{RANGE_PRESETS.map(([id, label]) => (
											<Button
												key={id}
												type="button"
												onClick={(event) => {
													applyPreset(id)
													event.currentTarget.closest("details")?.removeAttribute("open")
												}}
												variant="ghost"
												size="sm"
												className="w-full justify-start"
											>
												{label}
											</Button>
										))}
									</div>
								</details>
							</div>

							<SegmentedControl className="mt-3" role="tablist">
								{visibleControlModes.map((item) => (
									<SegmentedItem
										key={item.key}
										role="tab"
										aria-selected={mode === item.key}
										active={mode === item.key}
										onClick={() => setMode(item.key)}
										className="min-w-28 py-2 text-left"
									>
										<span className="block font-semibold">{item.label}</span>
										<span className="mt-0.5 block text-[10px] font-medium text-slate-500">
											{item.helper}
										</span>
									</SegmentedItem>
								))}
							</SegmentedControl>

							<div className="mt-3 flex flex-wrap gap-2">
								{actions.map((action) => (
									<Button
										key={action.id}
										type="button"
										onClick={() => openAction(action.id)}
										variant={action.kind === "mutation" ? "primary" : "secondary"}
										size="sm"
									>
										{action.id === "price_comparison" && showComparison
											? "Ocultar base y final"
											: action.id === "inventory_detail" && showInventoryDetail
												? "Ocultar detalle físico"
												: action.label}
									</Button>
								))}
								{selection.count > 0 && (
									<Button
										type="button"
										onClick={() => {
											setSelectedDates(new Set())
											setRangeAnchor("")
										}}
										variant="ghost"
										size="sm"
									>
										Limpiar
									</Button>
								)}
							</div>
						</>
					)}
				</div>

				<div className="mt-5 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
					<div className="flex items-center gap-2">
						<IconButton
							onClick={() => void loadSurface({ month: surface.previousMonth })}
							label="Mes anterior"
							size="sm"
						>
							‹
						</IconButton>
						<h2 className="text-base font-semibold text-slate-950">{monthLabel(surface.month)}</h2>
						<IconButton
							onClick={() => void loadSurface({ month: surface.nextMonth })}
							label="Mes siguiente"
							size="sm"
						>
							›
						</IconButton>
					</div>
					<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
						{summary}
					</span>
				</div>

				<div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 md:gap-2 md:text-xs">
					{WEEKDAYS.map((weekday) => (
						<div key={weekday}>{weekday}</div>
					))}
				</div>
				<div
					key={`${surface.selectedRatePlanId}:${surface.month}`}
					data-direction={gridDirection}
					className="calendar-grid-enter mt-1 grid grid-cols-7 gap-1 md:gap-2"
				>
					{Array.from({ length: surface.leadingBlankDays }).map((_, index) => (
						<div key={`blank-${index}`} className="min-h-20 md:min-h-28" />
					))}
					{surface.days.map((day) => {
						const presentation = cellPresentation(mode, day, showComparison, showInventoryDetail)
						const isSelected = selectedDates.has(day.date)
						const isToday = day.date === today
						const selectionEdge = !isSelected
							? undefined
							: selection.count === 1
								? "single"
								: day.date === selection.from
									? "start"
									: day.date === selection.to
										? "end"
										: "middle"
						return (
							<button
								key={day.date}
								type="button"
								disabled={day.isPast}
								onClick={() => selectDate(day)}
								aria-label={`${formatDate(day.date, true)}${presentation.primary ? ` · ${presentation.primary}` : ""}`}
								aria-pressed={isSelected}
								data-selected={isSelected}
								data-selection-edge={selectionEdge}
								data-today={isToday}
								className={`calendar-cell fastt-calendar-cell min-h-20 border p-1.5 text-left disabled:cursor-default md:min-h-28 md:p-2 ${updatedDates.has(day.date) ? "calendar-updated" : ""} ${toneClass(presentation.tone)}`}
							>
								<div className="flex items-start justify-end gap-1.5">
									{isToday && (
										<span className="mt-1.5 size-1.5 rounded-full bg-slate-950" aria-label="Hoy" />
									)}
									<span
										className={`text-sm font-semibold md:text-base ${isToday ? "text-sky-700" : ""}`}
									>
										{day.day}
									</span>
								</div>
								{!day.isPast && presentation.primary && (
									<div key={mode} className="calendar-cell-content">
										<p className="mt-2 truncate text-[11px] font-semibold md:text-sm">
											{presentation.primary}
										</p>
										{presentation.secondary && (
											<p className="mt-1 line-clamp-2 hidden text-[9px] leading-4 opacity-65 sm:block md:text-[11px]">
												{presentation.secondary}
											</p>
										)}
									</div>
								)}
							</button>
						)
					})}
				</div>
			</Card>

			{feedback && !drawerAction && (
				<p className="text-sm font-medium text-slate-200">{feedback}</p>
			)}

			{drawerAction && (
				<CalendarResponsiveDrawer
					title={actionTitle(drawerAction)}
					meta={`${formatRange(selection.from, selection.to, true)} · ${surface.selectedRatePlanName}`}
					onClose={() => setDrawerAction(null)}
				>
					<div className="mt-5 space-y-4">
						{drawerAction === "stop_sell" ? (
							<Notice variant="warning">
								Cerrará la venta de esta tarifa durante el rango seleccionado.
							</Notice>
						) : (
							<label className="block text-sm font-medium text-slate-700">
								{drawerAction === "manual_price"
									? "Precio final"
									: drawerAction === "inventory_units"
										? "Cupo físico total"
										: "Noches mínimas"}
								<Input
									type="number"
									min="0"
									value={value}
									onChange={(event) => {
										setValue(event.target.value)
										setReviewed(false)
									}}
									className="mt-1.5"
								/>
							</label>
						)}
						{feedback && <p className="text-sm text-slate-600">{feedback}</p>}
						<div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-4">
							<Button
								type="button"
								disabled={loading}
								onClick={() => void reviewMutation()}
								variant="secondary"
							>
								Revisar
							</Button>
							<Button
								type="button"
								disabled={loading || !reviewed}
								onClick={() => void saveMutation()}
							>
								Guardar
							</Button>
						</div>
					</div>
				</CalendarResponsiveDrawer>
			)}
		</div>
	)
}
