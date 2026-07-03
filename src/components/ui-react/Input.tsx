import type { InputHTMLAttributes } from "react"

import { cn } from "./utils"

export default function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			className={cn(
				"fastt-field block h-11 w-full rounded-[var(--fastt-radius-control)] border border-slate-300 bg-white px-3 text-sm text-slate-900 transition placeholder:text-slate-400 focus:ring-2 focus:ring-slate-950/10 focus:outline-none",
				className
			)}
			{...props}
		/>
	)
}
