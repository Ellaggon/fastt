import { SERVICE_CATALOG } from "./service-catalog"
import type { ServiceCategory, ServiceDefinition } from "./service-types"

export const servicesByCategory = SERVICE_CATALOG.reduce<
	Partial<Record<ServiceCategory, ServiceDefinition[]>>
>((acc, service) => {
	if (!acc[service.category]) {
		acc[service.category] = []
	}
	acc[service.category]!.push(service)
	return acc
}, {})
