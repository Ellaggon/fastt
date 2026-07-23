type ServerTimingMetric = {
	name: string
	durationMs: number
	description?: string
}

function sanitizeToken(value: string): string {
	return value.replace(/[^A-Za-z0-9_!#$%&'*+.^`|~-]/g, "_")
}

function sanitizeDescription(value: string): string {
	return value.replace(/["\\]/g, "")
}

export function createServerTimingRecorder() {
	const startedAt = performance.now()
	const metrics: ServerTimingMetric[] = []

	function add(name: string, durationMs: number, description?: string): void {
		metrics.push({
			name: sanitizeToken(name),
			durationMs: Number(Math.max(0, durationMs).toFixed(1)),
			description,
		})
	}

	async function time<TValue>(name: string, fn: () => Promise<TValue>): Promise<TValue> {
		const segmentStartedAt = performance.now()
		try {
			return await fn()
		} finally {
			add(name, performance.now() - segmentStartedAt)
		}
	}

	function addTotal(name = "total"): void {
		add(name, performance.now() - startedAt)
	}

	function headerValue(): string {
		return metrics
			.map((metric) => {
				const desc = metric.description ? `;desc="${sanitizeDescription(metric.description)}"` : ""
				return `${metric.name};dur=${metric.durationMs}${desc}`
			})
			.join(", ")
	}

	function setHeader(headers: Headers): void {
		const value = headerValue()
		if (value) headers.set("Server-Timing", value)
	}

	function headers(extra?: HeadersInit): Headers {
		const headers = new Headers(extra)
		setHeader(headers)
		return headers
	}

	return {
		add,
		addTotal,
		headerValue,
		headers,
		metrics,
		setHeader,
		time,
	}
}

export type ServerTimingRecorder = ReturnType<typeof createServerTimingRecorder>
