import { defineConfig } from "vitest/config"
import path from "path"

/**
 * Live-Postgres integration suites share one explicit CI database and a handful
 * of process-wide adapters (authentication and rollout flags). Run them in one
 * worker so each suite observes a deterministic application process.
 */
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		setupFiles: [path.resolve(__dirname, "tests/setup/clean-db-env.ts")],
		fileParallelism: false,
		maxWorkers: 1,
		// The isolated Supabase instance is a real network dependency. A workflow
		// may include several aggregate refreshes, so retain a bounded but realistic
		// budget instead of treating normal network latency as a regression.
		testTimeout: 30_000,
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
})
