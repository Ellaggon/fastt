import type { ButtonHTMLAttributes, ReactNode } from "react"

import { cn } from "./utils"

type IconButtonVariant = "primary" | "secondary" | "ghost" | "danger"
type IconButtonSize = "sm" | "md" | "lg"

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
	label: string
	variant?: IconButtonVariant
	size?: IconButtonSize
	children: ReactNode
}

const variantClass: Record<IconButtonVariant, string> = {
	primary: "bg-slate-950 text-white shadow-sm hover:bg-slate-800",
	secondary:
		"border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950",
	ghost: "bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950",
	danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 focus:ring-red-600",
}

const sizeClass: Record<IconButtonSize, string> = {
	sm: "size-8 text-xs",
	md: "size-10 text-sm",
	lg: "size-11 text-base",
}

export default function IconButton({
	label,
	variant = "secondary",
	size = "md",
	className,
	children,
	...props
}: Props) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className={cn(
				"fastt-icon-button inline-flex shrink-0 items-center justify-center transition focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
				variantClass[variant],
				sizeClass[size],
				className
			)}
			{...props}
		>
			{children}
		</button>
	)
}
