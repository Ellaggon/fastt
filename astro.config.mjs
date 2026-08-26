import { defineConfig, passthroughImageService } from "astro/config"
import vercel from "@astrojs/vercel"
import node from "@astrojs/node"
import dotenv from "dotenv"
import path from "path"
import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"
import { loadEnv } from "vite"

function applyProcessEnvFromFiles(mode) {
	dotenv.config()
	const fileEnv = loadEnv(mode, process.cwd(), "")
	for (const [key, value] of Object.entries(fileEnv)) {
		if (process.env[key] === undefined) process.env[key] = value
	}
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
