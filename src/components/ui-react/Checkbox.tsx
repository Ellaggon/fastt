import type { InputHTMLAttributes, ReactNode } from "react"

import { cn } from "./utils"

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
	children: ReactNode
}

export default function Checkbox({ className, children, ...props }: Props) {
	return (
		<label className="fastt-check-option inline-flex min-h-8 max-w-full cursor-pointer items-start gap-2 border border-slate-200 bg-white px-3 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
			<input
				type="checkbox"
				className={cn(
					"fastt-check-input mt-0.5 size-4 shrink-0 rounded border-slate-300",
					className
				)}
				{...props}
			/>
			<span className="min-w-0 leading-5">{children}</span>
		</label>
	)
}
