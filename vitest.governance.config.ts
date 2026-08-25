import path from "node:path"

import { defineConfig } from "vitest/config"

// Governance tests intentionally replace process-wide auth and environment adapters.
// Run this bounded suite in one worker so those controlled doubles cannot cross-contaminate.
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		setupFiles: [path.resolve(__dirname, "tests/setup/clean-db-env.ts")],
		fileParallelism: false,
		maxWorkers: 1,
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
})
