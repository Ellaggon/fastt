import { z } from "zod"

export const formSchema = z.object({
	title: z
		.string()
		.min(10, { message: "El título debe tener al menos 10 caracteres." })
		.max(50, { message: "El título no debe superar los 100 caracteres." }),

	description: z
		.string()
		.min(10, { message: "La descripcion debe tener al menos 10 caracteres" })
		.max(200, { message: "La descripcion no debe superar los 200 caracteres" }),

	vehicle_type_id: z.string().nonempty({ message: "Debe seleccionar un tipo de veiculo" }),

	price: z
		.number({ invalid_type_error: "El precio debe ser un número." })
		.positive({ message: "El valor debe de ser mayor a 0" })
		.int(),

	city_id: z.string().nonempty({ message: "Debe seleccionar una ciudad." }),

	departure_date: z.string().nonempty({ message: "Debe proporcionar una fecha de salida." }),

	departure_time: z.string().nonempty({ message: "Debe proporcionar una hora de salida." }),

	imageUpload: z
		.array(
			z.object({
				name: z.string(),
				size: z
					.number()
					.max(10 * 1024, {
						message: "El tamaño de cada imagen no debe ser superior a los 10 KB.",
					}),
				type: z.string().startsWith("image/", { message: "Debe subir al menos una imagen." }),
			})
		)
		.optional()
		.refine((files) => (files?.length || 0) > 0, { message: "Debe subir al menos una imagen." }),
})

// Extraer los tipos del esquema
export type FormFields = z.infer<typeof formSchema>
export type FieldName = keyof FormFields // "title" | "description"
