import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react"

import { cn } from "./utils"

type SegmentedControlProps = HTMLAttributes<HTMLDivElement> & {
	children: ReactNode
}

type SegmentedItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	active?: boolean
	children: ReactNode
}

export function SegmentedControl({ className, children, ...props }: SegmentedControlProps) {
	return (
		<div
			className={cn(
				"fastt-segmented-control fastt-tabs flex gap-1 overflow-x-auto bg-slate-100 p-1",
				className
			)}
			{...props}
		>
			{children}
		</div>
	)
}

export function SegmentedItem({
	active = false,
	className,
	children,
	...props
}: SegmentedItemProps) {
	return (
		<button
			type="button"
			data-active={active}
			aria-pressed={active}
			className={cn(
				"fastt-segmented-item min-h-8 shrink-0 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-950",
				className
			)}
			{...props}
		>
			{children}
		</button>
	)
}
