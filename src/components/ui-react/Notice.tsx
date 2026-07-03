import type { HTMLAttributes, ReactNode } from "react"

import { cn } from "./utils"

type NoticeVariant = "neutral" | "info" | "success" | "warning" | "error"

type NoticeProps = HTMLAttributes<HTMLDivElement> & {
	variant?: NoticeVariant
	title?: string
	children: ReactNode
}

const variantClass: Record<NoticeVariant, string> = {
	neutral: "border-slate-200 bg-slate-50 text-slate-800",
	info: "border-sky-200 bg-sky-50 text-sky-900",
	success: "border-emerald-200 bg-emerald-50 text-emerald-900",
	warning: "border-amber-200 bg-amber-50 text-amber-950",
	error: "border-red-200 bg-red-50 text-red-900",
}

export default function Notice({
	variant = "info",
	title,
	className,
	children,
	...props
}: NoticeProps) {
	return (
		<div
			className={cn(
				"fastt-notice rounded-[var(--fastt-radius-card)] border p-4 text-sm leading-6",
				variantClass[variant],
				className
			)}
			role={variant === "error" ? "alert" : "status"}
			{...props}
		>
			{title ? <p className="mb-1 font-semibold">{title}</p> : null}
			<div className="text-current/85">{children}</div>
		</div>
	)
}
