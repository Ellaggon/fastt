import { useEffect, useId, useRef, useState } from "react"

import Button from "./Button"
import { cn } from "./utils"

type Props = {
	adults: number
	childrenCount: number
	rooms: number
	onAdultsChange: (value: number) => void
	onChildrenChange: (value: number) => void
	onRoomsChange: (value: number) => void
	label?: string
	id?: string
	className?: string
	compact?: boolean
}

const maxCount = 20

export function formatTravelersSummary(adults: number, childrenCount: number, rooms: number) {
	const adultsLabel = adults === 1 ? "1 adulto" : `${adults} adultos`
	const childrenLabel = childrenCount === 1 ? "1 niño" : `${childrenCount} niños`
	const roomsLabel = rooms === 1 ? "1 habitación" : `${rooms} habitaciones`
	return `${adultsLabel}, ${childrenLabel} · ${roomsLabel}`
}

export default function TravelersPicker({
	adults,
	childrenCount,
	rooms,
	onAdultsChange,
	onChildrenChange,
	onRoomsChange,
	label = "Huéspedes",
	id,
	className,
	compact = false,
}: Props) {
	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)
	const generatedId = useId()
	const triggerId = id ?? generatedId
	const panelId = `${triggerId}-panel`

	useEffect(() => {
		if (!open) return
		function onPointerDown(event: MouseEvent) {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
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

	return (
		<div ref={rootRef} className={cn("relative h-full min-w-0", className)}>
			<button
				type="button"
				id={triggerId}
				className={cn(
					"fastt-prompt-field h-full w-full text-left",
					compact && "fastt-prompt-field--compact"
				)}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((current) => !current)}
			>
				<span className="fastt-prompt-field__copy">
					<span className="fastt-prompt-field__label">{label}</span>
					<span className="fastt-prompt-field__value">
						{formatTravelersSummary(adults, childrenCount, rooms)}
					</span>
				</span>
			</button>
			{open ? (
				<div
					id={panelId}
					role="dialog"
					aria-label={label}
					className="fastt-soft-box absolute z-50 mt-1 w-full min-w-0 border border-slate-200 bg-white p-3 text-slate-900 shadow-[var(--fastt-shadow-row-hover)] sm:min-w-[19rem]"
				>
					<CountRow
						label="Adultos"
						hint="Edad 13+"
						value={adults}
						min={1}
						onChange={onAdultsChange}
					/>
					<CountRow
						label="Niños"
						hint="0-12"
						value={childrenCount}
						min={0}
						onChange={onChildrenChange}
					/>
					<CountRow
						label="Habitaciones o cantidad"
						value={rooms}
						min={1}
						onChange={onRoomsChange}
					/>
				</div>
			) : null}
		</div>
	)
}

function CountRow({
	label,
	hint,
	value,
	min,
	onChange,
}: {
	label: string
	hint?: string
	value: number
	min: number
	onChange: (value: number) => void
}) {
	return (
		<div className="mb-2 flex items-center justify-between gap-3 last:mb-0">
			<div>
				<div className="text-sm font-medium">{label}</div>
				{hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
			</div>
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="secondary"
					size="sm"
					aria-label={`Quitar ${label}`}
					disabled={value <= min}
					onClick={() => onChange(Math.max(min, value - 1))}
				>
					-
				</Button>
				<span className="min-w-6 text-center text-sm font-semibold">{value}</span>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					aria-label={`Añadir ${label}`}
					disabled={value >= maxCount}
					onClick={() => onChange(Math.min(maxCount, value + 1))}
				>
					+
				</Button>
			</div>
		</div>
	)
}
