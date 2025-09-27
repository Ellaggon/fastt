import eslintPluginAstro from "eslint-plugin-astro"
import astroParser from "astro-eslint-parser"
import typescriptEslint from "@typescript-eslint/eslint-plugin"
import typescriptParser from "@typescript-eslint/parser"

export default [
	// Configuración para archivos .astro
	{
		files: ["**/*.astro"],
		languageOptions: {
			parser: astroParser,
			parserOptions: {
				parser: "@typescript-eslint/parser",
				extraFileExtensions: [".astro"],
				ecmaVersion: 2022,
				sourceType: "module",
				project: "./tsconfig.json",
				tsconfigRootDir: "./",
			},
		},
		plugins: {
			"astro": eslintPluginAstro,
			"@typescript-eslint": typescriptEslint,
		},
		rules: {
			"astro/no-set-html-directive": "warn",
			"no-unused-vars": "warn", // Manejo de variables no usadas
		},
	},
	// Configuración para TypeScript
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: tseslint.parser, // Use the TypeScript parser
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname, // Use this for robust root directory resolution
			},
			globals: globals.browser, // Standard browser globals
		},
		// Extends TypeScript ESLint's recommended rules
		...tseslint.configs.recommended,
		rules: {
			"@typescript-eslint/no-unused-vars": "warn",
		},
	},
	// Configuración para JavaScript
	{
		files: ["**/*.js", "**/*.jsx"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: globals.browser, // Standard browser globals
		},
		// Extends ESLint's recommended JavaScript rules
		...js.configs.recommended,
		rules: {
			"no-unused-vars": "warn",
		},
	},
	// Config para vercel
	{
		files: [".vercel/**/*.js"],
		rules: {
			"no-unused-vars": "off",
		},
	},
	// Ignore files and directories
	{
		ignores: ["node_modules/", "dist/", ".vercel/", "**/*.js.map"], // Added .js.map for common build outputs
	},
]
