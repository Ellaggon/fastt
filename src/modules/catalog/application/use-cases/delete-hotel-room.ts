import type { HotelRoomQueryRepositoryPort } from "../ports/HotelRoomQueryRepositoryPort"

export async function deleteHotelRoom(params: {
	hotelId: string
	hotelRoomId: string
	deleteCascade: (hotelRoomId: string) => Promise<void>
	repo: HotelRoomQueryRepositoryPort
}): Promise<Response> {
	const { hotelId, hotelRoomId, deleteCascade, repo } = params

	if (!hotelId || !hotelRoomId) {
		return new Response(JSON.stringify({ error: "Faltan parámetros obligatorios" }), {
			status: 400,
		})
	}

	// 1️⃣ Verificar que exista
	const room = await repo.getHotelRoomById(hotelRoomId)

	if (!room) {
		return new Response(JSON.stringify({ error: "La habitación no existe" }), { status: 404 })
	}

	// 2️⃣ Verificar pertenencia
	if ((room as any).hotelId !== hotelId) {
		return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403 })
	}

	// 3️⃣ Cascade delete real
	await deleteCascade(hotelRoomId)

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
