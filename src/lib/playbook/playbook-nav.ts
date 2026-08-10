import { ADD_ROOM_PLAYBOOK_ID, buildAddRoomHref, type AddRoomStepId } from "@/lib/playbook/add-room"
import {
	COMPLETE_TO_PUBLISH_PLAYBOOK_ID,
	buildCompleteToPublishHref,
} from "@/lib/playbook/complete-to-publish"
import {
	buildPlaybookHref,
	LAUNCH_PLAYBOOK_ID,
	type LaunchStepId,
} from "@/lib/playbook/launch-accommodation"
import {
	buildTourPlaybookHref,
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
		flow === "complete" || playbook === COMPLETE_TO_PUBLISH_PLAYBOOK_ID || playbook === "complete"
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
	step: LaunchStepId | TourLaunchStepId | AddRoomStepId,
	productId?: string
): string {
	if (playbookId === ADD_ROOM_PLAYBOOK_ID) {
		return buildAddRoomHref(path, step as AddRoomStepId)
	}
	if (playbookId === COMPLETE_TO_PUBLISH_PLAYBOOK_ID && productId) {
		return completeToPublishRedirectHref(productId)
	}
	if (playbookId === LAUNCH_TOUR_PLAYBOOK_ID) {
		return buildTourPlaybookHref(path, step as TourLaunchStepId)
	}
	return buildPlaybookHref(path, step as LaunchStepId)
}

export function resolvePlaybookRedirectAfterSave(
	formData: FormData,
	options: {
		productId: string
		launchPath: string
		launchStep: LaunchStepId | TourLaunchStepId
	}
): string {
	if (!isPlaybookMode(formData)) {
		return `/product/${encodeURIComponent(options.productId)}`
	}
	if (isCompleteToPublishPlaybookMode(formData)) {
		return completeToPublishRedirectHref(options.productId)
	}
	if (isAddRoomPlaybookMode(formData)) {
		return addRoomRedirectHref(options.launchPath, options.launchStep as AddRoomStepId)
	}
	if (isTourLaunchPlaybookMode(formData)) {
		return buildTourPlaybookHref(options.launchPath, options.launchStep as TourLaunchStepId)
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
