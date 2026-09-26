const CONNECTIVITY_MARKERS = [
	"enotfound",
	"eai_again",
	"econnrefused",
	"econnreset",
	"etimedout",
	"enetunreach",
	"ehostunreach",
	"enotconn",
	"getaddrinfo",
	"connect_timeout",
	"connection timed out",
	"timeout expired",
] as const

function collectErrorText(error: unknown, depth = 0): string {
	if (depth > 4 || error == null) return ""
	if (typeof error === "string") return error
	if (typeof error !== "object") return String(error)
	const record = error as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown }
	const parts = [record.code, record.message, collectErrorText(record.cause, depth + 1)]
	if (Array.isArray(record.errors)) {
		for (const nested of record.errors) {
			parts.push(collectErrorText(nested, depth + 1))
		}
	}
	return parts.filter(Boolean).join(" ")
}

export function isTransientDatabaseConnectivityError(error: unknown): boolean {
	const haystack = collectErrorText(error).toLowerCase()
	if (!haystack) return false
	return CONNECTIVITY_MARKERS.some((marker) => haystack.includes(marker))
}

export const DATABASE_CONNECTIVITY_PUBLIC_MESSAGE =
	"No pudimos conectar con el servicio de datos. Revisa tu conexión e inténtalo de nuevo."
