import { db, City, eq } from "astro:db"
import { isDepartmentId } from "@/data/departments"

function dept(id: string) {
	if (!isDepartmentId(id)) {
		throw new Error(`Departamento invalido: "${id}`)
	}
	return id
}
export default async function seed() {
	const cities = [
		{
			id: "uuid-city-cobija",
			name: "Cobija",
			department: dept("pando"),
			latitude: -11.0267,
			longitude: -68.7692,
			description:
				"Cobija, la capital de Pando, es una ciudad amazónica en la frontera con Brasil, rodeada de ríos y selva. Su ambiente fronterizo y su historia ligada a la explotación del caucho la convierten en un lugar exótico. Explora sus mercados, navega por el río Acre y sumérgete en la vida de una de las ciudades más remotas de Bolivia.",
		},
		{
			id: "uuid-city-trinidad",
			name: "Trinidad",
			department: dept("beni"),
			latitude: -14.8333,
			longitude: -64.9,
			description:
				"Trinidad, la capital del Beni, es la puerta de entrada a la Amazonía boliviana. Un destino donde la vida gira en torno a los ríos y la ganadería. Con sus fiestas folclóricas y su vibrante cultura, es el lugar ideal para explorar las vastas llanuras y los humedales del Beni, hogar de una fauna espectacular.",
		},
		{
			id: "uuid-city-cochabamba",
			name: "Cochabamba",
			department: dept("cochabamba"),
			latitude: -17.3939,
			longitude: -66.1568,
			description:
				"Cochabamba, la capital gastronómica de Bolivia, es una ciudad moderna y vibrante, enclavada en un valle fértil. Conocida por su deliciosa comida, su agradable clima y su gente hospitalaria. Disfruta de sus parques, su vida nocturna y las impresionantes vistas desde el Cristo de la Concordia, la estatua de Cristo más grande del mundo.",
		},
		{
			id: "uuid-city-oruro",
			name: "Oruro",
			department: dept("oruro"),
			latitude: -17.9622,
			longitude: -67.1121,
			description:
				"Oruro, una ciudad minera en el altiplano, es un crisol de cultura y tradición. Su mayor atractivo es el Carnaval, una explosión de música, danza y devoción. Explora su historia minera, visita los lagos cercanos y adéntrate en un destino que te hará sentir la mística del altiplano.",
		},
		{
			id: "uuid-city-potosi",
			name: "Potosí",
			department: dept("potosi"),
			latitude: -19.5833,
			longitude: -65.75,
			description:
				"Potosí, la ciudad más alta del mundo, es una joya colonial y un testimonio de la historia. Su centro histórico, con sus calles empedradas y sus iglesias barrocas, te transporta al pasado. Es la base ideal para explorar el Salar de Uyuni y vivir la experiencia de la historia minera de Bolivia.",
		},
		{
			id: "uuid-city-sucre",
			name: "Sucre",
			department: dept("chuquisaca"),
			latitude: -19.0333,
			longitude: -65.2627,
			description:
				"Sucre, la capital constitucional de Bolivia, es una 'Ciudad Blanca' de arquitectura colonial, declarada Patrimonio de la Humanidad. Su ambiente tranquilo, sus patios floridos y sus impresionantes edificios históricos la convierten en una de las ciudades más hermosas de Sudamérica. Es un destino perfecto para la historia, la cultura y la relajación.",
		},
		{
			id: "uuid-city-tarija",
			name: "Tarija",
			department: dept("tarija"),
			latitude: -21.535,
			longitude: -64.7291,
			description:
				"Tarija, la 'ciudad del vino', te enamorará con su clima agradable y su ambiente andaluz. Explora sus viñedos, degusta sus vinos de altura y disfruta de la hospitalidad de su gente. Un destino para los amantes de la buena mesa, el vino y la música, rodeado de un paisaje de valles fértiles y hermosas montañas.",
		},
		{
			id: "uuid-city-lapaz",
			name: "Nuestra Señora de La Paz",
			department: dept("lapaz"),
			latitude: -16.5,
			longitude: -68.15,
			description:
				"La Paz, la sede de gobierno de Bolivia, es una metrópoli andina que desafía la gravedad. Situada en un cañón, sus casas se aferran a las laderas y sus teleféricos ofrecen vistas de otro mundo. Explora el Mercado de las Brujas, maravíllate con la arquitectura colonial de la Plaza Murillo y siente la energía única de una ciudad suspendida entre las nubes.",
		},
		{
			id: "uuid-city-santacruz",
			name: "Santa Cruz de la Cierra",
			department: dept("santacruz"),
			latitude: -17.7833,
			longitude: -63.1822,
			description:
				"Santa Cruz de la Sierra es la capital del oriente boliviano y un oasis de modernidad y tradición. Con su clima cálido y su atmósfera relajada, es el punto de partida ideal para explorar la selva, los safaris fotográficos y las impresionantes ruinas de las misiones jesuíticas. Disfruta de la hospitalidad cruceña y de su deliciosa cocina, donde el sabor de la tierra es protagonista.",
		},
	]

	for (const city of cities) {
		const exists = await db.select().from(City).where(eq(City.id, city.id))
		if (exists.length === 0) {
			await db.insert(City).values(cities)
		}
	}
}
