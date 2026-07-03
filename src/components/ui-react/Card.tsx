import type { ElementType, HTMLAttributes, ReactNode } from "react"

import { cn } from "./utils"

type CardProps = HTMLAttributes<HTMLDivElement> & {
	as?: ElementType
	children: ReactNode
}

export default function Card({ as: Component = "div", className, children, ...props }: CardProps) {
	return (
		<Component
			className={cn(
				"fastt-card rounded-[var(--fastt-radius-panel)] border border-slate-200 bg-white p-6 shadow-sm",
				className
			)}
			{...props}
		>
			{children}
		</Component>
	)
}
