-- Stable IDs used by room profiles. Historical rows remain untouched because
-- existing profiles may still reference them.
INSERT INTO "RoomType" ("id", "name", "maxOccupancy", "description")
VALUES
	('single', 'Habitación Simple', 1, 'Una cama individual; ideal para una persona.'),
	('double', 'Habitación Doble', 2, 'Una cama doble o dos camas individuales; para dos personas.'),
	('twin', 'Habitación Twin', 2, 'Dos camas individuales separadas; perfecta para amigos o compañeros de viaje.'),
	('triple', 'Habitación Triple', 3, 'Tres camas individuales o una doble más una individual; para tres huéspedes.'),
	('quad', 'Habitación Cuádruple', 4, 'Cuatro camas individuales o dos camas dobles; ideal para familias o grupos.'),
	('queen', 'Habitación Queen', 2, 'Una cama tamaño Queen; para dos personas con mayor comodidad.'),
	('king', 'Habitación King', 2, 'Una cama tamaño King; para dos personas, espaciosa y lujosa.'),
	('suite', 'Suite', 2, 'Habitación amplia con zona de estar o sala; generalmente incluye servicios premium.'),
	('junior_suite', 'Junior Suite', 2, 'Espacio semi-dividido con cama y área de estar; más grande que una habitación estándar.'),
	('family_suite', 'Suite Familiar', 4, 'Diseñada para familias, con varias camas o dormitorios conectados.'),
	('studio', 'Estudio', 2, 'Habitación con área de cocina o kitchenette integrada.'),
	('apartment', 'Departamento / Apartamento', 4, 'Unidad independiente con cocina, sala y dormitorio; ideal para estancias largas.'),
	('villa', 'Villa', 4, 'Alojamiento independiente con varias habitaciones y áreas privadas, a menudo con piscina.'),
	('bungalow', 'Bungalow', 3, 'Unidad privada de un solo piso, usualmente rodeada de jardines o playa.'),
	('penthouse', 'Penthouse', 2, 'Suite ubicada en el último piso con terraza o vistas panorámicas.'),
	('duplex', 'Dúplex', 4, 'Habitación o suite de dos niveles conectados por una escalera interna.'),
	('connecting', 'Habitaciones Conectadas', 4, 'Dos habitaciones con puerta interna, ideales para familias o grupos.'),
	('accessible', 'Habitación Accesible', 2, 'Diseñada para movilidad reducida, con baño y accesos adaptados.'),
	('deluxe', 'Habitación Deluxe', 2, 'Habitación con acabados y servicios mejorados.'),
	('executive', 'Habitación Ejecutiva', 2, 'Habitación orientada a viajes de negocio, con espacio de trabajo.'),
	('presidential_suite', 'Suite Presidencial', 4, 'La suite más amplia y exclusiva, con varias áreas privadas.'),
	('loft', 'Loft', 3, 'Espacio abierto con dormitorio y zona de estar integrados.'),
	('cabana', 'Cabaña', 4, 'Alojamiento independiente de estilo rústico o natural.'),
	('tent', 'Tienda de campaña', 2, 'Unidad de glamping o campamento con equipamiento definido.'),
	('dormitory', 'Dormitorio compartido', 8, 'Camas individuales dentro de un espacio compartido.')
ON CONFLICT ("id") DO UPDATE
SET
	"name" = EXCLUDED."name",
	"maxOccupancy" = EXCLUDED."maxOccupancy",
	"description" = EXCLUDED."description";
