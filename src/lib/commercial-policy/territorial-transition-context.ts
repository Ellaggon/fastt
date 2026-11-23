import { AsyncLocalStorage } from "node:async_hooks"
import { isInPostgresTransaction } from "@/shared/infrastructure/db/client"

const coordinatedVersions = new AsyncLocalStorage<ReadonlySet<string>>()

/** Only the reconciled transition command may open this transaction-local scope. */
export function withTerritorialTransition<T>(ids: string[], work: () => Promise<T>) {
	if (!isInPostgresTransaction()) throw new Error("territorial_transaction_required")
	return coordinatedVersions.run(new Set(ids), work)
}

export function isCoordinatedTerritorialVersion(id: string) {
	return Boolean(isInPostgresTransaction() && coordinatedVersions.getStore()?.has(id))
}
