/**
 * Outbound channel *content* adapter (property / unit / rate policies).
 *
 * Separate from {@link ChannelManagerAdapter} (ARI + ID lists). Content push is
 * deferred until Channex (and Expedia-via-CM) certification defines payloads;
 * factory returns null so callers cannot accidentally mix ARI with policies.
 *
 * @see docs/engineering/adr/0005-channel-content-ownership.md
 */

import type { ChannelContentDraft } from "./content/channelContentProjection"

export type ChannelManagerContentPushResult = {
	ok: boolean
	pushedLayers: Array<"property" | "unit" | "rate_commercial" | "rate_schedule_exception">
	message: string
}

export type ChannelManagerContentAdapter = {
	readonly vendor: "channex"
	/**
	 * Push a validated {@link ChannelContentDraft}. Implementations must place
	 * each layer on the correct remote object (property vs room_type vs rate_plan).
	 */
	pushContent(draft: ChannelContentDraft): Promise<ChannelManagerContentPushResult>
}

/**
 * Content adapters are not wired yet — ARI-only Channex remains the live path.
 * Callers must treat null as "ownership contract only; no remote content write".
 */
export function createChannelManagerContentAdapter(params?: {
	vendor?: "channex"
}): ChannelManagerContentAdapter | null {
	void params
	return null
}

export function isChannelContentPushEnabled(
	adapter: ChannelManagerContentAdapter | null
): adapter is ChannelManagerContentAdapter {
	return adapter != null
}
