export interface UserRepositoryPort {
	findByEmail(email: string): Promise<{ id: string; email: string } | null>
	create(params: { id: string; email: string; username?: string | null }): Promise<void>
}
