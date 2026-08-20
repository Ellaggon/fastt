import type { HTMLAttributes, ReactNode } from "react"

import { cn } from "./utils"

type FloatingPopoverPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end"

type FloatingPopoverProps = HTMLAttributes<HTMLDivElement> & {
	title: string
	children: ReactNode
	placement?: FloatingPopoverPlacement
	role?: "status" | "tooltip"
}

const placementClass: Record<FloatingPopoverPlacement, string> = {
	"bottom-start": "top-full left-0 mt-2",
	"bottom-end": "top-full right-0 mt-2",
	"top-start": "bottom-full left-0 mb-2",
	"top-end": "right-0 bottom-full mb-2",
}

/** A compact, anchored explanation that never changes its parent layout. */
export default function FloatingPopover({
	title,
	children,
	placement = "bottom-start",
	role = "status",
	className,
	...props
}: FloatingPopoverProps) {
	return (
		<div
			role={role}
			aria-live={role === "status" ? "polite" : undefined}
			className={cn(
				"absolute z-30 w-72 max-w-[calc(100vw-2rem)] rounded-[var(--fastt-radius-card)] border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5 text-slate-600 shadow-lg",
				placementClass[placement],
				className
			)}
			{...props}
		>
			<p className="font-semibold text-slate-950">{title}</p>
			<div className="mt-0.5">{children}</div>
		</div>
	)
}
