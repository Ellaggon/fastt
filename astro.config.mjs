import { defineConfig, passthroughImageService } from "astro/config"
import vercel from "@astrojs/vercel"
import node from "@astrojs/node"
import dotenv from "dotenv"
import path from "path"
import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"

function applyProcessEnvFromFiles(mode) {
	// Vite later files override earlier ones; real process.env still wins.
	// Load with dotenv (a direct dependency). Importing `vite` from this file
	// makes Vite's module runner fetch itself and fails under pnpm:
	// "Cannot find module 'vite' imported from astro.config.mjs".
	dotenv.config({
		path: [`.env.${mode}.local`, `.env.${mode}`, ".env.local", ".env"],
		override: false,
		quiet: true,
	})
}

const reactDevelopmentRuntime = {
	name: "fastt:react-development-runtime",
	configResolved(config) {
		if (config.command !== "serve") return
		config.optimizeDeps.esbuildOptions ??= {}
		config.optimizeDeps.esbuildOptions.define = {
			...config.optimizeDeps.esbuildOptions.define,
			"process.env.NODE_ENV": JSON.stringify("development"),
		}
	},
}

// https://astro.build/config
export default defineConfig(({ mode }) => {
	applyProcessEnvFromFiles(mode)
	const isVercel = process.env.VERCEL === "1"
	return {
		integrations: [react()],
		site: "https://fastt-five.vercel.app",
		output: "server",
		adapter: isVercel ? vercel() : node({ mode: "standalone" }),
		image: {
			service: passthroughImageService(),
		},
		vite: {
			plugins: [reactDevelopmentRuntime, tailwindcss()],
			optimizeDeps: {
				include: ["zod"],
			},
			resolve: {
				alias: {
					"@": path.resolve("./src"),
				},
			},
		},
	}
})
