const accessTokenOverrides = new WeakMap<Request, string>()

export function setRequestAuthAccessToken(request: Request, accessToken: string): void {
	accessTokenOverrides.set(request, accessToken)
}

export function getRequestAuthAccessTokenOverride(request: Request): string | null {
	return accessTokenOverrides.get(request) ?? null
}
