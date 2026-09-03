import {
	and,
	db,
	eq,
	InternalRole,
	InternalUserRole,
	isNull,
	User,
} from "@/shared/infrastructure/db/compat"

function arg(name: string): string | null {
	const inline = process.argv.find((value) => value.startsWith(`${name}=`))
	if (inline) return inline.slice(name.length + 1).trim() || null
	const index = process.argv.indexOf(name)
	return index >= 0 ? String(process.argv[index + 1] ?? "").trim() || null : null
}

function required(name: string): string {
	const value = arg(name)
	if (value) return value
	throw new Error(`Missing ${name}`)
}

async function main() {
	const email = required("--email").toLowerCase()
	const roleKey = required("--role")
	const scopeType = (arg("--scope-type") ?? "global") as "global" | "provider" | "country"
	const scopeId = arg("--scope-id")
	if (scopeType === "global" ? Boolean(scopeId) : !scopeId) {
		throw new Error("scope_id_shape_invalid")
	}

	const user = await db
		.select({ id: User.id })
		.from(User)
		.where(eq(User.email, email))
		.then((rows) => rows[0])
	if (!user) throw new Error("user_not_found")

	const role = await db
		.select({ id: InternalRole.id, key: InternalRole.key })
		.from(InternalRole)
		.where(eq(InternalRole.key, roleKey))
		.then((rows) => rows[0])
	if (!role) throw new Error("internal_role_not_found")
	const scopeCondition = scopeId
		? eq(InternalUserRole.scopeId, scopeId)
		: isNull(InternalUserRole.scopeId)

	const existing = await db
		.select({ id: InternalUserRole.id })
		.from(InternalUserRole)
		.where(
			and(
				eq(InternalUserRole.userId, user.id),
				eq(InternalUserRole.roleId, role.id),
				eq(InternalUserRole.scopeType, scopeType),
				eq(InternalUserRole.status, "active"),
				scopeCondition
			)
		)
		.then((rows) => rows.find((row) => Boolean(row.id)))
	if (existing) {
		console.log(JSON.stringify({ ok: true, idempotent: true, assignmentId: existing.id }))
		return
	}

	const id = crypto.randomUUID()
	await db.insert(InternalUserRole).values({
		id,
		userId: user.id,
		roleId: role.id,
		scopeType,
		scopeId: scopeId ?? undefined,
		status: "active",
		createdAt: new Date(),
		updatedAt: new Date(),
	})
	console.log(JSON.stringify({ ok: true, assignmentId: id, userId: user.id, role: role.key }))
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
