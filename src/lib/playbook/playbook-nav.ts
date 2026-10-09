import { safeProductWorkspaceReturn } from "@/lib/auth/returnTo"
import { ADD_ROOM_PLAYBOOK_ID, buildAddRoomHref, type AddRoomStepId } from "@/lib/playbook/add-room"
import {
	COMPLETE_TO_PUBLISH_PLAYBOOK_ID,
	buildCompleteToPublishHref,
	completeToPublishNextHref,
	normalizeCompleteToPublishStep,
} from "@/lib/playbook/complete-to-publish"
import {
	buildPlaybookHref,
	LAUNCH_PLAYBOOK_ID,
	type LaunchStepId,
} from "@/lib/playbook/launch-accommodation"
import {
	buildTourPlaybookHref,
	tourPreparationNextHref,
	LAUNCH_TOUR_PLAYBOOK_ID,
	type TourLaunchStepId,
} from "@/lib/playbook/launch-tour"
import type { PlaybookId } from "@/lib/playbook/types"
import { routes } from "@/lib/routes"

export function isCompleteToPublishPlaybookMode(formData: FormData): boolean {
	const flow = String(formData.get("flow") ?? "")
		.trim()
		.toLowerCase()
	const playbook = String(formData.get("playbook") ?? "")
		.trim()
		.toLowerCase()
	return (
		playbook === COMPLETE_TO_PUBLISH_PLAYBOOK_ID ||
		playbook === "complete" ||
		(!playbook && flow === "complete")
	)
}

export function isPlaybookMode(formData: FormData): boolean {
	const flow = String(formData.get("flow") ?? "")
		.trim()
		.toLowerCase()
	const playbook = String(formData.get("playbook") ?? "")
		.trim()
		.toLowerCase()
	return (
		flow === "create" ||
		flow === "add-room" ||
		flow === "complete" ||
		playbook === LAUNCH_PLAYBOOK_ID ||
		playbook === "launch-accommodation" ||
		playbook === LAUNCH_TOUR_PLAYBOOK_ID ||
		playbook === ADD_ROOM_PLAYBOOK_ID ||
		playbook === COMPLETE_TO_PUBLISH_PLAYBOOK_ID ||
		playbook === "complete"
	)
}

export function isAddRoomPlaybookMode(formData: FormData): boolean {
	const flow = String(formData.get("flow") ?? "")
		.trim()
		.toLowerCase()
	const playbook = String(formData.get("playbook") ?? "")
		.trim()
		.toLowerCase()
	return flow === "add-room" || playbook === ADD_ROOM_PLAYBOOK_ID
}

export function isTourLaunchPlaybookMode(formData: FormData): boolean {
	return (
		String(formData.get("playbook") ?? "")
			.trim()
			.toLowerCase() === LAUNCH_TOUR_PLAYBOOK_ID
	)
}

export function playbookRedirectHref(path: string, step: LaunchStepId | TourLaunchStepId): string {
	return buildPlaybookHref(path, step as LaunchStepId)
}

export function addRoomRedirectHref(path: string, step: AddRoomStepId): string {
	return buildAddRoomHref(path, step)
}

export function completeToPublishRedirectHref(productId: string): string {
	return buildCompleteToPublishHref(routes.productPreview(productId), "preview")
}

export function playbookRedirectHrefFor(
	playbookId: PlaybookId,
	path: string,
	step: LaunchStepId | TourLaunchStepId | AddRoomStepId
): string {
	if (playbookId === ADD_ROOM_PLAYBOOK_ID) {
		return buildAddRoomHref(path, step as AddRoomStepId)
	}
	if (playbookId === COMPLETE_TO_PUBLISH_PLAYBOOK_ID) {
		const completeStep = normalizeCompleteToPublishStep(step) ?? step
		return buildCompleteToPublishHref(path, completeStep)
	}
	if (playbookId === LAUNCH_TOUR_PLAYBOOK_ID) {
		return buildTourPlaybookHref(path, step as TourLaunchStepId)
	}
	return buildPlaybookHref(path, step as LaunchStepId)
}

export type PlaybookNavIntent = "continue" | "exit"

export function productWorkspaceHref(productId: string) {
	return `/product/${encodeURIComponent(productId)}`
}

export function readPlaybookNavIntent(
	formData: FormData,
	submitter?: EventTarget | null
): PlaybookNavIntent {
	if (submitter && typeof submitter === "object" && "name" in submitter && "value" in submitter) {
		const named = submitter as { name?: unknown; value?: unknown }
		if (String(named.name ?? "") === "playbookNav") {
			return String(named.value ?? "")
				.trim()
				.toLowerCase() === "exit"
				? "exit"
				: "continue"
		}
	}
	return String(formData.get("playbookNav") ?? "")
		.trim()
		.toLowerCase() === "exit"
		? "exit"
		: "continue"
}

export function resolvePlaybookRedirectAfterSave(
	formData: FormData,
	options: {
		productId: string
		launchPath: string
		launchStep: LaunchStepId | TourLaunchStepId
		intent?: PlaybookNavIntent
		submitter?: EventTarget | null
		currentStep?: string | null
		vertical?: string | null
	}
): string {
	const intent = options.intent ?? readPlaybookNavIntent(formData, options.submitter)
	const source = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)
	for (const key of [
		"playbook",
		"returnTo",
		"variantId",
		"ratePlanId",
		"tourFlowVersion",
		"flow",
	]) {
		const value = String(formData.get(key) ?? "").trim()
		if (value) source.set(key, value)
	}
	if (intent === "exit" || !isPlaybookMode(formData)) {
		return (
			safeProductWorkspaceReturn(source.get("returnTo"), options.productId) ??
			productWorkspaceHref(options.productId)
		)
	}
	const vertical = String(formData.get("playbookVertical") || options.vertical || "")
	if (
		isTourLaunchPlaybookMode(formData) ||
		(isCompleteToPublishPlaybookMode(formData) && vertical === "tour")
	) {
		return tourPreparationNextHref(
			source,
			{
				productId: options.productId,
				variantId: source.get("variantId") ?? undefined,
				ratePlanId: source.get("ratePlanId") ?? undefined,
			},
			String(
				formData.get("playbookCurrentStep") ||
					options.currentStep ||
					source.get("step") ||
					"content"
			)
		)
	}
	if (isCompleteToPublishPlaybookMode(formData)) {
		return completeToPublishNextHref(
			options.productId,
			String(formData.get("playbookCurrentStep") || options.currentStep || ""),
			String(formData.get("playbookVertical") || options.vertical || "")
		)
	}
	if (isAddRoomPlaybookMode(formData)) {
		return addRoomRedirectHref(options.launchPath, options.launchStep as AddRoomStepId)
	}
	return playbookRedirectHref(options.launchPath, options.launchStep)
}

export function isAddRoomPlaybookActiveFromSearch(search: string): boolean {
	const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
	const playbook = String(params.get("playbook") ?? "")
		.trim()
		.toLowerCase()
	const flow = String(params.get("flow") ?? "")
		.trim()
		.toLowerCase()
	return playbook === ADD_ROOM_PLAYBOOK_ID || flow === "add-room"
}
