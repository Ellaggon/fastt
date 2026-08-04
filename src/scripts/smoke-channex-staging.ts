import "dotenv/config"

import { ChannexAdapter } from "@/lib/channel-manager/channex/channex-adapter"

async function main() {
	const apiKey = String(process.env.CHANNEX_STAGING_API_KEY ?? "").trim()
	if (!apiKey) throw new Error("CHANNEX_STAGING_API_KEY_REQUIRED")

	const adapter = new ChannexAdapter({ apiKey, mode: "sandbox" })
	const access = await adapter.testAccess()
	if (!access.ok) throw new Error("CHANNEX_STAGING_ACCESS_NOT_VALIDATED")
	const properties = await adapter.listProperties()
	const bookingFeed = await adapter.fetchBookingRevisions()
	const bookingRevisionCounts = bookingFeed.items.reduce<Record<string, number>>(
		(counts, revision) => ({
			...counts,
			[revision.status]: Number(counts[revision.status] ?? 0) + 1,
		}),
		{}
	)

	console.log(
		JSON.stringify(
			{
				ok: true,
				mode: "sandbox",
				access: "validated",
				propertyCount: properties.items.length,
				partial: properties.partial,
				warningCount: properties.warnings.length,
				pageCount: properties.pageCount,
				pendingBookingRevisionCount: bookingFeed.items.length,
				bookingRevisionCounts,
				bookingFeedPartial: bookingFeed.partial,
				requestIds: [...access.requestIds, ...properties.requestIds, ...bookingFeed.requestIds],
			},
			null,
			2
		)
	)
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : "CHANNEX_STAGING_SMOKE_FAILED")
	process.exitCode = 1
})
