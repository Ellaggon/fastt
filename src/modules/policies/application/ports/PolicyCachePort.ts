export interface PolicyCachePort<TValue> {
	get(params: unknown): TValue | undefined
	set(params: unknown, value: TValue): void
	clearAll(): void
}
