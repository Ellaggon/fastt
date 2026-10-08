/// <reference types="astro/client" />

declare const Astro: import("astro/dist/types/public/context.js").AstroGlobal

declare namespace App {
	interface Locals {
		optionPreparationSession?: Awaited<
			ReturnType<typeof import("@/lib/onboarding/tourOptionSession").getOptionSession>
		>
		getWorkspaceContext: () => Promise<
			import("@/lib/dashboard/workspaceRequestContext").WorkspaceRequestContext
		>
	}
}

interface Window {
	__fasttWorkspacePendingInstalled?: boolean
	__fasttDrawerController?: boolean
}
