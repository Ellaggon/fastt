import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		setupFiles: [path.resolve(__dirname, "tests/setup/clean-db-env.ts")],
		// The default suite includes integration files invoked directly by CI. They
		// use the isolated Supabase database, so the unit-test default of five
		// seconds is not a valid reliability budget for a multi-query flow.
		testTimeout: 30_000,
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
})
