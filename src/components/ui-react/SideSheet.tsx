import { type ReactNode, useEffect, useId, useState } from "react"

import Button from "./Button"

type Props = {
	eyebrow?: string
	title: string
	description?: string
	children: ReactNode
	onClose: () => void
}

export default function SideSheet({ eyebrow, title, description, children, onClose }: Props) {
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
				aria-label="Cerrar panel"
				data-closing={closing}
				className="calendar-backdrop fixed inset-0 z-40 bg-slate-950/40"
				onClick={requestClose}
			/>
			<aside
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				data-closing={closing}
				className="calendar-drawer fastt-side-sheet fixed top-0 right-0 z-50 h-full w-full max-w-md overflow-y-auto p-5 text-slate-900"
			>
				<span className="calendar-drawer-handle" aria-hidden="true" />
				<header className="fastt-side-sheet-header -mx-5 -mt-5 flex items-start justify-between gap-4 px-5 py-5">
					<div className="min-w-0">
						{eyebrow ? (
							<p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
								{eyebrow}
							</p>
						) : null}
						<h2 id={titleId} className="mt-1 text-xl font-semibold text-slate-950">
							{title}
						</h2>
						{description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
					</div>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						data-side-sheet-close
						onClick={requestClose}
					>
						Cerrar
					</Button>
				</header>
				<div className="py-5">{children}</div>
			</aside>
		</>
	)
}
