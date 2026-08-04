import type {
	ChannelManagerAdapter,
	ChannelManagerMode,
} from "@/lib/channel-manager/channel-manager-adapter"
import { ChannexAdapter } from "@/lib/channel-manager/channex/channex-adapter"
import type { ChannelManagerVendorKey } from "@/lib/provider-channel-manager-vendors"

export function createChannelManagerAdapter(params: {
	vendorKey: ChannelManagerVendorKey
	credentialSecret: string
	mode: ChannelManagerMode
	timeoutMs?: number
}): ChannelManagerAdapter | null {
	if (params.vendorKey === "channex") {
		return new ChannexAdapter({
			apiKey: params.credentialSecret,
			mode: params.mode,
			timeoutMs: params.timeoutMs,
		})
	}
	return null
}
