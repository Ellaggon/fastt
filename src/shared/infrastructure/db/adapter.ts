import { sql } from "drizzle-orm"
import type { postgresDb } from "./client"

export type PostgresDb = typeof postgresDb

export type DbAdapterHealth = {
	ok: boolean
	provider: "supabase-postgres"
	mode: "runtime" | "direct"
}

export class PostgresDbAdapter {
	constructor(
		private readonly db: PostgresDb,
		private readonly mode: "runtime" | "direct" = "runtime"
	) {}

	get client() {
		return this.db
	}

	async health(): Promise<DbAdapterHealth> {
		await this.db.execute(sql`select 1`)
		return {
			ok: true,
			provider: "supabase-postgres",
			mode: this.mode,
		}
	}
}
