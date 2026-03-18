import { db, eq, and, desc, Policy } from "astro:db"

export async function findActivePolicy(groupId: string) {
	return db
		.select()
		.from(Policy)
		.where(and(eq(Policy.groupId, groupId), eq(Policy.status, "active")))
		.orderBy(desc(Policy.version))
		.limit(1)
		.get()
}
