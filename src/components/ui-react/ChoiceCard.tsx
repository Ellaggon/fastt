import type { ButtonHTMLAttributes, ReactNode } from "react"

import { cn } from "./utils"

type ChoiceCardProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	selected?: boolean
	children: ReactNode
}

export default function ChoiceCard({
	selected = false,
	className,
	children,
	...props
}: ChoiceCardProps) {
	const { "aria-pressed": ariaPressed, ...buttonProps } = props

	return (
		<button
			type="button"
			aria-pressed={ariaPressed ?? selected}
			className={cn(
				"fastt-row-card rounded-[var(--fastt-radius-card)] border px-4 py-4 pr-12 text-left transition focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 focus:outline-none",
				selected
					? "border-slate-950 bg-slate-50 shadow-[0_0_0_1px_rgba(15,23,42,0.18),0_10px_24px_rgba(15,23,42,0.08)]"
					: "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50",
				className
			)}
			{...buttonProps}
		>
			<span
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute top-3 right-3 rounded-full px-2 py-0.5 text-[11px] font-semibold transition",
					selected
						? "bg-slate-950 text-white opacity-100"
						: "bg-transparent text-transparent opacity-0"
				)}
			>
				✓
			</span>
			{children}
		</button>
	)
}
