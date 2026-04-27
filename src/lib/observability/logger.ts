type LogLevel = "info" | "warn" | "error" | "debug"

function write(level: LogLevel, event: string, payload: Record<string, unknown> = {}): void {
	const entry = {
		level,
		event,
		ts: new Date().toISOString(),
		...payload,
	}
	if (level === "error") {
		console.error(entry)
		return
	}
	if (level === "warn") {
		console.warn(entry)
		return
	}
	if (level === "debug") {
		console.debug(entry)
		return
	}
	console.info(entry)
}

export const logger = {
	info(event: string, payload: Record<string, unknown> = {}) {
		write("info", event, payload)
	},
	warn(event: string, payload: Record<string, unknown> = {}) {
		write("warn", event, payload)
	},
	error(event: string, payload: Record<string, unknown> = {}) {
		write("error", event, payload)
	},
	debug(event: string, payload: Record<string, unknown> = {}) {
		write("debug", event, payload)
	},
}
