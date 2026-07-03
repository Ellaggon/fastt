import type { SelectHTMLAttributes } from "react"

import { cn } from "./utils"

export default function Select({
	className,
	children,
	...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
	return (
		<select
			className={cn(
				"fastt-field block h-11 w-full rounded-[var(--fastt-radius-control)] border border-slate-300 bg-white px-3 text-sm text-slate-900 transition focus:ring-2 focus:ring-slate-950/10 focus:outline-none",
				className
			)}
			{...props}
		>
			{children}
		</select>
	)
}
