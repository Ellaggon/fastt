import type { HotelRoomQueryRepositoryPort } from "../ports/HotelRoomQueryRepositoryPort"

export async function getHotelRoom(
	deps: { repo: HotelRoomQueryRepositoryPort },
	params: { hotelId: string; hotelRoomId: string }
): Promise<Response> {
	const { hotelId, hotelRoomId } = params

	if (!hotelId || !hotelRoomId)
		return new Response(JSON.stringify({ found: false, error: "Missing hotelId or hotelRoomId" }), {
			status: 400,
		})

	const bundle = await deps.repo.getHotelRoomBundle({ hotelId, hotelRoomId })
	if (!bundle) return new Response(JSON.stringify({ found: false }), { status: 200 })

	return new Response(
		JSON.stringify({
			found: true,
			row: bundle.row,
			variant: bundle.variant,
			amenities: bundle.amenities,
			images: bundle.images,
		}),
		{ status: 200 }
	)
}
