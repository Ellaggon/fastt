/** @jsxRuntime classic */
import React, { type ReactNode, useEffect, useState } from "react"

import { Button } from "@/components/ui-react"

type Props = {
	title: string
	meta: string
	children: ReactNode
	onClose: () => void
}

export default function CalendarResponsiveDrawer({ title, meta, children, onClose }: Props) {
	const [closing, setClosing] = useState(false)

	function requestClose() {
		if (closing) return
		setClosing(true)
		window.setTimeout(onClose, 180)
	}

	useEffect(() => {
		const previousOverflow = document.body.style.overflow
		document.body.style.overflow = "hidden"
		document.querySelector<HTMLButtonElement>("[data-calendar-drawer-close]")?.focus()
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
				aria-label="Cerrar panel"
				data-closing={closing}
				className="calendar-backdrop fixed inset-0 z-40 bg-slate-950/40"
				onClick={requestClose}
			/>
			<aside
				role="dialog"
				aria-modal="true"
				aria-labelledby="calendar-drawer-title"
				data-closing={closing}
				className="calendar-drawer fastt-side-sheet fixed top-0 right-0 z-50 h-full w-full max-w-md overflow-y-auto p-5 text-slate-900"
			>
				<span className="calendar-drawer-handle" aria-hidden="true" />
				<div className="fastt-side-sheet-header -mx-5 -mt-5 flex items-start justify-between gap-4 px-5 py-5">
					<div className="min-w-0">
						<p className="text-xs font-semibold text-slate-500 uppercase">Selección</p>
						<h2 id="calendar-drawer-title" className="mt-1 text-xl font-semibold text-slate-950">
							{title}
						</h2>
						<p className="mt-1 text-sm text-slate-500">{meta}</p>
					</div>
					<Button
						type="button"
						onClick={requestClose}
						variant="secondary"
						size="sm"
						data-calendar-drawer-close
					>
						Cerrar
					</Button>
				</div>
				{children}
			</aside>
		</>
	)
}
