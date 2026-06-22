/** @jsxRuntime classic */
import React, { memo, startTransition, useEffect, useMemo, useRef, useState } from "react"

import { CALENDAR_CONTROL_MODES } from "@/lib/rates/calendarControlCatalog"
import type {
	MultiCalendarCell,
	MultiCalendarRow,
	MultiCalendarSurface,
	MultiCalendarTab,
} from "@/lib/rates/multiCalendarSurface"
import type { MultiCalendarAppliedRule } from "@/lib/rates/loadMultiCalendarWorkspace"

type Props = {
	initialSurface: MultiCalendarSurface
	initialRules: MultiCalendarAppliedRule[]
}

type Selection = {
	cells: Array<{ row: MultiCalendarRow; cell: MultiCalendarCell }>
	dates: string[]
	ratePlanIds: string[]
	variantIds: string[]
	productIds: string[]
	from: string
	to: string
}

const TABS: Array<{ key: MultiCalendarTab; label: string; helper: string }> = [
	...CALENDAR_CONTROL_MODES.filter((mode) => mode.key !== "conditions").map((mode) => ({
		key: mode.key as MultiCalendarTab,
		label: mode.label,
		helper:
			mode.key === "price"
				? "Ajustes, descuentos y promociones."
				: mode.key === "availability"
					? "Cupos y bloqueo físico."
					: "Vendible, cerrado o ventana de reserva.",
	})),
	{ key: "stay", label: "Estancia", helper: "Mínimo, máximo y huecos." },
	{ key: "arrival_departure", label: "Llegada/salida", helper: "Check-in y check-out permitidos." },
	{
		key: "conditions",
		label: CALENDAR_CONTROL_MODES.find((mode) => mode.key === "conditions")?.label ?? "Condiciones",
		helper: "Contrato de cada tarifa.",
	},
	{ key: "rules", label: "Reglas aplicadas", helper: "Automatizaciones activas y conflictos." },
]

const ACTIONS: Record<MultiCalendarTab, Array<{ id: string; label: string }>> = {
	price: [
		{ id: "price_base", label: "Ajuste de precio" },
		{ id: "price_stay", label: "Descuento por estadía" },
		{ id: "price_early", label: "Anticipada" },
		{ id: "price_last", label: "Último minuto" },
		{ id: "price_promo", label: "Promoción" },
	],
	availability: [
		{ id: "availability_units", label: "Cambiar cupo" },
		{ id: "availability_block", label: "Bloquear fechas" },
	],
	sellability: [
		{ id: "stop_sell", label: "Cerrar venta" },
		{ id: "min_lead_time", label: "Anticipación mínima" },
		{ id: "max_lead_time", label: "Anticipación máxima" },
	],
	stay: [
		{ id: "min_los", label: "Mínimo de noches" },
		{ id: "max_los", label: "Máximo de noches" },
	],
	arrival_departure: [
		{ id: "cta", label: "Bloquear llegada" },
		{ id: "ctd", label: "Bloquear salida" },
	],
	conditions: [{ id: "conditions", label: "Ver condiciones" }],
	rules: [
		{ id: "rules", label: "Editar reglas" },
		{ id: "conflicts", label: "Ver conflictos" },
		{ id: "history", label: "Historial" },
	],
}

const PRICE_ACTIONS: Record<
	string,
	{ title: string; contextKey: string; fixedMode?: string; defaultValue: number }
> = {
	price_base: {
		title: "Ajuste de precio base",
		contextKey: "multi_calendar_price_adjustment",
		defaultValue: 10,
	},
	price_stay: {
		title: "Descuento por estadía",
		contextKey: "los_discount",
		fixedMode: "percentage_discount",
		defaultValue: 12,
	},
	price_early: {
		title: "Descuento anticipado",
		contextKey: "early_bird",
		fixedMode: "percentage_discount",
		defaultValue: 15,
	},
	price_last: {
		title: "Descuento de último minuto",
		contextKey: "last_minute",
		fixedMode: "percentage_discount",
		defaultValue: 15,
	},
	price_promo: {
		title: "Promoción especial",
		contextKey: "promotion",
		fixedMode: "percentage_discount",
		defaultValue: 10,
	},
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

function cellText(tab: MultiCalendarTab, cell: MultiCalendarCell) {
	if (cell.isPast) return { primary: "Pasado", secondary: "", tone: "past" }
	if (tab === "availability")
		return {
			primary: `${cell.availableUnits}/${cell.totalUnits} cupos`,
			secondary: `${cell.bookedUnits} reservas · ${cell.heldUnits} retenidos`,
			tone: cell.availableUnits > 0 ? "ok" : "warning",
		}
	if (tab === "sellability")
		return {
			primary: cell.operationalStatusLabel,
			secondary: cell.restrictionSummary,
			tone: cell.hasCommercialBlocker ? "danger" : cell.restrictionCount ? "info" : "ok",
		}
	if (tab === "stay")
		return {
			primary: cell.restrictionCount ? "Con regla" : "Sin regla",
			secondary: cell.restrictionSummary,
			tone: cell.hasCommercialBlocker ? "danger" : cell.restrictionCount ? "info" : "ok",
		}
	if (tab === "arrival_departure")
		return {
			primary: cell.restrictionCount ? "Con regla" : "Entrada libre",
			secondary: cell.restrictionSummary,
			tone: cell.hasCommercialBlocker ? "danger" : cell.restrictionCount ? "info" : "ok",
		}
	if (tab === "conditions")
		return {
			primary: cell.conditionsComplete ? "Listas" : "Faltan",
			secondary: cell.conditionsMissingSummary || cell.conditionsSummary,
			tone: cell.conditionsComplete ? "ok" : "warning",
		}
	if (tab === "rules")
		return {
			primary: cell.hasCommercialBlocker
				? "Cerrado"
				: cell.restrictionCount
					? `${cell.restrictionCount} reglas`
					: "Sin reglas",
			secondary: cell.restrictionSummary,
			tone: cell.hasCommercialBlocker ? "danger" : cell.restrictionCount ? "info" : "ok",
		}
	return {
		primary: cell.price,
		secondary: cell.hasPrice ? cell.basePrice : "Completar precio",
		tone: cell.hasPrice ? "ok" : "warning",
	}
}

function toneClass(tone: string, selected: boolean) {
	const tones: Record<string, string> = {
		past: "border-slate-200 bg-slate-50 text-slate-400",
		ok: "border-emerald-200 bg-emerald-50 text-emerald-950",
		warning: "border-amber-200 bg-amber-50 text-amber-950",
		danger: "border-red-200 bg-red-50 text-red-950",
		info: "border-blue-200 bg-blue-50 text-blue-950",
	}
	return `${tones[tone] || tones.ok} ${selected ? "relative z-[1] ring-2 ring-slate-950 ring-inset" : ""}`
}

function statsFromRows(rows: MultiCalendarRow[]) {
	const cells = rows.flatMap((row) => row.cells.filter((cell) => !cell.isPast))
	const readyRows = rows.filter(
		(row) =>
			row.readiness.priceReady && row.readiness.availabilityReady && row.readiness.conditionsReady
	).length
	return {
		totalRows: rows.length,
		readyRows,
		attentionRows: rows.length - readyRows,
		missingPriceCells: cells.filter((cell) => !cell.hasPrice).length,
		noInventoryCells: cells.filter((cell) => cell.availableUnits <= 0).length,
		closedCells: cells.filter((cell) => cell.hasCommercialBlocker).length,
		incompleteConditionRows: rows.filter((row) => !row.readiness.conditionsReady).length,
	}
}

function rowMatchesStatus(
	row: MultiCalendarRow,
	status: MultiCalendarSurface["filters"]["status"]
) {
	const ready =
		row.readiness.priceReady && row.readiness.availabilityReady && row.readiness.conditionsReady
	if (status === "ready") return ready
	if (status === "attention") return !ready
	return true
}

type CalendarRowProps = {
	row: MultiCalendarRow
	tab: MultiCalendarTab
	selected: Set<string>
	onToggle: (ratePlanId: string, date: string) => void
	onToggleRow: (ratePlanId: string) => void
}

function rowSelectionChanged(previous: CalendarRowProps, next: CalendarRowProps) {
	return previous.row.cells.some((cell) => {
		const key = `${previous.row.ratePlanId}:${cell.date}`
		return previous.selected.has(key) !== next.selected.has(key)
	})
}

const CalendarRow = memo(
	function CalendarRow(props: CalendarRowProps) {
		const { row, tab, selected, onToggle, onToggleRow } = props
		return (
			<>
				<div className="sticky left-0 z-10 border-r border-b border-slate-200 bg-white/95 p-3 backdrop-blur">
					<p className="truncate text-sm font-semibold text-slate-950">{row.ratePlanName}</p>
					<p className="truncate text-xs text-slate-500">
						{row.productName} · {row.variantName}
					</p>
					<div className="mt-2 flex items-center gap-2">
						<span
							className={`rounded-md px-2 py-1 text-[11px] font-semibold ${row.readiness.priceReady && row.readiness.availabilityReady && row.readiness.conditionsReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
						>
							{row.readiness.priceReady &&
							row.readiness.availabilityReady &&
							row.readiness.conditionsReady
								? "Lista"
								: "Con pendientes"}
						</span>
						<button
							type="button"
							onClick={() => onToggleRow(row.ratePlanId)}
							className="text-xs font-semibold text-slate-600 hover:text-slate-950"
						>
							Seleccionar fila
						</button>
					</div>
				</div>
				{row.cells.map((cell) => {
					const key = `${row.ratePlanId}:${cell.date}`
					const text = cellText(tab, cell)
					return (
						<button
							key={key}
							type="button"
							disabled={cell.isPast}
							onClick={() => onToggle(row.ratePlanId, cell.date)}
							className={`min-h-20 border-r border-b p-2 text-left transition-colors duration-150 ${toneClass(text.tone, selected.has(key))} ${cell.isPast ? "cursor-default" : "hover:brightness-[0.98]"}`}
						>
							<p className="truncate text-sm font-semibold">{text.primary}</p>
							<p className="mt-1 line-clamp-2 text-xs opacity-75">{text.secondary}</p>
						</button>
					)
				})}
			</>
		)
	},
	(previous, next) =>
		previous.row === next.row && previous.tab === next.tab && !rowSelectionChanged(previous, next)
)

export default function MultiCalendarWorkspace({ initialSurface, initialRules }: Props) {
	const [surface, setSurface] = useState(initialSurface)
	const [rules, setRules] = useState(initialRules)
	const [activeTab, setActiveTab] = useState<MultiCalendarTab>(initialSurface.tab)
	const [selected, setSelected] = useState<Set<string>>(() => new Set())
	const [activeAction, setActiveAction] = useState("")
	const [drawerOpen, setDrawerOpen] = useState(false)
	const [loading, setLoading] = useState(false)
	const [feedback, setFeedback] = useState("")
	const [priceMode, setPriceMode] = useState("percentage_discount")
	const [value, setValue] = useState("")
	const [previewReady, setPreviewReady] = useState(false)
	const [editingRule, setEditingRule] = useState<MultiCalendarAppliedRule | null>(null)
	const [editingMode, setEditingMode] = useState<"edit" | "variant">("edit")
	const [filters, setFilters] = useState(initialSurface.filters)
	const requestRef = useRef<AbortController | null>(null)
	const cacheRef = useRef(
		new Map<string, { surface: MultiCalendarSurface; appliedRules: MultiCalendarAppliedRule[] }>()
	)

	const selection = useMemo<Selection>(() => {
		const cells: Selection["cells"] = []
		for (const row of surface.rows) {
			for (const cell of row.cells) {
				if (selected.has(`${row.ratePlanId}:${cell.date}`)) cells.push({ row, cell })
			}
		}
		const dates = [...new Set(cells.map((item) => item.cell.date))].sort()
		return {
			cells,
			dates,
			ratePlanIds: [...new Set(cells.map((item) => item.row.ratePlanId))],
			variantIds: [...new Set(cells.map((item) => item.row.variantId))],
			productIds: [...new Set(cells.map((item) => item.row.productId))],
			from: dates[0] || "",
			to: dates.at(-1) || "",
		}
	}, [selected, surface.rows])

	function queryUrl(
		overrides: Record<string, string> = {},
		endpoint = "/api/rates/multi-calendar"
	) {
		const url = new URL(endpoint, window.location.origin)
		const params = new URLSearchParams(window.location.search)
		for (const [key, entry] of Object.entries(overrides))
			entry ? params.set(key, entry) : params.delete(key)
		params.forEach((entry, key) => url.searchParams.set(key, entry))
		return url
	}

	async function loadWorkspace(overrides: Record<string, string> = {}, patchIds: string[] = []) {
		const url = queryUrl(overrides)
		if (patchIds.length) {
			url.searchParams.delete("ratePlanId")
			url.searchParams.set("status", "all")
			url.searchParams.set("ratePlanIds", [...new Set(patchIds)].join(","))
		}
		const cacheKey = url.toString()
		if (!patchIds.length && cacheRef.current.has(cacheKey)) {
			const cached = cacheRef.current.get(cacheKey)!
			startTransition(() => {
				setSurface(cached.surface)
				setRules(cached.appliedRules)
				setSelected(new Set())
			})
			return
		}
		requestRef.current?.abort()
		const controller = new AbortController()
		requestRef.current = controller
		setLoading(true)
		try {
			const response = await fetch(url, {
				headers: { Accept: "application/json" },
				signal: controller.signal,
			})
			const payload = await response.json()
			if (!response.ok) throw new Error(payload?.error || "No se pudo actualizar la vista")
			if (patchIds.length) {
				const patchedRows = new Map<string, MultiCalendarRow>(
					(payload.surface.rows as MultiCalendarRow[]).map((row) => [row.ratePlanId, row])
				)
				startTransition(() => {
					setSurface((current) => {
						const rows = current.rows
							.map((row) => patchedRows.get(row.ratePlanId) || row)
							.filter((row) => rowMatchesStatus(row, current.filters.status))
						return { ...current, rows, stats: statsFromRows(rows) }
					})
					setRules(payload.appliedRules)
				})
			} else {
				cacheRef.current.set(cacheKey, payload)
				startTransition(() => {
					setSurface(payload.surface)
					setRules(payload.appliedRules)
					setSelected(new Set())
					setFilters(payload.surface.filters)
				})
				const browserUrl = new URL(window.location.href)
				browserUrl.search = url.search
				window.history.replaceState({}, "", browserUrl)
			}
		} catch (error) {
			if ((error as Error).name !== "AbortError") setFeedback((error as Error).message)
		} finally {
			if (requestRef.current === controller) setLoading(false)
		}
	}

	useEffect(() => {
		const listener = (event: Event) => {
			const detail = (event as CustomEvent<{ scope?: string; scopeId?: string }>).detail
			if (detail?.scope !== "rate_plan" || !detail.scopeId) return
			event.preventDefault()
			void loadWorkspace({}, [detail.scopeId])
		}
		document.addEventListener("policy-assignment-saved", listener)
		return () => document.removeEventListener("policy-assignment-saved", listener)
	})

	function changeTab(tab: MultiCalendarTab) {
		setActiveTab(tab)
		setActiveAction("")
		setDrawerOpen(false)
		const url = new URL(window.location.href)
		url.searchParams.set("tab", tab)
		window.history.replaceState({}, "", url)
	}

	function toggleCell(ratePlanId: string, date: string) {
		setSelected((current) => {
			const next = new Set(current)
			const key = `${ratePlanId}:${date}`
			next.has(key) ? next.delete(key) : next.add(key)
			return next
		})
	}

	function toggleMany(keys: string[]) {
		setSelected((current) => {
			const next = new Set(current)
			const shouldSelect = keys.some((key) => !next.has(key))
			for (const key of keys) shouldSelect ? next.add(key) : next.delete(key)
			return next
		})
	}

	function applyPreset(kind: string) {
		const today = new Date().toISOString().slice(0, 10)
		const max =
			kind === "next_7" ? addDays(today, 6) : kind === "next_30" ? addDays(today, 29) : "9999-12-31"
		const keys: string[] = []
		for (const row of surface.rows)
			for (const cell of row.cells) {
				const weekday = new Date(`${cell.date}T12:00:00Z`).getUTCDay()
				const include =
					kind === "visible_weekend"
						? weekday === 5 || weekday === 6
						: kind === "visible_month"
							? true
							: cell.date >= today && cell.date <= max
				if (!cell.isPast && include) keys.push(`${row.ratePlanId}:${cell.date}`)
			}
		setSelected(new Set(keys))
	}

	function openAction(id: string) {
		setActiveAction(id)
		setFeedback("")
		setPreviewReady(false)
		setValue("")
		setEditingRule(null)
		setEditingMode("edit")
		if (PRICE_ACTIONS[id]) {
			setValue(String(PRICE_ACTIONS[id].defaultValue))
			setPriceMode(PRICE_ACTIONS[id].fixedMode || "percentage_discount")
		}
		setDrawerOpen(true)
	}

	async function savePrice() {
		const numeric = Number(value)
		if (!Number.isFinite(numeric) || numeric < 0) return setFeedback("Ingresa un valor válido.")
		if (!previewReady) return setFeedback("Revisa el impacto antes de guardar.")
		setLoading(true)
		setFeedback("Guardando precio...")
		const config = PRICE_ACTIONS[activeAction]
		try {
			const response = await fetch("/api/pricing/rules/v2/bulk-apply", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					ratePlanIds: selection.ratePlanIds,
					operation: {
						type: priceMode,
						value: numeric,
						conditions: {
							priority: 1000,
							dateFrom: selection.from,
							dateTo: selection.to,
							previewFrom: selection.from,
							effectiveFrom: selection.from,
							effectiveTo: addDays(selection.to, 1),
							contextKey: config.contextKey,
							currency: selection.cells[0]?.cell.currency || "USD",
						},
					},
					dryRun: false,
					concurrency: 3,
				}),
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok || Number(body?.summary?.failed || 0) > 0)
				throw new Error(body?.failures?.[0]?.error || body?.error || "No se pudo guardar")
			await loadWorkspace({}, selection.ratePlanIds)
			setFeedback("Precio actualizado.")
			setPreviewReady(false)
		} catch (error) {
			setFeedback((error as Error).message)
		} finally {
			setLoading(false)
		}
	}

	async function saveAvailability() {
		const numeric = Number(value)
		if (!Number.isInteger(numeric) || numeric < 0)
			return setFeedback("Ingresa un cupo entero válido.")
		if (!previewReady) return setFeedback("Revisa el impacto antes de guardar.")
		setLoading(true)
		setFeedback("Guardando cupo...")
		try {
			const response = await fetch("/api/inventory/bulk-apply", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					selection: { variantIds: selection.variantIds },
					dateRange: { from: selection.from, to: addDays(selection.to, 1) },
					operation: { type: "SET_INVENTORY", value: numeric },
					context: { source: "multi-calendar" },
				}),
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok) throw new Error(body?.error || "No se pudo guardar")
			await loadWorkspace({}, selection.ratePlanIds)
			setFeedback("Cupo actualizado.")
			setPreviewReady(false)
		} catch (error) {
			setFeedback((error as Error).message)
		} finally {
			setLoading(false)
		}
	}

	async function saveSellabilityRule() {
		if (!previewReady) return setFeedback("Revisa el impacto antes de guardar.")
		const form = new FormData()
		form.set("action", "create-batch")
		form.set("scope", "rate_plan")
		form.set("scopeIds", selection.ratePlanIds.join(","))
		form.set("startDate", selection.from)
		form.set("endDate", selection.to)
		form.set("type", activeAction === "availability_block" ? "stop_sell" : activeAction)
		if (value) form.set("value", value)
		setLoading(true)
		try {
			const response = await fetch("/api/rates/commercial-rules", {
				method: "POST",
				body: form,
				headers: { Accept: "application/json" },
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok) throw new Error(body?.error || "No se pudo guardar la regla")
			await loadWorkspace({}, selection.ratePlanIds)
			setFeedback("Regla guardada.")
			setPreviewReady(false)
		} catch (error) {
			setFeedback((error as Error).message)
		} finally {
			setLoading(false)
		}
	}

	const selectedRules = useMemo(
		() =>
			rules.filter((rule) => {
				const target =
					rule.scope === "rate_plan" || rule.category === "price"
						? selection.ratePlanIds.includes(rule.ratePlanId || rule.scopeId)
						: rule.scope === "variant"
							? selection.variantIds.includes(rule.variantId || rule.scopeId)
							: selection.productIds.includes(rule.productId || rule.scopeId)
				if (!target) return false
				if (!rule.startDate && !rule.endDate) return true
				return (
					(rule.startDate || "0000-01-01") <= selection.to &&
					(rule.endDate || "9999-12-31") >= selection.from
				)
			}),
		[rules, selection]
	)
	const visibleRules = useMemo(() => {
		if (activeAction === "history") {
			return [...selectedRules].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
		}
		if (activeAction === "conflicts") {
			const conflictingIds = new Set<string>()
			for (let leftIndex = 0; leftIndex < selectedRules.length; leftIndex += 1) {
				for (let rightIndex = leftIndex + 1; rightIndex < selectedRules.length; rightIndex += 1) {
					const left = selectedRules[leftIndex]
					const right = selectedRules[rightIndex]
					if (!left.isActive || !right.isActive || left.category !== right.category) continue
					const overlaps =
						(left.startDate || "0000-01-01") <= (right.endDate || "9999-12-31") &&
						(right.startDate || "0000-01-01") <= (left.endDate || "9999-12-31")
					if (overlaps && (left.type === right.type || left.priority === right.priority)) {
						conflictingIds.add(left.id)
						conflictingIds.add(right.id)
					}
				}
			}
			return selectedRules.filter((rule) => conflictingIds.has(rule.id))
		}
		return [...selectedRules].sort((left, right) => Number(right.isActive) - Number(left.isActive))
	}, [activeAction, selectedRules])

	async function mutateRule(
		rule: MultiCalendarAppliedRule,
		action: string,
		values?: { startDate: string; endDate: string; value: string; priority: string }
	) {
		const form = new FormData()
		form.set("action", action)
		form.set("ruleId", rule.id)
		form.set("category", rule.category)
		form.set("scope", rule.scope)
		form.set("scopeId", rule.scopeId)
		form.set("ratePlanId", rule.ratePlanId)
		form.set("type", rule.type)
		form.set("value", values?.value ?? String(rule.value ?? ""))
		form.set("startDate", values?.startDate ?? rule.startDate)
		form.set("endDate", values?.endDate ?? rule.endDate)
		form.set("priority", values?.priority ?? String(rule.priority))
		form.set("contextKey", rule.contextKey || "")
		form.set("isActive", String(rule.isActive))
		rule.validDays.forEach((day) => form.append("validDays", String(day)))
		setLoading(true)
		try {
			const response = await fetch("/api/rates/commercial-rules", {
				method: "POST",
				body: form,
				headers: { Accept: "application/json" },
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok) throw new Error(body?.error || "No se pudo actualizar la regla")
			await loadWorkspace({}, [rule.ratePlanId || rule.scopeId])
			setEditingRule(null)
			setFeedback("Regla actualizada.")
		} catch (error) {
			setFeedback((error as Error).message)
		} finally {
			setLoading(false)
		}
	}

	const actions = ACTIONS[activeTab]
	const selectedRows = [
		...new Map(selection.cells.map(({ row }) => [row.ratePlanId, row])).values(),
	]

	return (
		<div className="space-y-5" aria-busy={loading}>
			<section className="rounded-xl border border-white/70 bg-white/95 p-4 text-slate-900 shadow-xl shadow-slate-950/5">
				<form
					onSubmit={(event) => {
						event.preventDefault()
						void loadWorkspace({
							productId: filters.productId,
							variantId: filters.variantId,
							ratePlanId: filters.ratePlanId,
							status: filters.status,
						})
					}}
					className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_0.8fr_auto] lg:items-end"
				>
					{(["productId", "variantId", "ratePlanId"] as const).map((key) => (
						<label key={key} className="space-y-1 text-sm">
							<span className="text-xs font-semibold text-slate-500">
								{key === "productId" ? "Hotel" : key === "variantId" ? "Habitación" : "Tarifa"}
							</span>
							<select
								value={filters[key]}
								onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
								className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
							>
								<option value="">
									{key === "productId"
										? "Todos los hoteles"
										: key === "variantId"
											? "Todas las habitaciones"
											: "Todas las tarifas"}
								</option>
								{(key === "productId"
									? surface.options.products
									: key === "variantId"
										? surface.options.variants
										: surface.options.ratePlans
								).map((option) => (
									<option key={option.id} value={option.id}>
										{"productName" in option
											? `${option.productName} · ${option.name}`
											: option.name}
									</option>
								))}
							</select>
						</label>
					))}
					<label className="space-y-1 text-sm">
						<span className="text-xs font-semibold text-slate-500">Estado</span>
						<select
							value={filters.status}
							onChange={(event) =>
								setFilters({ ...filters, status: event.target.value as typeof filters.status })
							}
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
						>
							<option value="all">Todas</option>
							<option value="ready">Listas</option>
							<option value="attention">Con pendientes</option>
						</select>
					</label>
					<button
						className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
						disabled={loading}
					>
						Filtrar
					</button>
				</form>
				<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
					<div className="flex items-center gap-2">
						<button
							type="button"
							disabled={!surface.previousMonth || loading}
							onClick={() => void loadWorkspace({ month: surface.previousMonth })}
							className="h-9 w-9 rounded-lg border border-slate-200 disabled:opacity-30"
							aria-label="Mes anterior"
						>
							‹
						</button>
						<div>
							<p className="font-semibold text-slate-950">
								{formatRange(surface.startDate, surface.endDate)}
							</p>
							<p className="text-xs text-slate-500">
								{surface.stats.totalRows} tarifas · {surface.stats.attentionRows} con pendientes
							</p>
						</div>
						<button
							type="button"
							disabled={loading}
							onClick={() => void loadWorkspace({ month: surface.nextMonth })}
							className="h-9 w-9 rounded-lg border border-slate-200"
							aria-label="Mes siguiente"
						>
							›
						</button>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{[
							["visible_weekend", "Fin de semana"],
							["visible_month", "Vista visible"],
							["next_7", "Prox. 7 días"],
							["next_30", "Prox. 30 días"],
						].map(([id, label]) => (
							<button
								key={id}
								type="button"
								onClick={() => applyPreset(id)}
								className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
							>
								{label}
							</button>
						))}
					</div>
				</div>
				<div
					className="mt-4 flex gap-1.5 overflow-x-auto border-t border-slate-200 pt-4"
					role="tablist"
				>
					{TABS.map((tab) => (
						<button
							key={tab.key}
							type="button"
							role="tab"
							onClick={() => changeTab(tab.key)}
							aria-selected={activeTab === tab.key}
							className={`min-w-36 rounded-lg border px-3 py-2 text-left text-sm transition ${activeTab === tab.key ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
						>
							<span className="block font-semibold">{tab.label}</span>
							<span
								className={`mt-0.5 block text-xs ${activeTab === tab.key ? "text-slate-300" : "text-slate-500"}`}
							>
								{tab.helper}
							</span>
						</button>
					))}
				</div>
				{selection.cells.length > 0 && (
					<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
						<div>
							<p className="text-sm font-semibold text-slate-950">
								{selection.cells.length}{" "}
								{selection.cells.length === 1 ? "celda seleccionada" : "celdas seleccionadas"}
							</p>
							<p className="text-xs text-slate-500">
								{formatRange(selection.from, selection.to, true)} · {selection.ratePlanIds.length}{" "}
								{selection.ratePlanIds.length === 1 ? "tarifa" : "tarifas"}
							</p>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{actions.map((action) => (
								<button
									key={action.id}
									type="button"
									onClick={() => openAction(action.id)}
									className={`rounded-lg border px-3 py-2 text-xs font-semibold ${activeAction === action.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
								>
									{action.label}
								</button>
							))}
							<button
								type="button"
								onClick={() => setSelected(new Set())}
								className="px-3 py-2 text-xs font-semibold text-slate-500"
							>
								Limpiar
							</button>
						</div>
					</div>
				)}
				{feedback && !drawerOpen && <p className="mt-3 text-sm text-red-700">{feedback}</p>}
			</section>

			<section className="overflow-hidden rounded-xl border border-white/70 bg-white text-slate-900 shadow-xl shadow-slate-950/5">
				<div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
					<div>
						<h2 className="font-semibold text-slate-950">Operación por tarifa</h2>
						<p className="text-sm text-slate-500">
							Selecciona fechas o tarifas para operar en escala.
						</p>
					</div>
					{loading && <span className="text-xs font-semibold text-slate-500">Actualizando...</span>}
				</div>
				{surface.rows.length === 0 ? (
					<div className="p-10 text-center text-sm text-slate-500">
						No hay tarifas para esta vista.
					</div>
				) : (
					<div className="overflow-x-auto">
						<div
							className="grid min-w-max bg-slate-100/70"
							style={{
								gridTemplateColumns: `18rem repeat(${surface.days.length}, minmax(6.25rem, 1fr))`,
							}}
						>
							<div className="sticky left-0 z-20 border-r border-b border-slate-200 bg-white p-3 text-xs font-semibold text-slate-500 uppercase">
								Tarifa
							</div>
							{surface.days.map((day) => (
								<div
									key={day.date}
									className="border-b border-slate-200 bg-slate-50 p-2 text-center"
								>
									<button
										type="button"
										onClick={() =>
											toggleMany(
												surface.rows.flatMap((row) =>
													row.cells.some((cell) => cell.date === day.date && !cell.isPast)
														? [`${row.ratePlanId}:${day.date}`]
														: []
												)
											)
										}
										className="rounded-md px-2 py-1 hover:bg-white"
									>
										<p className="text-[10px] font-semibold text-slate-500 uppercase">
											{day.weekday}
										</p>
										<p className="text-sm font-semibold text-slate-950">{day.day}</p>
										<p className="text-[10px] text-slate-400">{day.monthLabel}</p>
									</button>
								</div>
							))}
							{surface.rows.map((row) => (
								<CalendarRow
									key={row.ratePlanId}
									row={row}
									tab={activeTab}
									selected={selected}
									onToggle={toggleCell}
									onToggleRow={(id) =>
										toggleMany(
											row.cells.filter((cell) => !cell.isPast).map((cell) => `${id}:${cell.date}`)
										)
									}
								/>
							))}
						</div>
					</div>
				)}
			</section>

			{drawerOpen && (
				<>
					<button
						type="button"
						aria-label="Cerrar panel"
						className="fixed inset-0 z-40 bg-slate-950/40"
						onClick={() => setDrawerOpen(false)}
					/>
					<aside className="fixed top-0 right-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
						<div className="flex items-start justify-between gap-4">
							<div>
								<p className="text-xs font-semibold text-slate-500 uppercase">Selección</p>
								<h2 className="mt-1 text-xl font-semibold text-slate-950">
									{PRICE_ACTIONS[activeAction]?.title ||
										ACTIONS[activeTab].find((item) => item.id === activeAction)?.label ||
										"Detalle"}
								</h2>
								<p className="mt-1 text-sm text-slate-500">
									{formatRange(selection.from, selection.to, true)} · {selection.ratePlanIds.length}{" "}
									{selection.ratePlanIds.length === 1 ? "tarifa" : "tarifas"}
								</p>
							</div>
							<button
								type="button"
								onClick={() => setDrawerOpen(false)}
								className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600"
							>
								Cerrar
							</button>
						</div>
						<div className="mt-5 rounded-lg border border-slate-200 p-4">
							<p className="font-semibold text-slate-950">
								{selection.ratePlanIds.length === 1
									? selection.cells[0]?.row.ratePlanName
									: `${selection.ratePlanIds.length} tarifas seleccionadas`}
							</p>
							<p className="mt-1 text-sm text-slate-600">
								{selection.cells.length} noches-tarifa impactadas
							</p>
						</div>
						{PRICE_ACTIONS[activeAction] && (
							<div className="mt-5 space-y-4">
								<div className="grid grid-cols-3 gap-2">
									{(!PRICE_ACTIONS[activeAction].fixedMode
										? [
												["percentage_markup", "Subir %"],
												["percentage_discount", "Bajar %"],
												["fixed_override", "Precio fijo"],
											]
										: [[PRICE_ACTIONS[activeAction].fixedMode!, "% descuento"]]
									).map(([mode, label]) => (
										<button
											key={mode}
											type="button"
											onClick={() => {
												setPriceMode(mode)
												setPreviewReady(false)
											}}
											className={`rounded-lg border px-3 py-2 text-sm font-semibold ${priceMode === mode ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200"}`}
										>
											{label}
										</button>
									))}
								</div>
								<label className="block text-sm font-medium text-slate-700">
									Valor
									<input
										type="number"
										min="0"
										value={value}
										onChange={(event) => {
											setValue(event.target.value)
											setPreviewReady(false)
										}}
										className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
									/>
								</label>
								<div className="grid grid-cols-2 gap-2">
									<button
										type="button"
										onClick={() => {
											setPreviewReady(true)
											setFeedback(`Se aplicará a ${selection.cells.length} noches-tarifa.`)
										}}
										className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold"
									>
										Revisar
									</button>
									<button
										type="button"
										disabled={loading || !previewReady}
										onClick={() => void savePrice()}
										className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
									>
										Guardar
									</button>
								</div>
							</div>
						)}
						{activeAction === "availability_units" && (
							<div className="mt-5 space-y-4">
								<label className="block text-sm font-medium text-slate-700">
									Cupo físico total
									<input
										type="number"
										min="0"
										value={value}
										onChange={(event) => {
											setValue(event.target.value)
											setPreviewReady(false)
										}}
										className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
									/>
								</label>
								<div className="grid grid-cols-2 gap-2">
									<button
										type="button"
										onClick={() => {
											setPreviewReady(true)
											setFeedback(`Se actualizarán ${selection.variantIds.length} habitaciones.`)
										}}
										className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold"
									>
										Revisar
									</button>
									<button
										type="button"
										disabled={loading || !previewReady}
										onClick={() => void saveAvailability()}
										className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
									>
										Guardar
									</button>
								</div>
							</div>
						)}
						{[
							"availability_block",
							"stop_sell",
							"min_lead_time",
							"max_lead_time",
							"min_los",
							"max_los",
							"cta",
							"ctd",
						].includes(activeAction) && (
							<div className="mt-5 space-y-4">
								<p className="text-sm text-slate-600">
									La regla se aplicará a la selección y permanecerá activa durante este periodo.
								</p>
								{["min_lead_time", "max_lead_time", "min_los", "max_los"].includes(
									activeAction
								) && (
									<label className="block text-sm font-medium text-slate-700">
										Valor
										<input
											type="number"
											min="1"
											value={value}
											onChange={(event) => {
												setValue(event.target.value)
												setPreviewReady(false)
											}}
											className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
										/>
									</label>
								)}
								<div className="grid grid-cols-2 gap-2">
									<button
										type="button"
										onClick={() => {
											setPreviewReady(true)
											setFeedback(`La regla afectará ${selection.cells.length} noches-tarifa.`)
										}}
										className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold"
									>
										Revisar
									</button>
									<button
										type="button"
										disabled={loading || !previewReady}
										onClick={() => void saveSellabilityRule()}
										className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
									>
										Guardar regla
									</button>
								</div>
							</div>
						)}
						{activeTab === "conditions" && (
							<div className="mt-5 space-y-3">
								{selectedRows.map((row) => {
									const missing = row.cells[0]?.conditionsMissingCategories || []
									return (
										<article
											key={row.ratePlanId}
											className={`rounded-lg border p-4 ${missing.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}
										>
											<div className="flex items-start justify-between gap-3">
												<div>
													<p className="font-semibold text-slate-950">{row.ratePlanName}</p>
													<p className="text-xs text-slate-500">
														{row.productName} · {row.variantName}
													</p>
												</div>
												<span className="text-xs font-semibold">{4 - missing.length}/4</span>
											</div>
											<p className="mt-3 text-sm text-slate-700">
												{row.cells[0]?.conditionsSummary}
											</p>
											<div className="mt-3 flex flex-wrap gap-2">
												{missing.map((category) =>
													category === "CheckIn" ? (
														<a
															key={category}
															href={`/provider/house-rules?productId=${encodeURIComponent(row.productId)}&focus=arrival`}
															className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
														>
															Configurar llegada y salida
														</a>
													) : (
														<button
															key={category}
															type="button"
															className="policy-assignment-open rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
															data-assignment-mode="preset"
															data-assignment-scope="rate_plan"
															data-assignment-scope-id={row.ratePlanId}
															data-assignment-category={category}
														>
															Completar {category}
														</button>
													)
												)}
												<a
													href={row.policiesHref}
													className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
												>
													{missing.length ? "Abrir contrato completo" : "Editar contrato"}
												</a>
											</div>
										</article>
									)
								})}
							</div>
						)}
						{activeTab === "rules" && (
							<div className="mt-5 space-y-3">
								{visibleRules.length === 0 ? (
									<p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
										{activeAction === "conflicts"
											? "No hay conflictos en esta selección."
											: "No hay reglas en esta selección."}
									</p>
								) : (
									visibleRules.map((rule) => (
										<article key={rule.id} className="rounded-lg border border-slate-200 p-4">
											<div className="flex justify-between gap-3">
												<div>
													<span
														className={`rounded-md px-2 py-1 text-[11px] font-semibold ${rule.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
													>
														{rule.isActive ? "Activa" : "Pausada"}
													</span>
													<h3 className="mt-2 font-semibold text-slate-950">{rule.typeLabel}</h3>
													<p className="text-xs text-slate-500">{rule.targetName}</p>
												</div>
												<span className="text-xs font-semibold text-slate-700">
													{rule.valueLabel}
												</span>
											</div>
											<p className="mt-3 text-xs text-slate-600">
												Vigencia: {formatRange(rule.startDate, rule.endDate)}
											</p>
											<div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
												<button
													type="button"
													onClick={() => {
														setEditingMode("edit")
														setEditingRule(rule)
													}}
													className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
												>
													Editar
												</button>
												<button
													type="button"
													onClick={() => void mutateRule(rule, "toggle-rule")}
													className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
												>
													{rule.isActive ? "Pausar" : "Activar"}
												</button>
												{rule.category === "price" && (
													<button
														type="button"
														onClick={() => {
															setEditingMode("variant")
															setEditingRule(rule)
														}}
														className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
													>
														Crear variante
													</button>
												)}
												<button
													type="button"
													onClick={() => {
														if (window.confirm("¿Eliminar esta regla?"))
															void mutateRule(rule, "delete-rule")
													}}
													className="ml-auto rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
												>
													Eliminar
												</button>
											</div>
											{editingRule?.id === rule.id && (
												<RuleEditor
													rule={rule}
													mode={editingMode}
													loading={loading}
													onCancel={() => setEditingRule(null)}
													onSave={(values) =>
														void mutateRule(
															rule,
															editingMode === "variant" ? "create-variant" : "update-rule",
															values
														)
													}
												/>
											)}
										</article>
									))
								)}
							</div>
						)}
						{feedback && (
							<p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
								{feedback}
							</p>
						)}
					</aside>
				</>
			)}
		</div>
	)
}

function RuleEditor({
	rule,
	mode,
	loading,
	onCancel,
	onSave,
}: {
	rule: MultiCalendarAppliedRule
	mode: "edit" | "variant"
	loading: boolean
	onCancel: () => void
	onSave: (values: { startDate: string; endDate: string; value: string; priority: string }) => void
}) {
	const [startDate, setStartDate] = useState(rule.startDate)
	const [endDate, setEndDate] = useState(rule.endDate)
	const [value, setValue] = useState(String(rule.value ?? ""))
	const [priority, setPriority] = useState(String(rule.priority))
	return (
		<div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-3">
			<p className="text-xs font-semibold text-slate-500 uppercase">
				{mode === "variant" ? "Nueva variante" : "Editar regla"}
			</p>
			<div className="grid grid-cols-2 gap-2">
				<label className="text-xs font-medium text-slate-600">
					Desde
					<input
						type="date"
						value={startDate}
						onChange={(event) => setStartDate(event.target.value)}
						className="mt-1 w-full rounded-md border border-slate-300 p-2"
					/>
				</label>
				<label className="text-xs font-medium text-slate-600">
					Hasta
					<input
						type="date"
						value={endDate}
						onChange={(event) => setEndDate(event.target.value)}
						className="mt-1 w-full rounded-md border border-slate-300 p-2"
					/>
				</label>
			</div>
			{rule.value != null && (
				<label className="block text-xs font-medium text-slate-600">
					Valor
					<input
						type="number"
						value={value}
						onChange={(event) => setValue(event.target.value)}
						className="mt-1 w-full rounded-md border border-slate-300 p-2"
					/>
				</label>
			)}
			<label className="block text-xs font-medium text-slate-600">
				Prioridad
				<input
					type="number"
					min="0"
					max="1000"
					value={priority}
					onChange={(event) => setPriority(event.target.value)}
					className="mt-1 w-full rounded-md border border-slate-300 p-2"
				/>
			</label>
			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={onCancel}
					className="rounded-md px-3 py-2 text-xs font-semibold text-slate-600"
				>
					Cancelar
				</button>
				<button
					type="button"
					disabled={loading}
					onClick={() => onSave({ startDate, endDate, value, priority })}
					className="rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
				>
					{mode === "variant" ? "Guardar variante" : "Guardar cambios"}
				</button>
			</div>
		</div>
	)
}
