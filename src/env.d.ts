/// <reference types="astro/client" />

declare const Astro: import("astro/dist/types/public/context.js").AstroGlobal

declare namespace App {
	interface Locals {
		getWorkspaceContext: () => Promise<
			import("@/lib/dashboard/workspaceRequestContext").WorkspaceRequestContext
		>
	}
}
