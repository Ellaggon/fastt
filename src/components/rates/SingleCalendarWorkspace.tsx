/** @jsxRuntime classic */
import React, { startTransition, useEffect, useMemo, useState } from "react"

import CalendarResponsiveDrawer from "@/components/rates/CalendarResponsiveDrawer"
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
		info: "border-blue-300 bg-blue-50 text-blue-950",
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
}: Props) {
	const [surface, setSurface] = useState(initialSurface)
	const [mode, setMode] = useState<CalendarControlMode>(initialMode)
	const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
	const [rangeAnchor, setRangeAnchor] = useState("")
	const [drawerAction, setDrawerAction] = useState<DrawerAction>(null)
	const [showComparison, setShowComparison] = useState(false)
	const [showInventoryDetail, setShowInventoryDetail] = useState(false)
	const [value, setValue] = useState("")
	const [reviewed, setReviewed] = useState(false)
	const [loading, setLoading] = useState(false)
	const [feedback, setFeedback] = useState("")
	const [gridDirection, setGridDirection] = useState<"previous" | "next" | "neutral">("neutral")
	const [updatedDates, setUpdatedDates] = useState<Set<string>>(new Set())
	const today = localIsoDate()

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
			window.history.replaceState(null, "", `/rates/calendar?${query.toString()}&focus=${mode}`)
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

	return (
		<div className="space-y-4" aria-busy={loading}>
			<section className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-sm">
				{loading && <span className="calendar-loading-bar" aria-hidden="true" />}
				<div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_auto] lg:items-end">
					<label className="space-y-1 text-sm">
						<span className="text-xs font-semibold text-slate-500">Tarifa</span>
						<select
							value={surface.selectedRatePlanId}
							onChange={(event) => void loadSurface({ ratePlanId: event.target.value })}
							className="calendar-control w-full rounded-md border border-slate-300 bg-white px-3 py-2"
						>
							{surface.ratePlans.map((ratePlan) => (
								<option key={ratePlan.id} value={ratePlan.id}>
									{ratePlan.context} · {ratePlan.name}
								</option>
							))}
						</select>
					</label>
					{isProfessional && (
						<a
							href={multiCalendarHref(mode === "sellability" ? "sellability" : mode)}
							className="calendar-control inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
						>
							Multicalendario
						</a>
					)}
				</div>

				<div className="sticky top-3 z-20 mt-4 rounded-lg border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur">
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
								<button
									key={id}
									type="button"
									onClick={() => applyPreset(id)}
									className="calendar-control rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
								>
									{label}
								</button>
							))}
						</div>
						<details className="relative sm:hidden">
							<summary className="calendar-control cursor-pointer list-none rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
								Rangos
							</summary>
							<div className="absolute top-full left-0 z-30 mt-2 w-40 space-y-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-lg">
								{RANGE_PRESETS.map(([id, label]) => (
									<button
										key={id}
										type="button"
										onClick={(event) => {
											applyPreset(id)
											event.currentTarget.closest("details")?.removeAttribute("open")
										}}
										className="calendar-control block w-full px-2.5 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100"
									>
										{label}
									</button>
								))}
							</div>
						</details>
					</div>

					<div className="mt-3 flex gap-1 overflow-x-auto rounded-md bg-white p-1" role="tablist">
						{CALENDAR_CONTROL_MODES.map((item) => (
							<button
								key={item.key}
								type="button"
								role="tab"
								aria-selected={mode === item.key}
								onClick={() => setMode(item.key)}
								className={`calendar-control min-w-28 rounded-md px-3 py-2 text-left text-xs ${mode === item.key ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
							>
								<span className="block font-semibold">{item.label}</span>
								<span
									className={`block text-[10px] ${mode === item.key ? "text-slate-300" : "text-slate-400"}`}
								>
									{item.helper}
								</span>
							</button>
						))}
					</div>

					<div className="mt-3 flex flex-wrap gap-2">
						{actions.map((action) => (
							<button
								key={action.id}
								type="button"
								onClick={() => openAction(action.id)}
								className={`calendar-control rounded-md border px-3 py-2 text-xs font-semibold ${action.kind === "mutation" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
							>
								{action.id === "price_comparison" && showComparison
									? "Ocultar base y final"
									: action.id === "inventory_detail" && showInventoryDetail
										? "Ocultar detalle físico"
										: action.label}
							</button>
						))}
						{selection.count > 0 && (
							<button
								type="button"
								onClick={() => {
									setSelectedDates(new Set())
									setRangeAnchor("")
								}}
								className="px-3 py-2 text-xs font-semibold text-slate-500"
							>
								Limpiar
							</button>
						)}
					</div>
				</div>

				<div className="mt-5 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => void loadSurface({ month: surface.previousMonth })}
							className="calendar-control h-8 w-8 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
							aria-label="Mes anterior"
						>
							‹
						</button>
						<h2 className="text-base font-semibold text-slate-950">{monthLabel(surface.month)}</h2>
						<button
							type="button"
							onClick={() => void loadSurface({ month: surface.nextMonth })}
							className="calendar-control h-8 w-8 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
							aria-label="Mes siguiente"
						>
							›
						</button>
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
								className={`calendar-cell min-h-20 rounded-md border p-1.5 text-left disabled:cursor-default md:min-h-28 md:p-2 ${updatedDates.has(day.date) ? "calendar-updated" : ""} ${toneClass(presentation.tone)}`}
							>
								<div className="flex items-start justify-end gap-1.5">
									{isToday && (
										<span className="mt-1.5 size-1.5 rounded-full bg-blue-600" aria-label="Hoy" />
									)}
									<span
										className={`text-sm font-semibold md:text-base ${isToday ? "text-blue-700" : ""}`}
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
			</section>

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
							<p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
								Cerrará la venta de esta tarifa durante el rango seleccionado.
							</p>
						) : (
							<label className="block text-sm font-medium text-slate-700">
								{drawerAction === "manual_price"
									? "Precio final"
									: drawerAction === "inventory_units"
										? "Cupo físico total"
										: "Noches mínimas"}
								<input
									type="number"
									min="0"
									value={value}
									onChange={(event) => {
										setValue(event.target.value)
										setReviewed(false)
									}}
									className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2"
								/>
							</label>
						)}
						{feedback && <p className="text-sm text-slate-600">{feedback}</p>}
						<div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-4">
							<button
								type="button"
								disabled={loading}
								onClick={() => void reviewMutation()}
								className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40"
							>
								Revisar
							</button>
							<button
								type="button"
								disabled={loading || !reviewed}
								onClick={() => void saveMutation()}
								className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
							>
								Guardar
							</button>
						</div>
					</div>
				</CalendarResponsiveDrawer>
			)}
		</div>
	)
}
