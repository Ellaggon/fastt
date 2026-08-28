/** @jsxRuntime classic */
import React, { useEffect, useState } from "react"

import {
	CALENDAR_CONTROL_MODES,
	type CalendarControlMode,
} from "@/lib/rates/calendarControlCatalog"

type Props = {
	initialMode: CalendarControlMode
}

function resolveMode(value: string): CalendarControlMode {
	if (
		value === "price" ||
		value === "availability" ||
		value === "sellability" ||
		value === "conditions"
	) {
		return value
	}
	return "price"
}

export default function CalendarWorkspaceHeader({ initialMode }: Props) {
	const [mode, setMode] = useState<CalendarControlMode>(initialMode)

	useEffect(() => {
		function onCalendarMode(event: Event) {
			const nextMode = String((event as CustomEvent<{ mode?: string }>).detail?.mode ?? "").trim()
			if (!nextMode) return
			setMode(resolveMode(nextMode))
		}

		const urlMode = new URL(window.location.href).searchParams.get("focus")
		if (urlMode) setMode(resolveMode(urlMode))

		window.addEventListener("fastt:calendar-mode", onCalendarMode)
		return () => window.removeEventListener("fastt:calendar-mode", onCalendarMode)
	}, [])

	const activeMode =
		CALENDAR_CONTROL_MODES.find((item) => item.key === mode) ?? CALENDAR_CONTROL_MODES[0]

	return (
		<header className="space-y-2">
			<h1 className="text-3xl font-semibold text-slate-100">
				{activeMode.helper.replace(/\.$/, "")}
			</h1>
			<p className="max-w-3xl text-sm leading-6 text-slate-300">
				{activeMode.workspaceDescription}
			</p>
		</header>
	)
}
