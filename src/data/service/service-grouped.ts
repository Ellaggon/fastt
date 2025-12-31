import { SERVICE_CATALOG } from "./service-catalog"
import type { ServiceCategory } from "./service-types"

export const servicesByCategory = SERVICE_CATALOG.reduce<
	Record<ServiceCategory, typeof SERVICE_CATALOG>
>((acc, service) => {
	if (!acc[service.category]) {
		acc[service.category] = []
	}
	acc[service.category].push(service)
	return acc
}, {} as any)
