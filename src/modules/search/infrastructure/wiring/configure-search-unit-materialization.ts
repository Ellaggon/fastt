import { searchReadModelRepository } from "@/container/search-read-model.container"
import { configureSearchUnitMaterializationRepository } from "@/modules/search/application/use-cases/materialize-search-unit"

configureSearchUnitMaterializationRepository(searchReadModelRepository)
