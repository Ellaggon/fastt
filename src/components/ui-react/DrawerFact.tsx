import type { ReactNode } from "react"

import { cn } from "./utils"

type Props = {
	title: string
	icon: ReactNode
	muted?: boolean
	children: ReactNode
}

export default function DrawerFact({ title, icon, muted = false, children }: Props) {
	return (
		<div className={cn("fastt-drawer-fact", muted && "fastt-drawer-fact--muted")}>
			<span className="fastt-drawer-fact__icon" aria-hidden="true">
				{icon}
			</span>
			<div className="min-w-0">
				<p className="text-sm font-semibold text-slate-950">{title}</p>
				<div className="mt-0.5 text-sm leading-6 text-slate-600">{children}</div>
			</div>
		</div>
	)
}
