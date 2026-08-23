import { config as loadDotenv } from "dotenv"

import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"

const loaded = loadDotenv({ path: ".env.test", override: false })
const prohibitedLegacyTestKeys = [
	"DATABASE_URL",
	"DIRECT_URL",
	"SUPABASE_DB_POOLER_URL",
	"SUPABASE_DB_URL",
]

if (loaded.parsed && prohibitedLegacyTestKeys.some((key) => key in loaded.parsed!)) {
	throw new Error(
		".env.test must use FASTT_TEST_DATABASE_URL instead of runtime database URL variables."
	)
}

prepareIsolatedTestDatabase()
