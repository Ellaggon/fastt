const globalFinancialSeed = globalThis as typeof globalThis & {
	__fasttFinancialDemoSeedPromise?: Promise<void>
}

export async function ensureLocalFinancialDemoSeed(): Promise<void> {
	const shouldSeed =
		process.env.NODE_ENV !== "production" &&
		(process.env.LOCAL_QA_AUTH_ENABLED === "true" ||
			process.env.FASTT_SEED_FINANCIAL_DEMO === "true")

	if (!shouldSeed) return

	globalFinancialSeed.__fasttFinancialDemoSeedPromise ??=
		import("@/scripts/seed-financial-operational-demo").then(
			({ default: seedFinancialOperationalDemo }) => seedFinancialOperationalDemo()
		)

	try {
		await globalFinancialSeed.__fasttFinancialDemoSeedPromise
	} catch (error) {
		delete globalFinancialSeed.__fasttFinancialDemoSeedPromise
		throw error
	}
}
