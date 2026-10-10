import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import Button from "./Button"
import { cn } from "./utils"

type Props = {
	id?: string
	label: string
	value: string
	onChange: (value: string) => void
	min?: string
	max?: string
	required?: boolean
	placeholder?: string
	error?: string
	compact?: boolean
	disabled?: boolean
	className?: string
}

type PanelCoords = { top: number; left: number; width: number; placement: "above" | "below" }

function formatIsoDate(date: Date) {
	return date.toISOString().slice(0, 10)
}

function parseIsoDate(value?: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null
	const parsed = new Date(`${value}T00:00:00.000Z`)
	if (Number.isNaN(parsed.getTime()) || formatIsoDate(parsed) !== value) return null
	return parsed
}

function monthLabel(date: Date) {
	return date.toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" })
}

function mondayStartOffset(date: Date) {
	const sundayBased = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).getUTCDay()
	return (sundayBased + 6) % 7
}

function formatDisplayDate(value: string, placeholder: string) {
	const parsed = parseIsoDate(value)
	if (!parsed) return placeholder
	return parsed.toLocaleDateString("es-CL", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	})
}

const PANEL_WIDTH = 288
const PANEL_ESTIMATED_HEIGHT = 320
const VIEWPORT_GAP = 8

function placePanel(trigger: DOMRect, panelHeight = PANEL_ESTIMATED_HEIGHT): PanelCoords {
	const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_GAP * 2)
	let left = trigger.left
	if (left + width > window.innerWidth - VIEWPORT_GAP) {
		left = Math.max(VIEWPORT_GAP, window.innerWidth - VIEWPORT_GAP - width)
	}
	const spaceBelow = window.innerHeight - trigger.bottom - VIEWPORT_GAP
	const spaceAbove = trigger.top - VIEWPORT_GAP
	const fitsBelow = spaceBelow >= panelHeight
	const fitsAbove = spaceAbove >= panelHeight
	const openAbove = !fitsBelow && (fitsAbove || spaceAbove > spaceBelow)
	const top = openAbove
		? Math.max(VIEWPORT_GAP, trigger.top - panelHeight - 8)
		: Math.min(trigger.bottom + 8, window.innerHeight - panelHeight - VIEWPORT_GAP)
	return { top, left, width, placement: openAbove ? "above" : "below" }
}

export default function DatesModal({
	id,
	label,
	value,
	onChange,
	min,
	max,
	required = false,
	placeholder = "Seleccionar fecha",
	error,
	compact = false,
	disabled = false,
	className,
}: Props) {
	const [open, setOpen] = useState(false)
	const [coords, setCoords] = useState<PanelCoords | null>(null)
	const generatedId = useId()
	const triggerId = id ?? generatedId
	const panelId = `${triggerId}-panel`
	const rootRef = useRef<HTMLDivElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const panelRef = useRef<HTMLDivElement>(null)
	const selected = parseIsoDate(value)
	const minDate = parseIsoDate(min)
	const maxDate = parseIsoDate(max)
	const today = useMemo(() => new Date(), [])
	const [currentMonth, setCurrentMonth] = useState(() => {
		const initial = selected ?? today
		return new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1))
	})

	useEffect(() => {
		const parsed = parseIsoDate(value)
		if (!parsed) return
		setCurrentMonth(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)))
	}, [value])

	useEffect(() => {
		if (disabled) setOpen(false)
	}, [disabled])

	useLayoutEffect(() => {
		if (!open) {
			setCoords(null)
			return
		}
		function sync() {
			const trigger = triggerRef.current
			if (!trigger) return
			const measured = panelRef.current?.getBoundingClientRect().height
			setCoords(placePanel(trigger.getBoundingClientRect(), measured || PANEL_ESTIMATED_HEIGHT))
		}
		sync()
		const raf = requestAnimationFrame(sync)
		window.addEventListener("resize", sync)
		window.addEventListener("scroll", sync, true)
		return () => {
			cancelAnimationFrame(raf)
			window.removeEventListener("resize", sync)
			window.removeEventListener("scroll", sync, true)
		}
	}, [open, currentMonth])

	useEffect(() => {
		if (!open) return
		function onPointerDown(event: MouseEvent) {
			const target = event.target as Node
			if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
			setOpen(false)
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setOpen(false)
		}
		document.addEventListener("mousedown", onPointerDown)
		document.addEventListener("keydown", onKeyDown)
		return () => {
			document.removeEventListener("mousedown", onPointerDown)
			document.removeEventListener("keydown", onKeyDown)
		}
	}, [open])

	const days = useMemo(() => {
		const year = currentMonth.getUTCFullYear()
		const month = currentMonth.getUTCMonth()
		const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
		const offset = mondayStartOffset(currentMonth)
		const cells: Array<{ iso: string; day: number; disabled: boolean } | null> = []
		for (let i = 0; i < offset; i++) cells.push(null)
		for (let day = 1; day <= totalDays; day++) {
			const date = new Date(Date.UTC(year, month, day))
			const iso = formatIsoDate(date)
			cells.push({
				iso,
				day,
				disabled: Boolean((minDate && date < minDate) || (maxDate && date > maxDate)),
			})
		}
		return cells
	}, [currentMonth, minDate, maxDate])

	const panel =
		open && coords ? (
			<>
				<div
					className="fastt-dates-modal-backdrop fixed inset-0 z-[319] bg-slate-900/[0.06] motion-reduce:bg-transparent"
					aria-hidden="true"
					onClick={() => setOpen(false)}
				/>
				<div
					ref={panelRef}
					id={panelId}
					role="dialog"
					aria-label={label}
					data-placement={coords.placement}
					className="fastt-dates-modal-panel fixed z-[320] rounded-2xl border border-slate-200/90 bg-white p-3 shadow-[0_8px_30px_rgb(15_23_42_/_12%)] ring-1 ring-slate-200/60 motion-reduce:animate-none"
					style={{ top: coords.top, left: coords.left, width: coords.width }}
				>
					<div className="mb-2 flex items-center justify-between gap-2">
						<button
							type="button"
							className="rounded-full p-1 text-slate-600 hover:bg-slate-100"
							aria-label="Mes anterior"
							onClick={() =>
								setCurrentMonth(
									new Date(
										Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - 1, 1)
									)
								)
							}
						>
							‹
						</button>
						<p className="text-sm font-semibold text-slate-900">{monthLabel(currentMonth)}</p>
						<button
							type="button"
							className="rounded-full p-1 text-slate-600 hover:bg-slate-100"
							aria-label="Mes siguiente"
							onClick={() =>
								setCurrentMonth(
									new Date(
										Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() + 1, 1)
									)
								)
							}
						>
							›
						</button>
					</div>
					<div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
						<span>L</span>
						<span>M</span>
						<span>X</span>
						<span>J</span>
						<span>V</span>
						<span>S</span>
						<span>D</span>
					</div>
					<div className="grid grid-cols-7 gap-1">
						{days.map((cell, index) =>
							cell ? (
								<button
									key={cell.iso}
									type="button"
									disabled={cell.disabled}
									className={cn(
										"h-8 rounded text-xs text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30",
										value === cell.iso && "bg-slate-950 text-white hover:bg-slate-950"
									)}
									onClick={() => {
										onChange(cell.iso)
										setOpen(false)
									}}
								>
									{cell.day}
								</button>
							) : (
								<span key={`pad-${index}`} className="h-8" />
							)
						)}
					</div>
					<div className="mt-3 flex items-center justify-between gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => {
								onChange("")
							}}
						>
							Limpiar
						</Button>
						<Button type="button" size="sm" onClick={() => setOpen(false)}>
							Listo
						</Button>
					</div>
				</div>
			</>
		) : null

	return (
		<div ref={rootRef} className={cn("relative h-full min-w-0", className)}>
			<button
				ref={triggerRef}
				type="button"
				id={triggerId}
				disabled={disabled}
				className={cn(
					"fastt-prompt-field h-full w-full text-left",
					compact && "fastt-prompt-field--compact",
					open && !disabled && "fastt-prompt-field--open",
					error && "fastt-prompt-field--invalid",
					disabled && "cursor-not-allowed opacity-60"
				)}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={panelId}
				aria-invalid={Boolean(error)}
				onClick={() => {
					if (!disabled) setOpen((current) => !current)
				}}
			>
				<span className="fastt-prompt-field__copy">
					<span className="fastt-prompt-field__label">
						{label}
						{required ? (
							<span className="fastt-prompt-field__required" aria-hidden="true">
								*
							</span>
						) : null}
					</span>
					<span className="fastt-prompt-field__value">{formatDisplayDate(value, placeholder)}</span>
				</span>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					className="h-4 w-4 shrink-0 text-slate-500"
					viewBox="0 0 20 20"
					fill="currentColor"
					aria-hidden="true"
				>
					<path
						fillRule="evenodd"
						d="M6 2a1 1 0 112 0v1h4V2a1 1 0 112 0v1h1a2 2 0 012 2v2H3V5a2 2 0 012-2h1V2zm11 7H3v6a2 2 0 002 2h10a2 2 0 002-2V9z"
						clipRule="evenodd"
					/>
				</svg>
			</button>
			{typeof document !== "undefined" && panel ? createPortal(panel, document.body) : null}
			{error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
		</div>
	)
}
