import { SearchOffersRepository } from "@/modules/search/infrastructure/repositories/SearchOffersRepository"

export function createSearchOffersRepositoryForTests() {
	return new SearchOffersRepository()
}
