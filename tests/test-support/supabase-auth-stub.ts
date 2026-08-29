export type SupabaseTestUser = { id: string; email: string }

let authStubQueue: Promise<void> = Promise.resolve()

function authorizationToken(init?: RequestInit): string {
	const headers = new Headers(init?.headers)
	const authorization = headers.get("Authorization") ?? headers.get("authorization")
	return typeof authorization === "string"
		? authorization.replace(/^Bearer\s+/i, "").trim()
		: ""
}

/** Auth routes depend on process-wide fetch and environment state. */
export async function withSupabaseAuthStub<T>(
	usersByToken: Record<string, SupabaseTestUser>,
	work: () => Promise<T>
): Promise<T> {
	let release!: () => void
	const turn = new Promise<void>((resolve) => {
		release = resolve
	})
	const previousTurn = authStubQueue
	authStubQueue = previousTurn.then(() => turn)
	await previousTurn

	const previousUrl = process.env.SUPABASE_URL
	const previousAnonKey = process.env.SUPABASE_ANON_KEY
	const previousFetch = globalThis.fetch
	const supabaseUrl = "https://supabase.test"
	process.env.SUPABASE_URL = supabaseUrl
	process.env.SUPABASE_ANON_KEY = "sb_publishable_test"
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
		if (url !== `${supabaseUrl}/auth/v1/user`) return previousFetch(input, init)
		const user = usersByToken[authorizationToken(init)]
		if (!user) return new Response("Unauthorized", { status: 401 })
		return Response.json({ id: user.id, email: user.email })
	}) as typeof globalThis.fetch

	try {
		return await work()
	} finally {
		globalThis.fetch = previousFetch
		if (previousUrl === undefined) delete process.env.SUPABASE_URL
		else process.env.SUPABASE_URL = previousUrl
		if (previousAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY
		else process.env.SUPABASE_ANON_KEY = previousAnonKey
		release()
	}
}
