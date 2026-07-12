import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getProductVerticalEntry } from "@/lib/catalog/productVerticalRegistry"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import {
	inferAddRoomStepFromPathname,
	isAddRoomPlaybookActive,
	type AddRoomStepId,
} from "@/lib/playbook/add-room"
import { evaluateAddRoomProgress } from "@/lib/playbook/evaluate-add-room-progress"
import {
	evaluateCompleteToPublishProgress,
	type CompleteToPublishProgressResult,
} from "@/lib/playbook/evaluate-complete-to-publish-progress"
import { isCompleteToPublishPlaybookActive } from "@/lib/playbook/complete-to-publish"
import { evaluateLaunchProgress } from "@/lib/playbook/evaluate-launch-progress"
import {
	inferLaunchStepFromPathname,
	isLaunchPlaybookActive,
	type LaunchStepId,
} from "@/lib/playbook/launch-accommodation"
import { getProductFullAggregate } from "@/modules/catalog/public"

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const endpointName = "playbook-progress"
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: endpointName, durationMs })
		if (durationMs > 1000) {
			console.warn("slow endpoint", { name: endpointName, durationMs })
		}
	}

	const user = await getUserFromRequest(request)
	if (!user?.email) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Provider not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const productId = String(url.searchParams.get("productId") ?? "").trim()
	if (!productId) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "productId is required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}

	const aggregate = await getProductFullAggregate(productId, providerId)
	if (!aggregate) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const vertical = getProductVerticalEntry(aggregate.productType)
	const isHotel = vertical.vertical === "hotel"
	const variantId = String(url.searchParams.get("variantId") ?? "").trim()
	const ratePlanId = String(url.searchParams.get("ratePlanId") ?? "").trim()
	const explicitStep = String(url.searchParams.get("step") ?? "").trim()
	const playbookParam = String(url.searchParams.get("playbook") ?? "")
		.trim()
		.toLowerCase()

	const isComplete =
		playbookParam === "complete-to-publish" ||
		playbookParam === "complete" ||
		isCompleteToPublishPlaybookActive(url)

	if (isComplete) {
		const currentStepId = explicitStep || inferLaunchStepFromPathname(url.pathname)
		const progress = await evaluateCompleteToPublishProgress(productId, providerId, {
			currentStepId,
			request,
			url,
		})

		if (!progress) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		logEndpoint()
		return new Response(
			JSON.stringify({
				...progress,
				mode: "complete-to-publish",
			} satisfies CompleteToPublishProgressResult & { mode: string }),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	}

	const isAddRoom =
		playbookParam === "add-room" ||
		(isAddRoomPlaybookActive(url) && !isLaunchPlaybookActive(url)) ||
		String(url.searchParams.get("flow") ?? "").trim() === "add-room"

	if (isAddRoom) {
		const currentStepId =
			(explicitStep as AddRoomStepId) ||
			(isAddRoomPlaybookActive(url) ? inferAddRoomStepFromPathname(url.pathname) : null)

		const progress = await evaluateAddRoomProgress(productId, providerId, {
			variantId,
			ratePlanId,
			currentStepId,
		})

		if (!progress) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		logEndpoint()
		return new Response(
			JSON.stringify({
				...progress,
				mode: "add-room",
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	}

	const currentStepId =
		(explicitStep as LaunchStepId) ||
		(isLaunchPlaybookActive(url) ? inferLaunchStepFromPathname(url.pathname) : null)

	const progress = await evaluateLaunchProgress(productId, providerId, {
		isHotel,
		variantId,
		ratePlanId,
		currentStepId,
	})

	if (!progress) {
		logEndpoint()
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	logEndpoint()
	return new Response(
		JSON.stringify({
			...progress,
			mode: isLaunchPlaybookActive(url) ? "create" : "edit",
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
