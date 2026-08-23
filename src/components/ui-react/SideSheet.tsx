import { type ReactNode, useEffect, useId, useState } from "react"

import IconButton from "./IconButton"
import { cn } from "./utils"

type Props = {
	eyebrow?: string
	title: string
	description?: string
	closeLabel?: string
	className?: string
	children: ReactNode
	onClose: () => void
}

export default function SideSheet({
	eyebrow,
	title,
	description,
	closeLabel = "Cerrar panel",
	className,
	children,
	onClose,
}: Props) {
	const titleId = useId()
	const [closing, setClosing] = useState(false)

	function requestClose() {
		if (closing) return
		setClosing(true)
		window.setTimeout(onClose, 180)
	}

	useEffect(() => {
		const previousOverflow = document.body.style.overflow
		document.body.style.overflow = "hidden"
		document.querySelector<HTMLButtonElement>("[data-side-sheet-close]")?.focus()
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") requestClose()
		}
		document.addEventListener("keydown", handleKeyDown)
		return () => {
			document.body.style.overflow = previousOverflow
			document.removeEventListener("keydown", handleKeyDown)
		}
	}, [])

	return (
		<>
			<button
				type="button"
				aria-label={closeLabel}
				data-closing={closing}
				className="fastt-modal-backdrop fastt-drawer-overlay calendar-backdrop fixed inset-0 z-40"
				onClick={requestClose}
			/>
			<aside
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				data-closing={closing}
				className={cn(
					"calendar-drawer fastt-side-sheet fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col overflow-hidden text-slate-900",
					className
				)}
			>
				<span className="calendar-drawer-handle" aria-hidden="true" />
				<header className="fastt-side-sheet-header flex items-start justify-between gap-4 px-5 py-5">
					<div className="min-w-0">
						{eyebrow ? (
							<p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
								{eyebrow}
							</p>
						) : null}
						<h2
							id={titleId}
							className={
								eyebrow
									? "mt-1 text-xl font-semibold text-slate-950"
									: "text-xl font-semibold text-slate-950"
							}
						>
							{title}
						</h2>
						{description ? (
							<p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
						) : null}
					</div>
					<IconButton
						label={closeLabel}
						variant="secondary"
						size="sm"
						className="fastt-modal-close shrink-0"
						data-drawer-close
						data-side-sheet-close
						onClick={requestClose}
					>
						×
					</IconButton>
				</header>
				<div className="fastt-drawer-body">{children}</div>
			</aside>
		</>
	)
}
