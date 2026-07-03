import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react"

import { cn } from "./utils"

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success"
type ButtonSize = "sm" | "md" | "lg"

type BaseProps = {
	variant?: ButtonVariant
	size?: ButtonSize
	children: ReactNode
	className?: string
}

type NativeButtonProps = BaseProps &
	ButtonHTMLAttributes<HTMLButtonElement> & {
		href?: never
	}

type AnchorButtonProps = BaseProps &
	AnchorHTMLAttributes<HTMLAnchorElement> & {
		href: string
		type?: never
	}

const variantClass: Record<ButtonVariant, string> = {
	primary: "bg-slate-950 text-white shadow-sm hover:bg-slate-800",
	secondary:
		"border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950",
	ghost: "bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950",
	danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 focus:ring-red-600",
	success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus:ring-emerald-600",
}

const sizeClass: Record<ButtonSize, string> = {
	sm: "h-8 px-3 text-xs",
	md: "h-10 px-4 text-sm",
	lg: "h-11 px-5 text-sm",
}

export default function Button(props: NativeButtonProps | AnchorButtonProps) {
	const { variant = "primary", size = "md", className, children } = props
	const resolvedClass = cn(
		"fastt-button inline-flex items-center justify-center gap-2 rounded-[var(--fastt-radius-control)] font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
		variantClass[variant],
		sizeClass[size],
		className
	)

	if ("href" in props && props.href) {
		const {
			variant: _variant,
			size: _size,
			className: _className,
			children: _children,
			...anchorProps
		} = props
		return (
			<a className={resolvedClass} {...anchorProps}>
				{children}
			</a>
		)
	}

	const nativeProps = props as NativeButtonProps
	const {
		variant: _variant,
		size: _size,
		className: _className,
		children: _children,
		...buttonProps
	} = nativeProps

	return (
		<button className={resolvedClass} type={buttonProps.type ?? "button"} {...buttonProps}>
			{children}
		</button>
	)
}
