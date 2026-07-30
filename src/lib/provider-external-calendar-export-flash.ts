import {
	decryptExternalCalendarUrl,
	encryptExternalCalendarUrl,
	type EncryptedExternalCalendarUrl,
} from "@/lib/provider-external-calendar-secrets"

export const EXTERNAL_CALENDAR_EXPORT_FLASH_COOKIE = "fastt_ical_export_flash"

export function createExternalCalendarExportFlash(params: {
	providerId: string
	exportId: string
	url: string
}): string {
	const { encrypted } = encryptExternalCalendarUrl({
		providerId: params.providerId,
		calendarId: params.exportId,
		url: params.url,
	})
	return Buffer.from(JSON.stringify({ exportId: params.exportId, encrypted }), "utf8").toString(
		"base64url"
	)
}

export function readExternalCalendarExportFlash(params: {
	providerId: string
	value: string
}): string | null {
	try {
		const parsed = JSON.parse(Buffer.from(params.value, "base64url").toString("utf8")) as {
			exportId?: unknown
			encrypted?: EncryptedExternalCalendarUrl
		}
		const exportId = String(parsed.exportId ?? "").trim()
		if (!exportId || !parsed.encrypted) return null
		return decryptExternalCalendarUrl({
			providerId: params.providerId,
			calendarId: exportId,
			encrypted: parsed.encrypted,
		})
	} catch {
		return null
	}
}
