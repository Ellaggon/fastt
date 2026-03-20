export interface ImageQueryRepositoryPort {
	getByEntityIds(entityType: string, entityIds: string[]): Promise<unknown[]>
}
