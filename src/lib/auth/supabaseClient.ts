type SupabaseConfig = {
	url: string
	anonKey: string
	serviceRoleKey?: string
}

export function getSupabaseConfig(): SupabaseConfig | null {
	const rawUrl = process.env.SUPABASE_URL
	const rawAnonKey = process.env.SUPABASE_ANON_KEY
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

	if (!rawUrl || !rawAnonKey) return null

	let url = String(rawUrl).trim()
	let anonKey = String(rawAnonKey).trim()

	const looksLikeHttpUrl = (v: string) => /^https?:\/\//i.test(v)
	const looksLikeAnonKey = (v: string) => /^(sb_|sb_publishable_|eyJ)/.test(v)

	// Guard against common “swapped env” issues that manifest as:
	// Failed to parse URL from sb_publishable_xxx/auth/v1/...
	if (!looksLikeHttpUrl(url) && looksLikeHttpUrl(anonKey) && looksLikeAnonKey(url)) {
		// Swap to keep the system operational, but make it explicit in logs.
		console.warn(
			"[auth] Detected swapped SUPABASE_URL/SUPABASE_ANON_KEY at runtime. Auto-correcting."
		)
		const oldUrl = url
		url = anonKey
		anonKey = oldUrl
	}

	// Defensive validation (fail fast with explicit errors).
	if (!looksLikeHttpUrl(url)) {
		console.error("[auth] Invalid SUPABASE_URL at runtime:", { SUPABASE_URL: url })
		throw new Error("Invalid SUPABASE_URL: must start with http(s)")
	}
	if (looksLikeHttpUrl(anonKey)) {
		console.error("[auth] Invalid SUPABASE_ANON_KEY at runtime (looks like a URL).", {
			SUPABASE_ANON_KEY: anonKey,
		})
		throw new Error("Invalid SUPABASE_ANON_KEY: must not be a URL")
	}
	if (!anonKey) {
		throw new Error("Invalid SUPABASE_ANON_KEY: empty")
	}

	return { url: url.replace(/\/+$/, ""), anonKey, serviceRoleKey: serviceRoleKey || undefined }
}

export type SupabaseUser = { id: string; email: string | null }

export type SupabaseSession = {
	access_token: string
	refresh_token: string
	expires_in: number
	token_type: string
	user?: { id?: unknown; email?: unknown } | null
}

/**
 * Minimal, dependency-free token verification against Supabase Auth.
 * Uses the service role key if present, otherwise falls back to anon key.
 *
 * This function may perform a network call when Supabase is configured.
 */
export async function fetchSupabaseUser(accessToken: string): Promise<SupabaseUser | null> {
	const cfg = getSupabaseConfig()
	if (!cfg) return null
	if (!accessToken) return null

	const resp = await fetch(`${cfg.url}/auth/v1/user`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			// Use anon key for standard auth flows. Service role must be reserved for admin operations only.
			apikey: cfg.anonKey,
		},
	})

	if (!resp.ok) return null
	const json = (await resp.json()) as { id?: unknown; email?: unknown }

	if (!json?.id || typeof json.id !== "string") return null
	const email = typeof json.email === "string" ? json.email : null
	return { id: json.id, email }
}

function getAuthApiKey(cfg: SupabaseConfig): string {
	// Only use service role when explicitly needed. Auth endpoints used here are safe with anon key.
	return cfg.anonKey
}

/**
 * Server-side auth: sign in with email/password.
 * Returns the raw session payload from Supabase (GoTrue).
 */
export async function signInWithPassword(params: {
	email: string
	password: string
}): Promise<{ ok: true; session: SupabaseSession } | { ok: false; error: string; status: number }> {
	const cfg = getSupabaseConfig()
	if (!cfg) return { ok: false, error: "Supabase not configured", status: 500 }

	const resp = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"apikey": getAuthApiKey(cfg),
		},
		body: JSON.stringify({ email: params.email, password: params.password }),
	})

	if (!resp.ok) {
		const txt = await resp.text().catch(() => "")
		return { ok: false, error: txt || "Invalid credentials", status: resp.status }
	}

	const session = (await resp.json()) as SupabaseSession
	if (!session?.access_token || !session.refresh_token) {
		return { ok: false, error: "Invalid session payload", status: 500 }
	}
	return { ok: true, session }
}

/**
 * Server-side auth: sign up with email/password.
 * Depending on Supabase settings, it may or may not return a session.
 */
export async function signUp(params: {
	email: string
	password: string
	redirectTo?: string
}): Promise<
	{ ok: true; session: SupabaseSession | null } | { ok: false; error: string; status: number }
> {
	const cfg = getSupabaseConfig()
	if (!cfg) return { ok: false, error: "Supabase not configured", status: 500 }

	const signupUrl =
		params.redirectTo && params.redirectTo.length > 0
			? `${cfg.url}/auth/v1/signup?redirect_to=${encodeURIComponent(params.redirectTo)}`
			: `${cfg.url}/auth/v1/signup`

	const resp = await fetch(signupUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"apikey": getAuthApiKey(cfg),
		},
		body: JSON.stringify({ email: params.email, password: params.password }),
	})

	if (!resp.ok) {
		const txt = await resp.text().catch(() => "")
		return { ok: false, error: txt || "Signup failed", status: resp.status }
	}

	const json = (await resp.json()) as { session?: SupabaseSession | null } | SupabaseSession
	const session =
		(json as any)?.access_token && (json as any)?.refresh_token
			? (json as any as SupabaseSession)
			: null

	return { ok: true, session }
}
