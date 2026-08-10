import {
	ADD_ROOM_PLAYBOOK_ID,
	resolveAddRoomPlaybookFromUrl,
	type AddRoomStepId,
} from "@/lib/playbook/add-room"
import {
	COMPLETE_TO_PUBLISH_PLAYBOOK_ID,
	resolveCompleteToPublishPlaybookFromUrl,
} from "@/lib/playbook/complete-to-publish"
import {
	LAUNCH_PLAYBOOK_ID,
	resolveLaunchPlaybookFromUrl,
	type LaunchStepId,
} from "@/lib/playbook/launch-accommodation"
import {
	LAUNCH_TOUR_PLAYBOOK_ID,
	resolveTourLaunchPlaybookFromUrl,
	type TourLaunchStepId,
} from "@/lib/playbook/launch-tour"
import type { PlaybookId } from "@/lib/playbook/types"
import type { ProductVerticalSectionKey } from "@/lib/catalog/productVerticalRegistry"

export type ResolvedPlaybook = {
	active: boolean
	playbookId: PlaybookId | null
	stepId:
		| LaunchStepId
		| TourLaunchStepId
		| AddRoomStepId
		| ProductVerticalSectionKey
		| string
		| null
	productId: string
	variantId: string
	ratePlanId: string
	isHotel: boolean
}

export function resolvePlaybookFromUrl(
	url: URL,
	options: { isHotel?: boolean } = {}
): ResolvedPlaybook {
	const complete = resolveCompleteToPublishPlaybookFromUrl(url)
	if (complete.active) {
		return {
			active: true,
			playbookId: COMPLETE_TO_PUBLISH_PLAYBOOK_ID,
			stepId: complete.stepId,
			productId: complete.productId,
			variantId: "",
			ratePlanId: "",
			isHotel: options.isHotel ?? false,
		}
	}

	const addRoom = resolveAddRoomPlaybookFromUrl(url)
	if (addRoom.active) {
		return {
			active: true,
			playbookId: ADD_ROOM_PLAYBOOK_ID,
			stepId: addRoom.stepId,
			productId: addRoom.productId,
			variantId: addRoom.variantId,
			ratePlanId: addRoom.ratePlanId,
			isHotel: options.isHotel ?? true,
		}
	}

	const tourLaunch = resolveTourLaunchPlaybookFromUrl(url)
	if (tourLaunch.active) {
		return {
			active: true,
			playbookId: LAUNCH_TOUR_PLAYBOOK_ID,
			stepId: tourLaunch.stepId,
			productId: String(url.pathname.match(/^\/product\/([^/]+)/)?.[1] ?? "").trim(),
			variantId: String(url.searchParams.get("variantId") ?? "").trim(),
			ratePlanId: String(url.searchParams.get("ratePlanId") ?? "").trim(),
			isHotel: false,
		}
	}

	const launch = resolveLaunchPlaybookFromUrl(url)
	return {
		active: launch.active,
		playbookId: launch.active ? LAUNCH_PLAYBOOK_ID : null,
		stepId: launch.stepId,
		productId: String(url.pathname.match(/^\/product\/([^/]+)/)?.[1] ?? "").trim(),
		variantId: "",
		ratePlanId: "",
		isHotel: options.isHotel ?? false,
	}
}
