import { withPostgresTransaction } from "@/shared/infrastructure/db/client"

function rollbackIsCertain(error: unknown): boolean {
	const seen = new Set<unknown>()
	while (error && typeof error === "object" && !seen.has(error)) {
		seen.add(error)
		const detail = error as { code?: unknown; cause?: unknown }
		if (detail.code === "40001" || detail.code === "40P01") return true
		error = detail.cause
	}
	return false
}

export async function registerDocumentWithRetry<T>(work: () => Promise<T>): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await withPostgresTransaction(work)
		} catch (error) {
			// Serialization/deadlock errors guarantee rollback; connection loss does not.
			if (attempt >= 3 || !rollbackIsCertain(error)) throw error
			await new Promise((resolve) => setTimeout(resolve, 50 * attempt))
		}
	}
}
