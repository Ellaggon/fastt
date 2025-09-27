export const DEPARTMENTS = [
	{
		id: "beni",
		name: "Beni",
		description:
			"Conocido como el 'granero de Bolivia', el Beni es un paraíso de llanos inmensos, ríos caudalosos y una fauna silvestre que te dejará sin aliento. Un lugar para vivir el ecoturismo, la pesca deportiva y explorar las culturas originarias de la región en un paisaje que parece no tener fin.",
	},
	{
		id: "chuquisaca",
		name: "Chuquisaca",
		description:
			"Chuquisaca es el corazón histórico de Bolivia, cuna de la independencia. Su capital, Sucre, conocida como la 'Ciudad Blanca', deslumbra con su arquitectura colonial, sus iglesias majestuosas y un ambiente tranquilo y elegante. Es un lugar para aprender sobre la historia del país y disfrutar de una cultura vibrante y sofisticada.",
	},
	{
		id: "cochabamba",
		name: "Cochabamba",
		description:
			"Cochabamba es el corazón de Bolivia, famoso por su clima primaveral eterno y su vibrante escena gastronómica. Conocida como la 'capital de la comida', es el lugar perfecto para degustar la riqueza culinaria del país y explorar valles fértiles, ruinas incas y la imponente estatua del Cristo de la Concordia.",
	},
	{
		id: "lapaz",
		name: "La Paz",
		description:
			"El departamento de La Paz es el corazón cultural y político de Bolivia. Aquí, la modernidad y la historia se entrelazan bajo la atenta mirada de imponentes nevados. Desde la vibrante capital hasta los misterios precolombinos de Tiwanaku y la aventura extrema de la Carretera de la Muerte, La Paz te invita a explorar una geografía de contrastes y tradiciones ancestrales.",
	},
	{
		id: "oruro",
		name: "Oruro",
		description:
			"Oruro, la capital folclórica de Bolivia, te invita a vivir una experiencia cultural inolvidable, especialmente durante su famoso carnaval, declarado Patrimonio de la Humanidad. Es una tierra de altiplano con paisajes desérticos y salares que te transportan a otro mundo, ricos en historia minera y tradiciones milenarias.",
	},
	{
		id: "pando",
		name: "Pando",
		description:
			"Pando es el pulmón de Bolivia, una vasta extensión de selva amazónica virgen donde la biodiversidad es la verdadera protagonista. Un destino para aventureros y amantes de la naturaleza, ofrece un encuentro auténtico con la flora y fauna más exuberante del país, y una inmersión en la cultura de la goma y la castaña.",
	},
	{
		id: "potosi",
		name: "Potosi",
		description:
			"Potosí, la 'Villa Imperial', es una ciudad que te hace viajar en el tiempo. Su centro histórico, Patrimonio de la Humanidad, es un testimonio de la riqueza minera que moldeó el mundo. Aquí, el cerro rico, el salar de Uyuni y las lagunas de colores ofrecen un espectáculo natural y paisajístico inigualable, un destino de obligada visita.",
	},
	{
		id: "santacruz",
		name: "Santa Cruz",
		description:
			"El departamento de Santa Cruz, un motor económico y cultural, te sumerge en una Bolivia tropical y llena de vida. Con la majestuosidad de sus llanos, la riqueza de sus parques nacionales y la calidez de su gente, es el destino perfecto para quienes buscan aventura, naturaleza exuberante y una gastronomía que deleita los sentidos. Descubre la exuberancia de la Amazonía y los tesoros escondidos de las misiones jesuíticas.",
	},
	{
		id: "tarija",
		name: "Tarija",
		description:
			"Tarija es la 'Andalucía boliviana', un oasis de viñedos, clima soleado y gente alegre. Es el epicentro de la producción de vino y singani en Bolivia, ofreciendo una ruta del vino encantadora. La región invita a disfrutar de su gastronomía, su música y sus tradiciones, en un entorno de valles y colinas pintorescas.",
	},
] as const

// Agarramos el id de cualquiera de los deptos
export type DepartmentId = (typeof DEPARTMENTS)[number]["id"]
export type Department = (typeof DEPARTMENTS)[number]

// Generamos un array de pares clave valor
export const DEPARTMENT_MAP: Record<DepartmentId, Department> = Object.fromEntries(
	DEPARTMENTS.map((d) => [d.id, d])
) as any

// Validar si un string es un DepartmentId
export const isDepartmentId = (v: string): v is DepartmentId => v in DEPARTMENT_MAP

// Buscamos un depto por id
export const getDepartment = (id: string) => (isDepartmentId(id) ? DEPARTMENT_MAP[id] : null)

// Obtener el nombre del depto
export const getDepartmentLabel = (id: string) => getDepartment(id)?.name ?? id

// Obtener la descripcion del depto
export const getDepartmentDescription = (id: string) => getDepartment(id)?.description ?? ""
