import path from "node:path"

import { defineConfig } from "vitest/config"

// Governance tests intentionally replace process-wide auth and environment adapters.
// Run this bounded suite in one worker so those controlled doubles cannot cross-contaminate.
// These tests use isolated remote PostgreSQL; allow for its round-trip latency.
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		setupFiles: [path.resolve(__dirname, "tests/setup/clean-db-env.ts")],
		fileParallelism: false,
		maxWorkers: 1,
		testTimeout: 60_000,
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
})
