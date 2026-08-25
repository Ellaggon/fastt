import {
	getFasttDataEnvironment,
	prepareIsolatedTestDatabase,
} from "@/shared/infrastructure/db/data-environment"

export function prepareMarketplaceCertificationEnvironment(input: {
	apply: boolean
	confirmed: boolean
	env?: NodeJS.ProcessEnv
}) {
	const env = input.env ?? process.env
	const dataEnvironment = getFasttDataEnvironment(env)

	if (!input.apply) {
		if (dataEnvironment !== "development" && dataEnvironment !== "test") {
			throw new Error("MARKETPLACE_CERTIFICATION_DRY_RUN_REQUIRES_NON_PRODUCTION_ENV")
		}
		return { dataEnvironment, databaseConfigured: false } as const
	}

	if (dataEnvironment !== "test") {
		throw new Error("MARKETPLACE_CERTIFICATION_APPLY_REQUIRES_ISOLATED_TEST_ENV")
	}
	const database = prepareIsolatedTestDatabase(env)
	if (!database.configured) {
		throw new Error("MARKETPLACE_CERTIFICATION_REQUIRES_ISOLATED_TEST_DATABASE")
	}
	if (!input.confirmed) {
		throw new Error("MARKETPLACE_CERTIFICATION_CONFIRMATION_REQUIRED")
	}

	return { dataEnvironment, databaseConfigured: true, fingerprint: database.fingerprint } as const
}
