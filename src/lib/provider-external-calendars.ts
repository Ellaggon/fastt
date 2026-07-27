import { createHash, randomBytes } from "node:crypto"
import { isIP } from "node:net"
import ical, { type VEvent } from "node-ical"
import {
	fetchExternalCalendarPinned,
	isPublicExternalCalendarAddress,
	type ExternalCalendarDnsLookup,
} from "@/lib/provider-external-calendar-network"
import {
	decryptExternalCalendarUrl,
	encryptExternalCalendarUrl,
} from "@/lib/provider-external-calendar-secrets"
import {
	and,
	Booking,
	BookingRoomDetail,
	db,
	desc,
	eq,
	gt,
	inArray,
	InventoryResource,
	ne,
	Product,
	ProviderExternalCalendar,
	ProviderExternalCalendarConflict,
	ProviderExternalCalendarEvent,
	ProviderExternalCalendarExport,
	ProviderIntegrationConnection,
	ProviderIntegrationSyncLog,
	sql,
	Variant,
} from "@/shared/infrastructure/db/compat"
import { recomputeEffectiveAvailabilityRange } from "@/modules/inventory/public"

const MAX_FEED_BYTES = 2 * 1024 * 1024
const FETCH_TIMEOUT_MS = 8_000
const MAX_REDIRECTS = 3
const IMPORT_PAST_DAYS = 30
const IMPORT_FUTURE_DAYS = 730
const FASTT_ICAL_PRODID = "-//Fastt//Provider Calendar Export//ES"
const FASTT_ICAL_UID_HOST = "calendar.fastt.local"

export type ParsedExternalCalendarEvent = {
	sourceKey: string
	externalUid: string
	startDate: string
	endDate: string
	sourceUpdatedAt: Date | null
	fingerprint: string
}

export type ExternalCalendarConflict = {
	key: string
	id: string | null
	calendarId: string
	kind: "fastt_booking" | "external_calendar"
	status: "open" | "accepted" | "ignored" | "resolved"
	startDate: string
	endDate: string
	label: string
	description: string
	actionLabel: string
	resourceLabel: string | null
}

export type ProviderExternalCalendarCard = {
	id: string
	name: string
	variantId: string
	resourceId: string | null
	resourceLabel: string | null
	variantName: string
	productName: string
	sourceHost: string
	status: "pending" | "active" | "error" | "revoked"
	lastSyncAt: Date | null
	lastSyncStatus: string | null
	lastError: string | null
	lastEventCount: number
	syncEnabled: boolean
	nextSyncAt: Date | null
	lastAutomaticSyncAt: Date | null
	conflicts: ExternalCalendarConflict[]
}

export type ProviderExternalCalendarVariantOption = {
	id: string
	label: string
	resources: Array<{ id: string; label: string }>
}

export type ProviderExternalCalendarExportLink = {
	id: string
	label: string
	variantId: string
	resourceId: string | null
	variantName: string
	productName: string
	resourceLabel: string | null
	status: "active" | "revoked"
	lastDownloadedAt: Date | null
	downloadCount: number
	url: string | null
}

type FeedFetchResult =
	| { notModified: true; etag: string | null; lastModified: string | null }
	| { notModified: false; body: string; etag: string | null; lastModified: string | null }

type FetchLike = typeof fetch
export type ExternalCalendarSyncTrigger = "manual" | "scheduled" | "retry"

export function mapExternalCalendarError(raw: string | null | undefined): string {
	const value = String(raw ?? "")
	const messages: Record<string, string> = {
		ICAL_URL_INVALID: "La dirección del calendario no es válida.",
		ICAL_URL_HTTPS_REQUIRED: "El calendario debe usar una dirección segura https.",
		ICAL_URL_CREDENTIALS_NOT_ALLOWED: "La URL no puede incluir usuario ni contraseña.",
		ICAL_URL_PRIVATE_HOST: "La dirección apunta a una red privada y no puede consultarse.",
		ICAL_DNS_LOOKUP_FAILED: "No pudimos resolver el dominio del calendario.",
		ICAL_DNS_PRIVATE_ADDRESS:
			"El dominio del calendario resolvió a una dirección privada o reservada.",
		ICAL_FETCH_TIMEOUT: "El calendario tardó demasiado en responder.",
		ICAL_FETCH_FAILED: "No pudimos descargar el calendario.",
		ICAL_REDIRECT_INVALID: "El calendario redirigió a una dirección no permitida.",
		ICAL_FEED_TOO_LARGE: "El archivo supera el límite de 2 MB.",
		ICAL_CONTENT_INVALID: "La respuesta no contiene un calendario iCal válido.",
		ICAL_NAME_INVALID: "Usa un nombre de calendario de 2 a 80 caracteres.",
		ICAL_VARIANT_NOT_FOUND: "La unidad seleccionada no pertenece a este proveedor.",
		ICAL_RESOURCE_NOT_FOUND: "La unidad física seleccionada no pertenece a esa habitación.",
		ICAL_CONFLICT_NOT_FOUND: "El conflicto ya no existe o fue resuelto.",
		ICAL_CALENDAR_NOT_FOUND: "El calendario ya no existe o no tienes acceso.",
		ICAL_EXPORT_NOT_FOUND: "El enlace de exportación ya no existe o fue revocado.",
		ICAL_EXPORT_CREATE_FAILED: "No pudimos crear el enlace de exportación.",
		ICAL_EXPORT_REVOKE_FAILED: "No pudimos revocar el enlace de exportación.",
		ICAL_ENCRYPTION_KEY_REQUIRED:
			"El entorno no tiene configurada la clave para proteger calendarios.",
		ICAL_ENCRYPTION_KEY_UNAVAILABLE:
			"La URL usa una clave anterior que no está disponible en este entorno.",
		ICAL_ENCRYPTED_URL_INVALID: "La URL protegida no tiene un formato válido.",
		ICAL_ENCRYPTED_URL_UNREADABLE: "No pudimos descifrar la URL protegida.",
	}
	if (messages[value]) return messages[value]
	if (/^ICAL_HTTP_\d+$/.test(value)) {
		return `El origen respondió con error ${value.replace("ICAL_HTTP_", "")}.`
	}
	return "No se pudo actualizar el calendario externo."
}

function dateOnly(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function addUtcDays(value: string, days: number): string {
	const date = new Date(`${value}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return dateOnly(date)
}

function importWindow(now = new Date()) {
	const from = new Date(now)
	from.setUTCDate(from.getUTCDate() - IMPORT_PAST_DAYS)
	from.setUTCHours(0, 0, 0, 0)
	const to = new Date(now)
	to.setUTCDate(to.getUTCDate() + IMPORT_FUTURE_DAYS)
	to.setUTCHours(23, 59, 59, 999)
	return { from, to }
}

function nextCalendarSyncAt(now: Date, intervalMinutes: number): Date {
	return new Date(now.getTime() + Math.max(15, intervalMinutes) * 60_000)
}

export function validateExternalCalendarUrl(rawUrl: string): URL {
	let url: URL
	try {
		url = new URL(String(rawUrl ?? "").trim())
	} catch {
		throw new Error("ICAL_URL_INVALID")
	}
	if (url.protocol !== "https:") throw new Error("ICAL_URL_HTTPS_REQUIRED")
	if (url.username || url.password) throw new Error("ICAL_URL_CREDENTIALS_NOT_ALLOWED")

	const hostname = url.hostname
		.toLowerCase()
		.replace(/\.$/, "")
		.replace(/^\[|\]$/g, "")
	const literalFamily = isIP(hostname)
	if (
		!hostname ||
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname.endsWith(".local") ||
		(literalFamily > 0 && !isPublicExternalCalendarAddress(hostname, literalFamily))
	) {
		throw new Error("ICAL_URL_PRIVATE_HOST")
	}
	url.hash = ""
	return url
}

function readTextValue(value: unknown): string {
	if (typeof value === "string") return value
	if (value && typeof value === "object" && "val" in value) {
		return String((value as { val?: unknown }).val ?? "")
	}
	return String(value ?? "")
}

function dateInZone(value: Date, timezone?: string): string {
	if (!timezone) return dateOnly(value)
	try {
		const parts = new Intl.DateTimeFormat("en-CA", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).formatToParts(value)
		const byType = new Map(parts.map((part) => [part.type, part.value]))
		return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`
	} catch {
		return dateOnly(value)
	}
}

function normalizeEventRange(
	event: VEvent,
	start: Date,
	end: Date
): {
	startDate: string
	endDate: string
} | null {
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null
	const timezone = String((start as Date & { tz?: string }).tz ?? "")
	const startDate = dateInZone(start, timezone)
	let endDate = dateInZone(end, String((end as Date & { tz?: string }).tz ?? timezone))

	if (event.datetype !== "date") {
		const localEndTime = new Intl.DateTimeFormat("en-GB", {
			timeZone: timezone || "UTC",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
		}).format(end)
		if (localEndTime !== "00:00:00") endDate = addUtcDays(endDate, 1)
	}
	if (endDate <= startDate) endDate = addUtcDays(startDate, 1)
	return { startDate, endDate }
}

function eventFingerprint(input: {
	uid: string
	startDate: string
	endDate: string
	updatedAt: Date | null
}) {
	return createHash("sha256")
		.update(
			`${input.uid}\n${input.startDate}\n${input.endDate}\n${input.updatedAt?.toISOString() ?? ""}`
		)
		.digest("hex")
}

function readCalendarProperty(component: Record<string, unknown>, name: string): string {
	const direct = component[name] ?? component[name.toLowerCase()] ?? component[name.toUpperCase()]
	return readTextValue(direct).trim()
}

function isFasttExportedEvent(event: VEvent, uid: string): boolean {
	const component = event as unknown as Record<string, unknown>
	const source = readCalendarProperty(component, "x-fastt-source").toLowerCase()
	const provider = readCalendarProperty(component, "x-fastt-provider-id")
	if (source === "fastt" || provider) return true
	return uid.toLowerCase().endsWith(`@${FASTT_ICAL_UID_HOST}`)
}

export async function parseExternalCalendarEvents(
	source: string,
	options?: { now?: Date }
): Promise<ParsedExternalCalendarEvent[]> {
	if (!source.includes("BEGIN:VCALENDAR")) throw new Error("ICAL_CONTENT_INVALID")
	const parsed = await ical.async.parseICS(source)
	const window = importWindow(options?.now)
	const normalized = new Map<string, ParsedExternalCalendarEvent>()

	for (const component of Object.values(parsed)) {
		if (!component || component.type !== "VEVENT") continue
		const event = component
		if (event.status === "CANCELLED" || event.transparency === "TRANSPARENT") continue
		const uid = readTextValue(event.uid).trim()
		if (!uid || !event.start) continue
		if (isFasttExportedEvent(event, uid)) continue
		const fallbackEnd = new Date(
			event.start.getTime() + (event.datetype === "date" ? 86_400_000 : 3_600_000)
		)
		const instances = event.rrule
			? ical.expandRecurringEvent(event, {
					from: window.from,
					to: window.to,
					includeOverrides: true,
					excludeExdates: true,
					expandOngoing: true,
				})
			: [
					{
						start: event.start,
						end: event.end ?? fallbackEnd,
						event,
					},
				]

		for (const instance of instances) {
			const range = normalizeEventRange(instance.event, instance.start, instance.end)
			if (!range) continue
			if (range.endDate < dateOnly(window.from) || range.startDate > dateOnly(window.to)) continue
			const sourceKey = `${uid}:${instance.start.toISOString()}`
			const sourceUpdatedAt =
				instance.event.lastmodified instanceof Date ? instance.event.lastmodified : null
			normalized.set(sourceKey, {
				sourceKey,
				externalUid: uid.slice(0, 500),
				startDate: range.startDate,
				endDate: range.endDate,
				sourceUpdatedAt,
				fingerprint: eventFingerprint({
					uid,
					startDate: range.startDate,
					endDate: range.endDate,
					updatedAt: sourceUpdatedAt,
				}),
			})
		}
	}

	return [...normalized.values()].sort(
		(a, b) => a.startDate.localeCompare(b.startDate) || a.sourceKey.localeCompare(b.sourceKey)
	)
}

async function fetchExternalCalendar(
	rawUrl: string,
	options?: {
		etag?: string | null
		lastModified?: string | null
		fetchImpl?: FetchLike
		dnsLookup?: ExternalCalendarDnsLookup
	}
): Promise<FeedFetchResult> {
	const fetchImpl = options?.fetchImpl ?? fetch
	let url = validateExternalCalendarUrl(rawUrl)
	const headers = new Headers({
		"Accept": "text/calendar, text/plain;q=0.9, */*;q=0.1",
		"User-Agent": "Fastt-iCal/1.0",
	})
	if (options?.etag) headers.set("If-None-Match", options.etag)
	if (options?.lastModified) headers.set("If-Modified-Since", options.lastModified)

	for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
		let response: Response
		try {
			response = options?.fetchImpl
				? await fetchImpl(url, {
						headers,
						redirect: "manual",
						signal: controller.signal,
					})
				: await fetchExternalCalendarPinned({
						url,
						headers,
						timeoutMs: FETCH_TIMEOUT_MS,
						maxBytes: MAX_FEED_BYTES,
						dnsLookup: options?.dnsLookup,
					})
		} catch (error) {
			if ((error as { name?: string })?.name === "AbortError") throw new Error("ICAL_FETCH_TIMEOUT")
			if (error instanceof Error && error.message.startsWith("ICAL_")) throw error
			throw new Error("ICAL_FETCH_FAILED")
		} finally {
			clearTimeout(timer)
		}

		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("location")
			if (!location || redirect === MAX_REDIRECTS) throw new Error("ICAL_REDIRECT_INVALID")
			url = validateExternalCalendarUrl(new URL(location, url).toString())
			continue
		}
		if (response.status === 304) {
			return {
				notModified: true,
				etag: response.headers.get("etag") ?? options?.etag ?? null,
				lastModified: response.headers.get("last-modified") ?? options?.lastModified ?? null,
			}
		}
		if (!response.ok) throw new Error(`ICAL_HTTP_${response.status}`)
		const declaredLength = Number(response.headers.get("content-length") ?? 0)
		if (declaredLength > MAX_FEED_BYTES) throw new Error("ICAL_FEED_TOO_LARGE")
		const body = await response.text()
		if (Buffer.byteLength(body, "utf8") > MAX_FEED_BYTES) throw new Error("ICAL_FEED_TOO_LARGE")
		return {
			notModified: false,
			body,
			etag: response.headers.get("etag"),
			lastModified: response.headers.get("last-modified"),
		}
	}
	throw new Error("ICAL_REDIRECT_INVALID")
}

async function ensureExternalCalendarConnection(providerId: string): Promise<string> {
	const existing = await db
		.select()
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.providerId, providerId),
				eq(ProviderIntegrationConnection.connectorKey, "external_calendars")
			)
		)
		.then((rows) => rows.find((row) => row.isPrimary) ?? rows[0])
	if (existing?.id) return existing.id
	const id = crypto.randomUUID()
	await db.insert(ProviderIntegrationConnection).values({
		id,
		providerId,
		connectorKey: "external_calendars",
		displayName: "Calendarios externos",
		isPrimary: true,
		status: "pending",
		mode: "production",
		scopesJson: ["calendar:import"],
		createdAt: new Date(),
		updatedAt: new Date(),
	})
	return id
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function newExportToken(): string {
	return randomBytes(32).toString("base64url")
}

function icalDate(value: string): string {
	return String(value).replaceAll("-", "")
}

function icalTimestamp(value: Date): string {
	return value
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}Z$/, "Z")
}

function escapeIcalText(value: unknown): string {
	return String(value ?? "")
		.replace(/\\/g, "\\\\")
		.replace(/\n/g, "\\n")
		.replace(/,/g, "\\,")
		.replace(/;/g, "\\;")
}

function foldIcalLine(line: string): string {
	if (line.length <= 72) return line
	const chunks: string[] = []
	let current = line
	while (current.length > 72) {
		chunks.push(current.slice(0, 72))
		current = ` ${current.slice(72)}`
	}
	chunks.push(current)
	return chunks.join("\r\n")
}

function buildExportUrl(params: { baseUrl: string; exportId: string; token: string | null }) {
	if (!params.token) return null
	const url = new URL(`/api/ical/exports/${params.exportId}.ics`, params.baseUrl)
	url.searchParams.set("token", params.token)
	return url.toString()
}

async function assertVariantOwnedByProvider(providerId: string, variantId: string) {
	const row = await db
		.select({ id: Variant.id })
		.from(Variant)
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(and(eq(Variant.id, variantId), eq(Product.providerId, providerId)))
		.then((rows) => rows[0])
	if (!row) throw new Error("ICAL_VARIANT_NOT_FOUND")
}

async function assertResourceOwnedByProvider(params: {
	providerId: string
	variantId: string
	resourceId: string
}) {
	const row = await db
		.select({ id: InventoryResource.id })
		.from(InventoryResource)
		.where(
			and(
				eq(InventoryResource.id, params.resourceId),
				eq(InventoryResource.providerId, params.providerId),
				eq(InventoryResource.variantId, params.variantId),
				ne(InventoryResource.status, "archived")
			)
		)
		.then((rows) => rows[0])
	if (!row) throw new Error("ICAL_RESOURCE_NOT_FOUND")
}

function normalizeResourceLabel(value: unknown): string {
	return String(value ?? "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, 80)
}

async function resolveCalendarResource(params: {
	providerId: string
	variantId: string
	resourceId?: string | null
	resourceLabel?: string | null
}): Promise<string | null> {
	const resourceId = String(params.resourceId ?? "").trim()
	if (resourceId) {
		await assertResourceOwnedByProvider({
			providerId: params.providerId,
			variantId: params.variantId,
			resourceId,
		})
		return resourceId
	}
	const label = normalizeResourceLabel(params.resourceLabel)
	if (!label) return null
	const existing = await db
		.select({ id: InventoryResource.id })
		.from(InventoryResource)
		.where(
			and(
				eq(InventoryResource.providerId, params.providerId),
				eq(InventoryResource.variantId, params.variantId),
				eq(InventoryResource.label, label)
			)
		)
		.then((rows) => rows[0])
	if (existing?.id) return existing.id
	const id = crypto.randomUUID()
	await db.insert(InventoryResource).values({
		id,
		providerId: params.providerId,
		variantId: params.variantId,
		label,
		status: "active",
		createdAt: new Date(),
		updatedAt: new Date(),
	})
	return id
}

function rangeFromEvents(
	events: Array<{ startDate: string; endDate: string }>
): { from: string; to: string } | null {
	if (!events.length) return null
	return {
		from: events.map((event) => String(event.startDate)).sort()[0],
		to: events
			.map((event) => String(event.endDate))
			.sort()
			.at(-1)!,
	}
}

async function recomputeCalendarRange(
	variantId: string,
	events: Array<{ startDate: string; endDate: string }>,
	reason: string
) {
	const range = rangeFromEvents(events)
	if (!range || range.to <= range.from) return
	await recomputeEffectiveAvailabilityRange({
		variantId,
		from: range.from,
		to: range.to,
		reason,
		idempotencyKey: `${reason}:${variantId}:${range.from}:${range.to}`,
	})
}

async function logCalendarSync(params: {
	providerId: string
	connectionId: string
	status: string
	message: string
	metadata?: Record<string, unknown>
}) {
	await db.insert(ProviderIntegrationSyncLog).values({
		id: crypto.randomUUID(),
		providerId: params.providerId,
		connectorKey: "external_calendars",
		connectionId: params.connectionId,
		eventType: "calendar.sync",
		status: params.status,
		mode: "production",
		message: params.message,
		metadataJson: params.metadata ?? {},
		createdAt: new Date(),
	})
}

export async function createProviderExternalCalendar(params: {
	providerId: string
	currentUserId?: string | null
	name: string
	variantId: string
	resourceId?: string | null
	resourceLabel?: string | null
	feedUrl: string
	fetchImpl?: FetchLike
	dnsLookup?: ExternalCalendarDnsLookup
}) {
	const name = String(params.name ?? "").trim()
	if (name.length < 2 || name.length > 80) throw new Error("ICAL_NAME_INVALID")
	const feedUrl = validateExternalCalendarUrl(params.feedUrl).toString()
	await assertVariantOwnedByProvider(params.providerId, params.variantId)
	const resourceId = await resolveCalendarResource({
		providerId: params.providerId,
		variantId: params.variantId,
		resourceId: params.resourceId,
		resourceLabel: params.resourceLabel,
	})
	const connectionId = await ensureExternalCalendarConnection(params.providerId)
	const id = crypto.randomUUID()
	const protectedUrl = encryptExternalCalendarUrl({
		providerId: params.providerId,
		calendarId: id,
		url: feedUrl,
	})
	await db.insert(ProviderExternalCalendar).values({
		id,
		providerId: params.providerId,
		connectionId,
		variantId: params.variantId,
		resourceId,
		name,
		feedUrlEncrypted: protectedUrl.encrypted,
		feedUrlHost: new URL(feedUrl).hostname,
		feedUrlFingerprint: protectedUrl.fingerprint,
		status: "pending",
		createdAt: new Date(),
		updatedAt: new Date(),
	})
	await syncProviderExternalCalendar({
		providerId: params.providerId,
		calendarId: id,
		currentUserId: params.currentUserId,
		fetchImpl: params.fetchImpl,
		dnsLookup: params.dnsLookup,
	})
	return id
}

export async function syncProviderExternalCalendar(params: {
	providerId: string
	calendarId: string
	currentUserId?: string | null
	fetchImpl?: FetchLike
	dnsLookup?: ExternalCalendarDnsLookup
	trigger?: ExternalCalendarSyncTrigger
	idempotencyKey?: string | null
}) {
	const calendar = await db
		.select()
		.from(ProviderExternalCalendar)
		.where(
			and(
				eq(ProviderExternalCalendar.id, params.calendarId),
				eq(ProviderExternalCalendar.providerId, params.providerId),
				ne(ProviderExternalCalendar.status, "revoked")
			)
		)
		.then((rows) => rows[0])
	if (!calendar) throw new Error("ICAL_CALENDAR_NOT_FOUND")
	const now = new Date()
	const {
		finishProviderIntegrationSyncRun,
		recordProviderIntegrationIncident,
		resolveProviderIntegrationIncidentByKey,
		startProviderIntegrationSyncRun,
	} = await import("@/lib/provider-integration-operations")
	const run = calendar.connectionId
		? await startProviderIntegrationSyncRun({
				providerId: params.providerId,
				connectionId: calendar.connectionId,
				operation: "calendar_import",
				trigger: params.trigger ?? "manual",
				requestedBy: params.currentUserId,
				idempotencyKey: params.idempotencyKey,
			})
		: null

	try {
		const feedUrl = decryptExternalCalendarUrl({
			providerId: calendar.providerId,
			calendarId: calendar.id,
			encrypted: calendar.feedUrlEncrypted,
		})
		const fetched = await fetchExternalCalendar(feedUrl, {
			etag: calendar.etag,
			lastModified: calendar.lastModified,
			fetchImpl: params.fetchImpl,
			dnsLookup: params.dnsLookup,
		})
		if (fetched.notModified) {
			await db
				.update(ProviderExternalCalendar)
				.set({
					status: "active",
					lastSyncAt: now,
					lastSyncStatus: "not_modified",
					lastError: null,
					etag: fetched.etag,
					lastModified: fetched.lastModified,
					nextSyncAt: nextCalendarSyncAt(now, Number(calendar.syncIntervalMinutes ?? 1440)),
					lastAutomaticSyncAt: params.trigger === "scheduled" ? now : calendar.lastAutomaticSyncAt,
					consecutiveFailures: 0,
					updatedAt: now,
				})
				.where(eq(ProviderExternalCalendar.id, calendar.id))
			if (run) {
				await finishProviderIntegrationSyncRun({
					providerId: params.providerId,
					runId: run.id,
					status: "succeeded",
					readCount: Number(calendar.lastEventCount ?? 0),
					skippedCount: Number(calendar.lastEventCount ?? 0),
					summaryJson: { calendarId: calendar.id, notModified: true },
				})
				await resolveProviderIntegrationIncidentByKey({
					providerId: params.providerId,
					connectionId: calendar.connectionId!,
					dedupeKey: `calendar_sync_failed:${calendar.id}`,
					resolvedBy: params.currentUserId,
				})
			}
			return { status: "not_modified" as const, imported: Number(calendar.lastEventCount ?? 0) }
		}

		const parsed = await parseExternalCalendarEvents(fetched.body, { now })
		const previous = await db
			.select({
				startDate: ProviderExternalCalendarEvent.startDate,
				endDate: ProviderExternalCalendarEvent.endDate,
			})
			.from(ProviderExternalCalendarEvent)
			.where(
				and(
					eq(ProviderExternalCalendarEvent.calendarId, calendar.id),
					eq(ProviderExternalCalendarEvent.isActive, true)
				)
			)

		await db.transaction(async (tx) => {
			await tx
				.update(ProviderExternalCalendarEvent)
				.set({ isActive: false, lastSeenAt: now })
				.where(eq(ProviderExternalCalendarEvent.calendarId, calendar.id))
			for (const event of parsed) {
				await tx
					.insert(ProviderExternalCalendarEvent)
					.values({
						id: crypto.randomUUID(),
						calendarId: calendar.id,
						providerId: calendar.providerId,
						variantId: calendar.variantId,
						resourceId: calendar.resourceId ?? null,
						sourceKey: event.sourceKey,
						externalUid: event.externalUid,
						summary: null,
						startDate: event.startDate,
						endDate: event.endDate,
						sourceUpdatedAt: event.sourceUpdatedAt,
						fingerprint: event.fingerprint,
						isActive: true,
						firstSeenAt: now,
						lastSeenAt: now,
					})
					.onConflictDoUpdate({
						target: [
							ProviderExternalCalendarEvent.calendarId,
							ProviderExternalCalendarEvent.sourceKey,
						],
						set: {
							startDate: event.startDate,
							endDate: event.endDate,
							resourceId: calendar.resourceId ?? null,
							sourceUpdatedAt: event.sourceUpdatedAt,
							fingerprint: event.fingerprint,
							isActive: true,
							lastSeenAt: now,
						},
					})
			}
			await tx
				.update(ProviderExternalCalendar)
				.set({
					status: "active",
					lastSyncAt: now,
					lastSyncStatus: "success",
					lastError: null,
					lastEventCount: parsed.length,
					etag: fetched.etag,
					lastModified: fetched.lastModified,
					nextSyncAt: nextCalendarSyncAt(now, Number(calendar.syncIntervalMinutes ?? 1440)),
					lastAutomaticSyncAt: params.trigger === "scheduled" ? now : calendar.lastAutomaticSyncAt,
					consecutiveFailures: 0,
					updatedAt: now,
				})
				.where(eq(ProviderExternalCalendar.id, calendar.id))
			await tx
				.update(ProviderIntegrationConnection)
				.set({
					status: "connected",
					lastSyncAt: now,
					lastSyncStatus: "success",
					errorMessage: null,
					updatedAt: now,
				})
				.where(eq(ProviderIntegrationConnection.id, calendar.connectionId ?? ""))
		})

		await recomputeCalendarRange(
			calendar.variantId,
			[...previous, ...parsed],
			"external_calendar_sync"
		)
		if (calendar.connectionId) {
			await logCalendarSync({
				providerId: calendar.providerId,
				connectionId: calendar.connectionId,
				status: "success",
				message: `${parsed.length} bloqueos iCal reconciliados.`,
				metadata: { calendarId: calendar.id, imported: parsed.length },
			})
		}
		if (run) {
			await finishProviderIntegrationSyncRun({
				providerId: params.providerId,
				runId: run.id,
				status: "succeeded",
				readCount: parsed.length,
				changedCount: parsed.length,
				summaryJson: { calendarId: calendar.id, imported: parsed.length },
			})
			await resolveProviderIntegrationIncidentByKey({
				providerId: params.providerId,
				connectionId: calendar.connectionId!,
				dedupeKey: `calendar_sync_failed:${calendar.id}`,
				resolvedBy: params.currentUserId,
				resolutionNote: "El calendario volvió a sincronizar correctamente.",
			})
		}
		return { status: "success" as const, imported: parsed.length }
	} catch (error) {
		const message = error instanceof Error ? error.message : "ICAL_SYNC_FAILED"
		await db
			.update(ProviderExternalCalendar)
			.set({
				status: "error",
				lastSyncAt: now,
				lastSyncStatus: "error",
				lastError: message,
				updatedAt: now,
			})
			.where(eq(ProviderExternalCalendar.id, calendar.id))
		if (calendar.connectionId) {
			await db
				.update(ProviderIntegrationConnection)
				.set({
					status: "requires_attention",
					lastSyncAt: now,
					lastSyncStatus: "error",
					errorMessage: message,
					updatedAt: now,
				})
				.where(eq(ProviderIntegrationConnection.id, calendar.connectionId))
		}
		if (calendar.connectionId) {
			await logCalendarSync({
				providerId: calendar.providerId,
				connectionId: calendar.connectionId,
				status: "error",
				message,
				metadata: { calendarId: calendar.id },
			})
		}
		if (run && calendar.connectionId) {
			await finishProviderIntegrationSyncRun({
				providerId: params.providerId,
				runId: run.id,
				status: "failed",
				failedCount: 1,
				errorCode: message,
				errorMessage: mapExternalCalendarError(message),
				summaryJson: { calendarId: calendar.id },
			})
			await recordProviderIntegrationIncident({
				providerId: params.providerId,
				connectionId: calendar.connectionId,
				syncRunId: run.id,
				input: {
					dedupeKey: `calendar_sync_failed:${calendar.id}`,
					code: message.slice(0, 100),
					category: "remote_api",
					severity: "error",
					title: `No se pudo actualizar ${calendar.name}`,
					description: mapExternalCalendarError(message),
					actionLabel: "Revisar calendario",
					actionHref: "/provider/settings/integrations?mode=pro",
					entityType: "calendar",
					entityId: calendar.id,
				},
			})
		}
		throw error
	}
}

export async function syncAllProviderExternalCalendars(params: {
	providerId: string
	currentUserId?: string | null
	fetchImpl?: FetchLike
	dnsLookup?: ExternalCalendarDnsLookup
	trigger?: ExternalCalendarSyncTrigger
}) {
	const calendars = await db
		.select({ id: ProviderExternalCalendar.id })
		.from(ProviderExternalCalendar)
		.where(
			and(
				eq(ProviderExternalCalendar.providerId, params.providerId),
				ne(ProviderExternalCalendar.status, "revoked")
			)
		)
	const results = await Promise.allSettled(
		calendars.map((calendar) =>
			syncProviderExternalCalendar({
				providerId: params.providerId,
				calendarId: calendar.id,
				currentUserId: params.currentUserId,
				fetchImpl: params.fetchImpl,
				dnsLookup: params.dnsLookup,
				trigger: params.trigger,
			})
		)
	)
	return {
		total: results.length,
		succeeded: results.filter((result) => result.status === "fulfilled").length,
		failed: results.filter((result) => result.status === "rejected").length,
	}
}

export async function revokeProviderExternalCalendar(params: {
	providerId: string
	calendarId: string
}) {
	const calendar = await db
		.select()
		.from(ProviderExternalCalendar)
		.where(
			and(
				eq(ProviderExternalCalendar.id, params.calendarId),
				eq(ProviderExternalCalendar.providerId, params.providerId)
			)
		)
		.then((rows) => rows[0])
	if (!calendar) throw new Error("ICAL_CALENDAR_NOT_FOUND")
	const previous = await db
		.select({
			startDate: ProviderExternalCalendarEvent.startDate,
			endDate: ProviderExternalCalendarEvent.endDate,
		})
		.from(ProviderExternalCalendarEvent)
		.where(
			and(
				eq(ProviderExternalCalendarEvent.calendarId, calendar.id),
				eq(ProviderExternalCalendarEvent.isActive, true)
			)
		)
	await db.transaction(async (tx) => {
		await tx
			.update(ProviderExternalCalendar)
			.set({
				status: "revoked",
				lastSyncStatus: "revoked",
				lastError: null,
				syncEnabled: false,
				syncLeaseToken: null,
				syncLeaseUntil: null,
				updatedAt: new Date(),
			})
			.where(eq(ProviderExternalCalendar.id, calendar.id))
		await tx
			.update(ProviderExternalCalendarEvent)
			.set({ isActive: false, lastSeenAt: new Date() })
			.where(eq(ProviderExternalCalendarEvent.calendarId, calendar.id))
	})
	await recomputeCalendarRange(calendar.variantId, previous, "external_calendar_revoked")
	if (calendar.connectionId) {
		const remaining = await db
			.select({ id: ProviderExternalCalendar.id })
			.from(ProviderExternalCalendar)
			.where(
				and(
					eq(ProviderExternalCalendar.providerId, params.providerId),
					ne(ProviderExternalCalendar.status, "revoked")
				)
			)
		if (!remaining.length) {
			await db
				.update(ProviderIntegrationConnection)
				.set({
					status: "revoked",
					lastSyncStatus: "revoked",
					errorMessage: null,
					updatedAt: new Date(),
				})
				.where(eq(ProviderIntegrationConnection.id, calendar.connectionId))
		}
	}
}

export async function createProviderExternalCalendarExport(params: {
	providerId: string
	variantId: string
	resourceId?: string | null
	label?: string | null
	baseUrl: string
}) {
	await assertVariantOwnedByProvider(params.providerId, params.variantId)
	const resourceId = params.resourceId
		? await resolveCalendarResource({
				providerId: params.providerId,
				variantId: params.variantId,
				resourceId: params.resourceId,
			})
		: null
	const token = newExportToken()
	const id = crypto.randomUUID()
	const label =
		String(params.label ?? "")
			.trim()
			.slice(0, 80) || "Fastt · Exportación iCal"
	await db.insert(ProviderExternalCalendarExport).values({
		id,
		providerId: params.providerId,
		variantId: params.variantId,
		resourceId,
		label,
		tokenHash: sha256(token),
		status: "active",
		createdAt: new Date(),
		updatedAt: new Date(),
	})
	return {
		id,
		url: buildExportUrl({ baseUrl: params.baseUrl, exportId: id, token })!,
	}
}

export async function revokeProviderExternalCalendarExport(params: {
	providerId: string
	exportId: string
}) {
	await db
		.update(ProviderExternalCalendarExport)
		.set({ status: "revoked", updatedAt: new Date() })
		.where(
			and(
				eq(ProviderExternalCalendarExport.id, params.exportId),
				eq(ProviderExternalCalendarExport.providerId, params.providerId)
			)
		)
}

export async function renderProviderExternalCalendarExport(params: {
	exportId: string
	token: string
	now?: Date
}) {
	const tokenHash = sha256(String(params.token ?? ""))
	const exportRow = await db
		.select({
			id: ProviderExternalCalendarExport.id,
			providerId: ProviderExternalCalendarExport.providerId,
			variantId: ProviderExternalCalendarExport.variantId,
			resourceId: ProviderExternalCalendarExport.resourceId,
			label: ProviderExternalCalendarExport.label,
			status: ProviderExternalCalendarExport.status,
			productName: Product.name,
			variantName: Variant.name,
		})
		.from(ProviderExternalCalendarExport)
		.innerJoin(Variant, eq(Variant.id, ProviderExternalCalendarExport.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(
			and(
				eq(ProviderExternalCalendarExport.id, params.exportId),
				eq(ProviderExternalCalendarExport.tokenHash, tokenHash),
				eq(ProviderExternalCalendarExport.status, "active")
			)
		)
		.then((rows) => rows[0])
	if (!exportRow) throw new Error("ICAL_EXPORT_NOT_FOUND")

	const now = params.now ?? new Date()
	const rows = await db
		.select({
			bookingId: BookingRoomDetail.bookingId,
			roomDetailId: BookingRoomDetail.id,
			startDate: BookingRoomDetail.checkIn,
			endDate: BookingRoomDetail.checkOut,
			bookingStatus: Booking.status,
		})
		.from(BookingRoomDetail)
		.innerJoin(Booking, eq(Booking.id, BookingRoomDetail.bookingId))
		.where(
			and(
				eq(Booking.providerId, exportRow.providerId),
				eq(BookingRoomDetail.variantId, exportRow.variantId),
				ne(Booking.status, "cancelled"),
				gt(BookingRoomDetail.checkOut, dateOnly(now))
			)
		)

	const stamp = icalTimestamp(now)
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		`PRODID:${FASTT_ICAL_PRODID}`,
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"X-WR-CALNAME:" +
			escapeIcalText(`${exportRow.label} · ${exportRow.productName} · ${exportRow.variantName}`),
		"X-FASTT-SOURCE:fastt",
		`X-FASTT-PROVIDER-ID:${escapeIcalText(exportRow.providerId)}`,
	]
	for (const row of rows) {
		lines.push(
			"BEGIN:VEVENT",
			`UID:fastt-${row.roomDetailId}@${FASTT_ICAL_UID_HOST}`,
			`DTSTAMP:${stamp}`,
			`DTSTART;VALUE=DATE:${icalDate(row.startDate)}`,
			`DTEND;VALUE=DATE:${icalDate(row.endDate)}`,
			`SUMMARY:${escapeIcalText("Reservado en Fastt")}`,
			`DESCRIPTION:${escapeIcalText("Bloqueo generado por Fastt. No reimportar como calendario externo.")}`,
			"STATUS:CONFIRMED",
			"TRANSP:OPAQUE",
			"X-FASTT-SOURCE:fastt",
			`X-FASTT-PROVIDER-ID:${escapeIcalText(exportRow.providerId)}`,
			`X-FASTT-BOOKING-ID:${escapeIcalText(row.bookingId)}`,
			`X-FASTT-VARIANT-ID:${escapeIcalText(exportRow.variantId)}`,
			...(exportRow.resourceId
				? [`X-FASTT-RESOURCE-ID:${escapeIcalText(exportRow.resourceId)}`]
				: []),
			"END:VEVENT"
		)
	}
	lines.push("END:VCALENDAR")
	await db
		.update(ProviderExternalCalendarExport)
		.set({
			lastDownloadedAt: now,
			downloadCount: sql`${ProviderExternalCalendarExport.downloadCount} + 1`,
			updatedAt: now,
		})
		.where(eq(ProviderExternalCalendarExport.id, exportRow.id))
	return (
		lines
			.filter(Boolean)
			.map((line) => foldIcalLine(String(line)))
			.join("\r\n") + "\r\n"
	)
}

function overlaps(
	left: { startDate: string; endDate: string },
	right: { startDate: string; endDate: string }
) {
	return left.startDate < right.endDate && right.startDate < left.endDate
}

function samePhysicalConflictScope(
	left: { variantId: string; resourceId?: string | null },
	right: { variantId: string; resourceId?: string | null }
) {
	if (left.variantId !== right.variantId) return false
	if (left.resourceId && right.resourceId) return left.resourceId === right.resourceId
	return true
}

type DetectedCalendarConflict = {
	calendarId: string
	variantId: string
	resourceId: string | null
	kind: "fastt_booking" | "external_calendar"
	dedupeKey: string
	startDate: string
	endDate: string
	title: string
	description: string
	actionLabel: string
	metadataJson?: Record<string, unknown>
}

async function reconcileExternalCalendarConflicts(
	providerId: string,
	detected: DetectedCalendarConflict[]
) {
	const now = new Date()
	const activeCalendarIds = [...new Set(detected.map((conflict) => conflict.calendarId))]
	for (const conflict of detected) {
		await db
			.insert(ProviderExternalCalendarConflict)
			.values({
				id: crypto.randomUUID(),
				providerId,
				calendarId: conflict.calendarId,
				variantId: conflict.variantId,
				resourceId: conflict.resourceId,
				kind: conflict.kind,
				status: "open",
				dedupeKey: conflict.dedupeKey,
				startDate: conflict.startDate,
				endDate: conflict.endDate,
				title: conflict.title,
				description: conflict.description,
				actionLabel: conflict.actionLabel,
				metadataJson: conflict.metadataJson ?? {},
				firstSeenAt: now,
				lastSeenAt: now,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [
					ProviderExternalCalendarConflict.calendarId,
					ProviderExternalCalendarConflict.dedupeKey,
				],
				set: {
					variantId: conflict.variantId,
					resourceId: conflict.resourceId,
					startDate: conflict.startDate,
					endDate: conflict.endDate,
					title: conflict.title,
					description: conflict.description,
					actionLabel: conflict.actionLabel,
					metadataJson: conflict.metadataJson ?? {},
					status: sql`case when ${ProviderExternalCalendarConflict.status} = 'resolved' then 'open' else ${ProviderExternalCalendarConflict.status} end`,
					lastSeenAt: now,
					updatedAt: now,
				},
			})
	}
	if (!activeCalendarIds.length) return
	const activeDedupeKeys = new Set(
		detected.map((conflict) => `${conflict.calendarId}:${conflict.dedupeKey}`)
	)
	const existing = await db
		.select({
			id: ProviderExternalCalendarConflict.id,
			calendarId: ProviderExternalCalendarConflict.calendarId,
			dedupeKey: ProviderExternalCalendarConflict.dedupeKey,
			status: ProviderExternalCalendarConflict.status,
		})
		.from(ProviderExternalCalendarConflict)
		.where(
			and(
				eq(ProviderExternalCalendarConflict.providerId, providerId),
				inArray(ProviderExternalCalendarConflict.calendarId, activeCalendarIds)
			)
		)
	for (const row of existing) {
		if (row.status !== "open") continue
		if (activeDedupeKeys.has(`${row.calendarId}:${row.dedupeKey}`)) continue
		await db
			.update(ProviderExternalCalendarConflict)
			.set({
				status: "resolved",
				resolutionNote: "El conflicto dejó de detectarse.",
				actedAt: now,
				updatedAt: now,
			})
			.where(eq(ProviderExternalCalendarConflict.id, row.id))
	}
}

export async function resolveProviderExternalCalendarConflict(params: {
	providerId: string
	conflictId: string
	action: "accept" | "ignore" | "resolve"
	currentUserId?: string | null
}) {
	const conflict = await db
		.select()
		.from(ProviderExternalCalendarConflict)
		.where(
			and(
				eq(ProviderExternalCalendarConflict.id, params.conflictId),
				eq(ProviderExternalCalendarConflict.providerId, params.providerId)
			)
		)
		.then((rows) => rows[0])
	if (!conflict) throw new Error("ICAL_CONFLICT_NOT_FOUND")
	const status =
		params.action === "accept" ? "accepted" : params.action === "ignore" ? "ignored" : "resolved"
	const note =
		params.action === "accept"
			? "Bloqueo externo aceptado por el proveedor."
			: params.action === "ignore"
				? "Alerta ignorada por el proveedor."
				: "Marcado como resuelto por el proveedor."
	await db
		.update(ProviderExternalCalendarConflict)
		.set({
			status,
			resolutionNote: note,
			actedAt: new Date(),
			actedBy: params.currentUserId ?? null,
			updatedAt: new Date(),
		})
		.where(eq(ProviderExternalCalendarConflict.id, conflict.id))
	return conflict.calendarId
}

export async function listProviderExternalCalendars(providerId: string): Promise<{
	calendars: ProviderExternalCalendarCard[]
	variants: ProviderExternalCalendarVariantOption[]
	exports: ProviderExternalCalendarExportLink[]
}> {
	const [calendarRows, eventRows, bookingRows, variantRows, resourceRows, exportRows] =
		await Promise.all([
			db
				.select({
					id: ProviderExternalCalendar.id,
					name: ProviderExternalCalendar.name,
					variantId: ProviderExternalCalendar.variantId,
					resourceId: ProviderExternalCalendar.resourceId,
					feedUrlHost: ProviderExternalCalendar.feedUrlHost,
					status: ProviderExternalCalendar.status,
					lastSyncAt: ProviderExternalCalendar.lastSyncAt,
					lastSyncStatus: ProviderExternalCalendar.lastSyncStatus,
					lastError: ProviderExternalCalendar.lastError,
					lastEventCount: ProviderExternalCalendar.lastEventCount,
					syncEnabled: ProviderExternalCalendar.syncEnabled,
					nextSyncAt: ProviderExternalCalendar.nextSyncAt,
					lastAutomaticSyncAt: ProviderExternalCalendar.lastAutomaticSyncAt,
					variantName: Variant.name,
					productName: Product.name,
					resourceLabel: InventoryResource.label,
				})
				.from(ProviderExternalCalendar)
				.innerJoin(Variant, eq(Variant.id, ProviderExternalCalendar.variantId))
				.innerJoin(Product, eq(Product.id, Variant.productId))
				.leftJoin(InventoryResource, eq(InventoryResource.id, ProviderExternalCalendar.resourceId))
				.where(eq(ProviderExternalCalendar.providerId, providerId))
				.orderBy(desc(ProviderExternalCalendar.updatedAt)),
			db
				.select({
					id: ProviderExternalCalendarEvent.id,
					calendarId: ProviderExternalCalendarEvent.calendarId,
					variantId: ProviderExternalCalendarEvent.variantId,
					resourceId: ProviderExternalCalendarEvent.resourceId,
					startDate: ProviderExternalCalendarEvent.startDate,
					endDate: ProviderExternalCalendarEvent.endDate,
				})
				.from(ProviderExternalCalendarEvent)
				.where(
					and(
						eq(ProviderExternalCalendarEvent.providerId, providerId),
						eq(ProviderExternalCalendarEvent.isActive, true),
						gt(ProviderExternalCalendarEvent.endDate, dateOnly(new Date()))
					)
				),
			db
				.select({
					bookingId: BookingRoomDetail.bookingId,
					variantId: BookingRoomDetail.variantId,
					startDate: BookingRoomDetail.checkIn,
					endDate: BookingRoomDetail.checkOut,
				})
				.from(BookingRoomDetail)
				.innerJoin(Booking, eq(Booking.id, BookingRoomDetail.bookingId))
				.where(
					and(
						eq(Booking.providerId, providerId),
						ne(Booking.status, "cancelled"),
						gt(BookingRoomDetail.checkOut, dateOnly(new Date()))
					)
				),
			db
				.select({
					id: Variant.id,
					variantName: Variant.name,
					productName: Product.name,
				})
				.from(Variant)
				.innerJoin(Product, eq(Product.id, Variant.productId))
				.where(and(eq(Product.providerId, providerId), eq(Variant.isActive, true))),
			db
				.select({
					id: InventoryResource.id,
					variantId: InventoryResource.variantId,
					label: InventoryResource.label,
				})
				.from(InventoryResource)
				.where(
					and(eq(InventoryResource.providerId, providerId), eq(InventoryResource.status, "active"))
				),
			db
				.select({
					id: ProviderExternalCalendarExport.id,
					label: ProviderExternalCalendarExport.label,
					variantId: ProviderExternalCalendarExport.variantId,
					resourceId: ProviderExternalCalendarExport.resourceId,
					status: ProviderExternalCalendarExport.status,
					lastDownloadedAt: ProviderExternalCalendarExport.lastDownloadedAt,
					downloadCount: ProviderExternalCalendarExport.downloadCount,
					variantName: Variant.name,
					productName: Product.name,
					resourceLabel: InventoryResource.label,
				})
				.from(ProviderExternalCalendarExport)
				.innerJoin(Variant, eq(Variant.id, ProviderExternalCalendarExport.variantId))
				.innerJoin(Product, eq(Product.id, Variant.productId))
				.leftJoin(
					InventoryResource,
					eq(InventoryResource.id, ProviderExternalCalendarExport.resourceId)
				)
				.where(eq(ProviderExternalCalendarExport.providerId, providerId))
				.orderBy(desc(ProviderExternalCalendarExport.updatedAt)),
		])

	const resourceLabelById = new Map(resourceRows.map((row) => [row.id, row.label]))
	const detectedConflicts: DetectedCalendarConflict[] = []
	for (const event of eventRows) {
		for (const booking of bookingRows) {
			if (booking.variantId !== event.variantId || !overlaps(event, booking)) continue
			const overlapStart = [String(event.startDate), String(booking.startDate)].sort().at(-1)!
			const overlapEnd = [String(event.endDate), String(booking.endDate)].sort()[0]
			detectedConflicts.push({
				calendarId: event.calendarId,
				variantId: event.variantId,
				resourceId: event.resourceId ?? null,
				kind: "fastt_booking",
				dedupeKey: `booking:${event.id}:${booking.bookingId}:${overlapStart}:${overlapEnd}`,
				startDate: overlapStart,
				endDate: overlapEnd,
				title: "Coincide con una reserva de Fastt",
				description: event.resourceId
					? "El calendario externo bloquea una unidad física que también tiene una reserva en Fastt."
					: "El calendario externo bloquea fechas que coinciden con una reserva de Fastt en esta habitación.",
				actionLabel: "Revisar reserva",
				metadataJson: { bookingId: booking.bookingId },
			})
		}
		for (const other of eventRows) {
			if (
				other.calendarId === event.calendarId ||
				!samePhysicalConflictScope(event, other) ||
				!overlaps(event, other)
			) {
				continue
			}
			const overlapStart = [String(event.startDate), String(other.startDate)].sort().at(-1)!
			const overlapEnd = [String(event.endDate), String(other.endDate)].sort()[0]
			detectedConflicts.push({
				calendarId: event.calendarId,
				variantId: event.variantId,
				resourceId: event.resourceId ?? null,
				kind: "external_calendar",
				dedupeKey: `external:${[event.id, other.id].sort().join(":")}:${overlapStart}:${overlapEnd}`,
				startDate: overlapStart,
				endDate: overlapEnd,
				title: "Coincide con otro calendario externo",
				description: event.resourceId
					? "Dos calendarios externos bloquean la misma unidad física en las mismas fechas."
					: "Dos calendarios externos bloquean la misma habitación sin unidad física diferenciada.",
				actionLabel: "Revisar calendarios",
				metadataJson: { otherCalendarId: other.calendarId },
			})
		}
	}
	const uniqueDetected = [
		...new Map(
			detectedConflicts.map((conflict) => [
				`${conflict.calendarId}:${conflict.dedupeKey}`,
				conflict,
			])
		).values(),
	]
	await reconcileExternalCalendarConflicts(providerId, uniqueDetected)
	const conflictRows = await db
		.select()
		.from(ProviderExternalCalendarConflict)
		.where(
			and(
				eq(ProviderExternalCalendarConflict.providerId, providerId),
				ne(ProviderExternalCalendarConflict.status, "resolved")
			)
		)
	const conflictsByCalendar = new Map<string, ExternalCalendarConflict[]>()
	for (const row of conflictRows) {
		const conflicts = conflictsByCalendar.get(row.calendarId) ?? []
		conflicts.push({
			id: row.id,
			key: row.dedupeKey,
			calendarId: row.calendarId,
			kind:
				row.kind === "fastt_booking" || row.kind === "external_calendar"
					? row.kind
					: "external_calendar",
			status:
				row.status === "accepted" || row.status === "ignored" || row.status === "resolved"
					? row.status
					: "open",
			startDate: String(row.startDate),
			endDate: String(row.endDate),
			label: row.title,
			description: row.description,
			actionLabel: row.actionLabel ?? "Revisar",
			resourceLabel: row.resourceId ? (resourceLabelById.get(row.resourceId) ?? null) : null,
		})
		conflictsByCalendar.set(row.calendarId, conflicts)
	}
	const resourcesByVariant = new Map<string, Array<{ id: string; label: string }>>()
	for (const resource of resourceRows) {
		const resources = resourcesByVariant.get(resource.variantId) ?? []
		resources.push({ id: resource.id, label: resource.label })
		resourcesByVariant.set(resource.variantId, resources)
	}

	return {
		calendars: calendarRows.map((row) => ({
			id: row.id,
			name: row.name,
			variantId: row.variantId,
			resourceId: row.resourceId ?? null,
			resourceLabel: row.resourceLabel ?? null,
			variantName: row.variantName,
			productName: row.productName,
			sourceHost: row.feedUrlHost,
			status:
				row.status === "active" || row.status === "error" || row.status === "revoked"
					? row.status
					: "pending",
			lastSyncAt: row.lastSyncAt,
			lastSyncStatus: row.lastSyncStatus,
			lastError: row.lastError,
			lastEventCount: Number(row.lastEventCount ?? 0),
			syncEnabled: Boolean(row.syncEnabled),
			nextSyncAt: row.nextSyncAt,
			lastAutomaticSyncAt: row.lastAutomaticSyncAt,
			conflicts: conflictsByCalendar.get(row.id) ?? [],
		})),
		variants: variantRows.map((row) => ({
			id: row.id,
			label: `${row.productName} · ${row.variantName}`,
			resources: resourcesByVariant.get(row.id) ?? [],
		})),
		exports: exportRows.map((row) => ({
			id: row.id,
			label: row.label,
			variantId: row.variantId,
			resourceId: row.resourceId ?? null,
			variantName: row.variantName,
			productName: row.productName,
			resourceLabel: row.resourceLabel ?? null,
			status: row.status === "revoked" ? "revoked" : "active",
			lastDownloadedAt: row.lastDownloadedAt,
			downloadCount: Number(row.downloadCount ?? 0),
			url: null,
		})),
	}
}
