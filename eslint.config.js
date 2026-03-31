import astroParser from "astro-eslint-parser"
import eslintPluginAstro from "eslint-plugin-astro"
import importPlugin from "eslint-plugin-import"
import tsParser from "@typescript-eslint/parser"
import tsPlugin from "@typescript-eslint/eslint-plugin"

/**
 * Strict Architecture Enforcement (ARCHITECTURE_SOURCE_OF_TRUTH)
 *
 * Core invariants enforced here:
 * - domain: pure logic (no DB/framework/infrastructure; no cross-module deps)
 * - application: orchestration only (no infrastructure; no cross-module deps)
 * - shared: may be depended on, but must not depend on modules/*
 * - modules must not import other modules directly (ports must live in the consumer module)
 *
 * NOTE: These are enforced as ERRORS, not warnings.
 */

const TS_FILES = ["**/*.ts", "**/*.tsx"]
const ASTRO_FILES = ["**/*.astro"]

const MODULES = ["catalog", "inventory", "pricing", "policies", "search", "booking"]

function forbidOtherModules(selfModuleName) {
	const others = MODULES.filter((m) => m !== selfModuleName)
	// Allow cross-module usage ONLY via "@/modules/<module>/public".
	// Forbid importing internal layers of other modules.
	return others.flatMap((m) => [
		`@/modules/${m}/application/**`,
		`@/modules/${m}/domain/**`,
		`@/modules/${m}/infrastructure/**`,
	])
}

export default [
	{
		ignores: ["node_modules/**", "dist/**", ".vercel/**", ".astro/**", ".vitest/**", "**/*.js.map"],
	},

	// ----- TypeScript -----
	{
		files: TS_FILES,
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			"import": importPlugin,
			"@typescript-eslint": tsPlugin,
		},
		rules: {
			// Keep ergonomics; architecture is enforced below via overrides.
			"@typescript-eslint/no-unused-vars": "warn",

			// Not architecture-critical; keep as signal but don't block commits.
			"import/no-duplicates": "warn",
		},
	},

	// ----- Astro -----
	{
		files: ASTRO_FILES,
		languageOptions: {
			parser: astroParser,
			parserOptions: {
				parser: "@typescript-eslint/parser",
				extraFileExtensions: [".astro"],
				ecmaVersion: 2022,
				sourceType: "module",
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			"astro": eslintPluginAstro,
			"import": importPlugin,
			"@typescript-eslint": tsPlugin,
		},
		rules: {
			"astro/no-set-html-directive": "warn",
		},
	},

	// -------------------------------------------------------------------------
	// ARCHITECTURE RULES (ERRORS)
	// -------------------------------------------------------------------------

	// Enforce module encapsulation for all non-module consumers:
	// external code must import ONLY from "@/modules/<module>/public".
	{
		files: ["src/**/*.{ts,tsx,astro}", "tests/**/*.{ts,tsx}"],
		// Transitional/infra wiring folders may legitimately import implementations.
		ignores: [
			"src/modules/**",
			"src/container/**",
			"src/jobs/**",
			"src/repositories/**",
			"src/application/**",
		],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: [
								"@/modules/*/application/**",
								"@/modules/*/domain/**",
								"@/modules/*/infrastructure/**",
							],
							message:
								'Do not import module internals. Import from "@/modules/<module>/public" instead.',
						},
					],
				},
			],
		},
	},

	// shared must not depend on modules/*
	{
		files: ["src/shared/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["@/modules/**"],
							message: "shared must not import from modules/* (shared is lower-level).",
						},
					],
				},
			],
		},
	},

	// ---- Modules: enforce boundaries per module + per layer (single rule source of truth) ----
	...MODULES.flatMap((m) => {
		const otherModules = forbidOtherModules(m)

		const moduleDomain = {
			files: [`src/modules/${m}/domain/**/*.{ts,tsx}`],
			rules: {
				"no-restricted-imports": [
					"error",
					{
						patterns: [
							...otherModules,
							// Framework / DB
							"astro",
							"astro:*",
							"astro:db",
							"astro:content",
							"@astrojs/*",
							// Internal high-level layers
							"@/container/**",
							"@/pages/**",
							"@/components/**",
							"@/layouts/**",
							"@/services/**",
							"@/repositories/**",
							"@/lib/**",
							"@/application/**",
							"@/api/**",
							// Must not touch any infrastructure or application
							`@/modules/${m}/application/**`,
							`@/modules/${m}/infrastructure/**`,
							"@/modules/*/infrastructure/**",
							"@/shared/infrastructure/**",
						],
					},
				],
			},
		}

		const moduleApplication = {
			files: [`src/modules/${m}/application/**/*.{ts,tsx}`],
			rules: {
				"no-restricted-imports": [
					"error",
					{
						patterns: [
							...otherModules,
							// Framework / DB
							"astro",
							"astro:*",
							"astro:db",
							"astro:content",
							"@astrojs/*",
							// Must not touch infrastructure
							`@/modules/${m}/infrastructure/**`,
							"@/modules/*/infrastructure/**",
							"@/shared/infrastructure/**",
							"@/repositories/**",
							"@/lib/db/**",
						],
					},
				],
			},
		}

		const moduleInfrastructure = {
			files: [`src/modules/${m}/infrastructure/**/*.{ts,tsx}`],
			rules: {
				"no-restricted-imports": ["error", { patterns: otherModules }],
			},
		}

		return [moduleDomain, moduleApplication, moduleInfrastructure]
	}),

	// ---- Shared domain: pure + must not import modules ----
	{
		files: ["src/shared/domain/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						"@/modules/**",
						"astro",
						"astro:*",
						"astro:db",
						"astro:content",
						"@astrojs/*",
						"@/container/**",
						"@/pages/**",
						"@/components/**",
						"@/layouts/**",
						"@/services/**",
						"@/repositories/**",
						"@/lib/**",
						"@/application/**",
						"@/api/**",
						"@/shared/infrastructure/**",
					],
				},
			],
		},
	},
]
