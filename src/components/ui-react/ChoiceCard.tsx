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
	return (
		<button
			type="button"
			className={cn(
				"fastt-row-card rounded-[var(--fastt-radius-card)] border px-4 py-4 text-left transition focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 focus:outline-none",
				selected
					? "border-slate-950 bg-slate-50 shadow-[0_0_0_1px_rgba(15,23,42,0.18)]"
					: "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50",
				className
			)}
			{...props}
		>
			{children}
		</button>
	)
}
