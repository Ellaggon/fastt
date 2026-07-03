import type { HTMLAttributes, ReactNode } from "react"

import { cn } from "./utils"

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "error"

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
	variant?: BadgeVariant
	children: ReactNode
}

const variantClass: Record<BadgeVariant, string> = {
	neutral: "border-slate-200 bg-slate-100 text-slate-700",
	info: "border-sky-200 bg-sky-50 text-sky-800",
	success: "border-emerald-200 bg-emerald-50 text-emerald-800",
	warning: "border-amber-200 bg-amber-50 text-amber-900",
	error: "border-red-200 bg-red-50 text-red-800",
}

export default function Badge({ variant = "neutral", className, children, ...props }: BadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
				variantClass[variant],
				className
			)}
			{...props}
		>
			{children}
		</span>
	)
}
