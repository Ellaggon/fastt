import { lookup as systemLookup } from "node:dns/promises"
import { request as httpsRequest } from "node:https"
import { BlockList, isIP } from "node:net"

type LookupAddress = { address: string; family: 4 | 6 }
export type ExternalCalendarDnsLookup = (
	hostname: string
) => Promise<Array<{ address: string; family: number }>>

const blockedIpv4Addresses = new BlockList()
const blockedIpv6Addresses = new BlockList()

for (const [network, prefix] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
] as const) {
	blockedIpv4Addresses.addSubnet(network, prefix, "ipv4")
}

for (const [network, prefix] of [
	["::", 128],
	["::1", 128],
	["::ffff:0:0", 96],
	["64:ff9b::", 96],
	["100::", 64],
	["2001:db8::", 32],
	["fc00::", 7],
	["fe80::", 10],
	["ff00::", 8],
] as const) {
	blockedIpv6Addresses.addSubnet(network, prefix, "ipv6")
}

function normalizedHostname(hostname: string): string {
	return hostname
		.toLowerCase()
		.replace(/\.$/, "")
		.replace(/^\[|\]$/g, "")
}

export function isPublicExternalCalendarAddress(address: string, family = isIP(address)): boolean {
	if (family !== 4 && family !== 6) return false
	return family === 4
		? !blockedIpv4Addresses.check(address, "ipv4")
		: !blockedIpv6Addresses.check(address, "ipv6")
}

export async function resolveExternalCalendarAddress(
	hostname: string,
	lookupImpl: ExternalCalendarDnsLookup = async (value) =>
		systemLookup(value, { all: true, verbatim: true })
): Promise<LookupAddress> {
	const normalized = normalizedHostname(hostname)
	const literalFamily = isIP(normalized)
	const records = literalFamily
		? [{ address: normalized, family: literalFamily }]
		: await lookupImpl(normalized).catch(() => {
				throw new Error("ICAL_DNS_LOOKUP_FAILED")
			})
	if (!records.length) throw new Error("ICAL_DNS_LOOKUP_FAILED")
	const normalizedRecords = records.filter(
		(record): record is LookupAddress => record.family === 4 || record.family === 6
	)
	if (
		!normalizedRecords.length ||
		normalizedRecords.some(
			(record) => !isPublicExternalCalendarAddress(record.address, record.family)
		)
	) {
		throw new Error("ICAL_DNS_PRIVATE_ADDRESS")
	}
	return normalizedRecords[0]
}

export async function fetchExternalCalendarPinned(params: {
	url: URL
	headers: Headers
	timeoutMs: number
	maxBytes: number
	dnsLookup?: ExternalCalendarDnsLookup
}): Promise<Response> {
	const address = await resolveExternalCalendarAddress(params.url.hostname, params.dnsLookup)
	const hostname = normalizedHostname(params.url.hostname)
	return new Promise<Response>((resolve, reject) => {
		let settled = false
		const fail = (code: string) => {
			if (settled) return
			settled = true
			reject(new Error(code))
		}
		const request = httpsRequest(
			{
				protocol: "https:",
				hostname,
				port: params.url.port ? Number(params.url.port) : 443,
				path: `${params.url.pathname}${params.url.search}`,
				method: "GET",
				headers: Object.fromEntries(params.headers.entries()),
				servername: isIP(hostname) ? undefined : hostname,
				lookup: (_hostname, _options, callback) => {
					callback(null, address.address, address.family)
				},
			},
			(response) => {
				const responseHeaders = new Headers()
				for (const [name, value] of Object.entries(response.headers)) {
					if (Array.isArray(value)) {
						for (const item of value) responseHeaders.append(name, item)
					} else if (value !== undefined) {
						responseHeaders.set(name, String(value))
					}
				}
				const declaredLength = Number(response.headers["content-length"] ?? 0)
				if (declaredLength > params.maxBytes) {
					response.destroy()
					fail("ICAL_FEED_TOO_LARGE")
					return
				}
				const chunks: Buffer[] = []
				let size = 0
				response.on("data", (chunk: Buffer) => {
					size += chunk.length
					if (size > params.maxBytes) {
						response.destroy()
						fail("ICAL_FEED_TOO_LARGE")
						return
					}
					chunks.push(chunk)
				})
				response.on("end", () => {
					if (settled) return
					settled = true
					const status = response.statusCode ?? 500
					resolve(
						new Response(status === 304 ? null : Buffer.concat(chunks), {
							status,
							headers: responseHeaders,
						})
					)
				})
				response.on("error", () => fail("ICAL_FETCH_FAILED"))
			}
		)
		request.setTimeout(params.timeoutMs, () => {
			request.destroy()
			fail("ICAL_FETCH_TIMEOUT")
		})
		request.on("error", () => fail("ICAL_FETCH_FAILED"))
		request.end()
	})
}
