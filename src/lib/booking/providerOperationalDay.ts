import { db, eq, first, ProviderProfile } from "@/shared/infrastructure/db/compat"
import { providerCalendarDate } from "@/lib/rates/providerCalendarDate"

export async function loadProviderOperationalDay(providerId: string, now = new Date()) {
	const profile = await db
		.select({ timezone: ProviderProfile.timezone })
		.from(ProviderProfile)
		.where(eq(ProviderProfile.providerId, providerId))
		.then(first)
	const timezone = profile?.timezone?.trim() || "UTC"
	return { timezone, date: providerCalendarDate(timezone, now) }
}

export function isCalendarDay(value: string): boolean {
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		!Number.isNaN(Date.parse(value)) &&
		new Date(value).toISOString().slice(0, 10) === value
	)
}
