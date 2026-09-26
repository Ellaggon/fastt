import { setDefaultResultOrder } from "node:dns"

let applied = false

/**
 * Prefer A records when the runtime is dual-stack. Node otherwise often tries
 * AAAA first; a broken IPv6 path surfaces as getaddrinfo ENOTFOUND against the
 * Supabase pooler even though IPv4 still resolves.
 */
export function preferIpv4Dns(): void {
	if (applied) return
	setDefaultResultOrder("ipv4first")
	applied = true
}
