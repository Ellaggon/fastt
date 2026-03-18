export interface BookingProps {
	id: string
	entityType: string
	entityId: string
	checkIn: string
	checkOut: string
	guests: number
	totalPrice: number
	status: "confirmed" | "cancelled"
}

export class Booking {
	constructor(private props: BookingProps) {}

	get data() {
		return this.props
	}

	cancel() {
		this.props.status = "cancelled"
	}
}
