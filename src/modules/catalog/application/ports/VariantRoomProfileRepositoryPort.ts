export interface VariantRoomProfileRepositoryPort {
	getByIds(ids: string[]): Promise<any[]>
}
