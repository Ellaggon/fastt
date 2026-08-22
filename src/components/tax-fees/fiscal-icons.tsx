import type { ReactNode } from "react"

export function FiscalIcon({
	children,
	className = "size-[18px]",
}: {
	children: ReactNode
	className?: string
}) {
	return (
		<svg
			viewBox="0 0 24 24"
			className={className}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.9"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	)
}

export const fiscalIcons = {
	check: (
		<FiscalIcon>
			<circle cx="12" cy="12" r="9" />
			<path d="m8 12 2.8 2.8L16.5 9" />
		</FiscalIcon>
	),
	shield: (
		<FiscalIcon>
			<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />
			<path d="m9 12 2 2 4-4" />
		</FiscalIcon>
	),
	file: (
		<FiscalIcon>
			<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
			<path d="M14 3v5h5" />
			<path d="M9 13h6M9 17h4" />
		</FiscalIcon>
	),
	link: (
		<FiscalIcon>
			<path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" />
			<path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 18.07" />
		</FiscalIcon>
	),
	layers: (
		<FiscalIcon>
			<path d="m12 3 9 5-9 5-9-5z" />
			<path d="m3 12 9 5 9-5" />
			<path d="m3 17 9 5 9-5" />
		</FiscalIcon>
	),
	info: (
		<FiscalIcon>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 11v5" />
			<circle cx="12" cy="8" r="0.8" fill="currentColor" />
		</FiscalIcon>
	),
	arrow: (
		<FiscalIcon>
			<path d="M5 12h14" />
			<path d="m13 6 6 6-6 6" />
		</FiscalIcon>
	),
	calendar: (
		<FiscalIcon>
			<rect x="3" y="5" width="18" height="16" rx="2" />
			<path d="M8 3v4M16 3v4M3 11h18" />
		</FiscalIcon>
	),
	sliders: (
		<FiscalIcon>
			<path d="M4 8h10M18 8h2M12 16h8M4 16h4" />
			<circle cx="16" cy="8" r="2" />
			<circle cx="10" cy="16" r="2" />
		</FiscalIcon>
	),
	percent: (
		<FiscalIcon>
			<circle cx="17" cy="7" r="2.2" />
			<circle cx="7" cy="17" r="2.2" />
			<path d="M19 5 5 19" />
		</FiscalIcon>
	),
}
