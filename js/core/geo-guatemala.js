/* ═══════════════════════════════════════════════════════════════════════════
   Departamentos, municipios y códigos postales de Guatemala.

   POR QUÉ EXISTE: el DPI trae el lugar de nacimiento y la vecindad como dos
   líneas —departamento y municipio— y la declaración jurada los necesita
   separados y bien escritos. Guardarlos en un solo campo de texto obliga a
   partirlos después, y "Jutiapa, Santa Catarina Mita" tecleado a mano sale de
   veinte formas distintas.

   EL CÓDIGO POSTAL SALE SOLO de esa pareja: son 5 dígitos donde los dos
   primeros identifican el departamento (01 a 22) y los tres siguientes el
   municipio o lugar poblado, en orden correlativo dentro del departamento.
   Por eso acá se guarda el prefijo y la lista ordenada, y el código se
   calcula: repetir 548 códigos a mano sería 548 oportunidades de un dedazo.

   Verificado contra el DPI de Henry: nació en Santa Catarina Mita, Jutiapa
   (22003) y su vecindad es Fraijanes, Guatemala (01062).

   OJO — LOS NOMBRES VAN SIN TILDE a propósito, tal como los publica el
   catálogo postal. Al comparar con lo que lea la IA del DPI se normaliza
   (ver normalizarGeo): el DPI escribe "SANTA CATARINA MITA" en mayúsculas y
   sin tildes, y "Sololá" con tilde no debe fallar contra "Solola".

   Fuente: catálogo de códigos postales de Guatemala (codigopostal.lat),
   contrastado con el listado por departamentos de guatemala.com. Consultado
   el 2026-08-06. Si Correos publica un código nuevo, se agrega al final de la
   lista del departamento que corresponda — el orden ES el código.
   ═══════════════════════════════════════════════════════════════════════════ */

const GEO_GT = {
  Guatemala: { cod: '01', desde: 51, municipios: [
    'Santa Catarina Pinula', 'San Jose Pinula', 'San Jose del Golfo', 'Palencia',
    'Chinautla', 'San Pedro Ayampuc', 'Mixco', 'San Pedro Sacatepequez',
    'San Juan Sacatepequez', 'San Raymundo', 'Chuarrancho', 'Fraijanes',
    'Amatitlan', 'Villa Nueva', 'Villa Canales', 'Petapa',
    'Canalitos Zona 21', 'El Fiscal Palencia', 'Boca del Monte Villa Canales',
    'Vuelta Grande San Raymundo', 'Trapiche Grande Chuarrancho',
    'Santa Elena Barillas Villa Canales', 'Puerta Parada Santa Catarina Pinula',
  ] },
  'El Progreso': { cod: '02', desde: 1, municipios: [
    'Guastatoya', 'Morazan', 'San Agustin Acasaguastlan', 'San Cristobal Acasaguastlan',
    'El Jicaro', 'Sansare', 'Sanarate', 'San Antonio La Paz',
    'Tulumajillo San Agustin Acasaguastlan', 'Estacion Jalapa Sansare',
    'Tulumaje San Agustin Acasaguastlan', 'Estancia de la Virgen San Cristobal Acasaguastlan',
    'Paso de los Jalapas El Jicaro', 'Santa Rita Guastatoya', 'El Rancho San Agustin Acasaguastlan',
  ] },
  Sacatepequez: { cod: '03', desde: 1, municipios: [
    'Antigua Guatemala', 'Jocotenango', 'Pastores', 'Sumpango', 'Santo Domingo Xenacoj',
    'Santiago Sacatepequez', 'San Bartolome Milpas Altas', 'San Lucas Sacatepequez',
    'Santa Lucia Milpas Altas', 'Magdalena Milpas Altas', 'Santa Maria de Jesus',
    'Ciudad Vieja', 'San Miguel Duenas', 'Alotenango', 'San Antonio Aguas Calientes',
    'Santa Catarina Barahona', 'Santa Maria Cauque Santiago Sacatepequez',
  ] },
  Chimaltenango: { cod: '04', desde: 1, municipios: [
    'Chimaltenango', 'San Jose Poaquil', 'San Martin Jilotepeque', 'Comalapa',
    'Santa Apolonia', 'Tecpan Guatemala', 'Patzun', 'Pochuta', 'Patzicia',
    'Santa Cruz Balanya', 'Acatenango', 'Yepocapa', 'San Andres Itzapa',
    'Parramos', 'Zaragoza', 'El Tejar',
  ] },
  Escuintla: { cod: '05', desde: 1, municipios: [
    'Escuintla', 'Santa Lucia Cotzumalguapa', 'La Democracia', 'Siquinala',
    'Masagua', 'Tiquisate', 'La Gomera', 'Guanagazapa', 'San Jose', 'Itzapa',
    'Palin', 'San Vicente Pacaya', 'Nueva Concepcion', 'Obero Masagua',
    'Brito Guanagazapa', 'Santa Ana Mixtan Nueva Concepcion', 'El Naranjo Masagua',
    'San Andres Osuma Escuintla', 'Cuyuta Masagua', 'El Porvenir Ticanlu Tiquisate',
    'Sipacate La Gomera',
  ] },
  'Santa Rosa': { cod: '06', desde: 1, municipios: [
    'Cuilapa', 'Barberena', 'Santa Rosa de Lima', 'Casillas', 'San Rafael Las Flores',
    'Oratorio', 'San Juan Tecuaco', 'Chiquimulilla', 'Taxisco', 'Santa Maria Ixhuatan',
    'Guazacapan', 'Santa Cruz Naranjo', 'Pueblo Nuevo Vinas', 'Nueva Santa Rosa',
    'El Ahumado Chiquimulilla', 'Los Cerritos Chiquimulilla', 'Casas Viejas Chiquimulilla',
    'Ayarza Casillas', 'El Molino Cuilapa', 'Nancinta Chiquimulilla',
    'San Miguel Aroche Chiquimulilla', 'Los Esclavos Cuilapa', 'El Serinal Barberena',
    'Monterico Taxisco', 'San Juan de Arana Cuilapa', 'El Rinconcito Santa Rosa de Lima',
    'Cerro Gordo Santa Rosa de Lima',
  ] },
  Solola: { cod: '07', desde: 1, municipios: [
    'Solola', 'San Jose Chacaya', 'Santa Maria Visitacion', 'Santa Lucia Utatlan',
    'Nahuala', 'Santa Catarina Ixtahuacan', 'Santa Clara La Laguna', 'Concepcion',
    'San Andres Semetabaj', 'Panajachel', 'Santa Catarina Palopo', 'San Antonio Palopo',
    'San Lucas Toliman', 'Santa Cruz La Laguna', 'San Pablo La Laguna',
    'San Marcos La Laguna', 'San Juan La Laguna', 'San Pedro La Laguna',
    'Santiago Atitlan', 'Los Encuentros Solola', 'Godinez San Andres Semetabaj',
    'Agua Escondida San Antonio Palopo', 'Argueta Solola', 'Pixabaj Solola',
  ] },
  Totonicapan: { cod: '08', desde: 1, municipios: [
    'Totonicapan', 'San Cristobal Totonicapan', 'San Francisco El Alto',
    'San Andres Xecul', 'Momostenango', 'Santa Maria Chiquimula',
    'Santa Lucia La Reforma', 'San Bartolo',
  ] },
  Quetzaltenango: { cod: '09', desde: 1, municipios: [
    'Quetzaltenango', 'Salcaja', 'Olintepeque', 'San Carlos Sija', 'Sibilia',
    'Cabrican', 'Cajola', 'San Miguel Siquinala', 'Ostuncalco', 'San Mateo',
    'Concepcion Chiquirichapa', 'San Martin Sacatepequez', 'Almolonga', 'Cantel',
    'Huitan', 'Zunil', 'Colomba', 'San Francisco La Union', 'El Palmar',
    'Coatepeque', 'Genova', 'Flores Costa Cuca', 'La Esperanza',
    'Palestina de los Altos', 'Santa Maria de Jesus Zunil', 'Chiquibal San Carlos Sija',
    'Las Palmas Coatepeque', 'Cuicalba Sibilia', 'San Jose Chiquilaja Quetzaltenango',
    'El Eden Palestina de los Altos', 'Chuatuj San Carlos Sija', 'El Tambor El Palmar',
    'Las Mercedes Colomba', 'Palmira Colomba',
  ] },
  Suchitepequez: { cod: '10', desde: 1, municipios: [
    'Mazatenango', 'Cuyotenango', 'San Francisco Zapotitlan', 'San Bernardino',
    'San Jose El Idolo', 'Santo Domingo Suchitepequez', 'San Lorenzo', 'Samayac',
    'San Pablo Jocopilas', 'San Antonio Suchitepequez', 'San Miguel Panan',
    'San Gabriel', 'Chicacao', 'Patulul', 'Santa Barbara', 'San Juan Bautista',
    'Santo Tomas La Union', 'Zunilito', 'Pueblo Nuevo', 'Rio Bravo',
    'Cocales Patulul', 'Chocola San Pablo Jocopilas', 'Tahuexco Mazatenango',
    'Guatalon Rio Bravo', 'Palo Gordo San Antonio Suchitepequez',
    'San Rafael Panan Santa Barbara', 'Bracitos Mazatenango',
    'Bolivia Santo Domingo Suchitepequez', 'Monterrey Santo Domingo Suchitepequez',
    'La Maquina Cuyotenango',
  ] },
  Retalhuleu: { cod: '11', desde: 1, municipios: [
    'Retalhuleu', 'San Sebastian', 'Santa Cruz Mulua', 'San Martin Zapotitlan',
    'San Felipe', 'San Andres Villa Seca', 'Champerico', 'Nuevo San Carlos',
    'El Asintal', 'Caballo Blanco Retalhuleu', 'Candelaria Xolhuitz Nuevo San Carlos',
    'Sinavba El Asintal', 'El Xab El Asintal', 'La Maquina San Andres Villa Seca',
  ] },
  'San Marcos': { cod: '12', desde: 1, municipios: [
    'San Marcos', 'San Pedro Sacatepequez', 'San Antonio Sacatepequez', 'Comitancillo',
    'San Miguel Ixtahuacan', 'Concepcion Tutuapa', 'Tacana', 'Sibinal', 'Tajumulco',
    'Tejutla', 'San Rafael Pie de la Cuesta', 'Nuevo Progreso', 'El Tumbador',
    'El Rodeo', 'Malacatan', 'Catarina', 'Tecun Uman', 'Ocos', 'San Pablo',
    'El Quetzal', 'La Reforma', 'Pajapita', 'Ixchiguan', 'San Jose Ojetenam',
    'San Cristobal Cucho', 'Sipacapa', 'Esquipulas Palo Gordo', 'Rio Blanco',
    'San Lorenzo', 'El Carmen Malacatan', 'Zanjon San Lorenzo Tecun Uman',
    'San Jeronimo El Tumbador', 'Serchil San Marcos', 'La Democracia El Tumbador',
    'San Francisco El Rodeo', 'El Amparo El Tumbador', 'San Sebastian San Marcos',
    'Los Limones Ocos', 'La Blanca Ocos', 'El Cielo El Tumbador',
    'San Jose Ixtal Nuevo Progreso', 'Platanares Ocos', 'Las Delicias El Tumbador',
    'Calapte Ixchiguan', 'Tocache San Pablo', 'La Conquista Nuevo Progreso',
    'Champollap San Pedro Sacatepequez', 'Piedra Grande San Pedro Sacatepequez',
    'Santa Lucia Ixcamal San Marcos', 'El Sitio Catarina',
  ] },
  Huehuetenango: { cod: '13', desde: 1, municipios: [
    'Huehuetenango', 'Chiantla', 'Malacatancito', 'Cuilco', 'Nenton',
    'San Pedro Necta', 'Jacaltenango', 'Soloma', 'Ixtahuacan', 'Santa Barbara',
    'La Libertad', 'La Democracia', 'San Miguel Acatan', 'San Rafael La Independencia',
    'Todos Santos Cuchumatan', 'San Juan Atitan', 'Santa Eulalia', 'San Mateo Ixtatan',
    'Colotenango', 'San Sebastian Huehuetenango', 'Tectitan', 'Concepcion',
    'San Juan Ixcoy', 'San Antonio Huista', 'San Sebastian Coatan', 'Barillas',
    'Aguacatan', 'San Rafael Petzal', 'San Gaspar Ixchil', 'Santiago Chimaltenango',
    'Santa Ana Huista', 'Gracias a Dios Nenton', 'San Lorenzo Huehuetenango',
    'San Martin Cuchumatan', 'San Marcos Huista', 'Petatan Concepcion',
    'Paquix Chiantla', 'Michicoy San Pedro Necta', 'San Andres Huista',
    'Chalum La Libertad', 'La Mesilla',
  ] },
  Quiche: { cod: '14', desde: 1, municipios: [
    'Santa Cruz del Quiche', 'Quiche', 'Chinique', 'Zacualpa', 'Chajul',
    'Chichicastenango', 'Patzite', 'San Antonio Ilotenango', 'San Pedro Jocopilas',
    'Cunen', 'San Juan Cotzal', 'Joyabaj', 'Nebaj', 'San Andres Sajcabaja',
    'Uspantan', 'Sacapulas', 'San Bartolome Jocotenango', 'Canilla',
    'Playa Grande Ixcan', 'Chicaman', 'Santa Rosa Chujuyub Santa Cruz del Quiche',
    'Pachalum', 'Cantabal', 'San Jose La 20 Uspantan Ixcan', 'Xacbal',
  ] },
  'Baja Verapaz': { cod: '15', desde: 1, municipios: [
    'Salama', 'San Miguel Chicaj', 'Rabinal', 'Cubulco', 'Granados', 'El Chol',
    'San Jeronimo', 'Purulha', 'Los Amates El Chol', 'La Canoa Salama',
    'Saltan Granados', 'San Gabriel Pantzuy San Miguel Chicaj',
  ] },
  'Alta Verapaz': { cod: '16', desde: 1, municipios: [
    'Coban', 'Santa Cruz Verapaz', 'San Cristobal Verapaz', 'Tactic', 'Tamahu',
    'Tucuru', 'Panzos', 'Senahu', 'San Pedro Carcha', 'San Juan Chamelco',
    'Lanquin', 'Cahabon', 'Chisec', 'Chahal', 'Fray Bartolome de las Casas',
    'La Tinta', 'Teleman Panzos', 'Pancajche Tucuru', 'Sebol Fray Bartolome',
    'Bolonco Fray Bartolome', 'Campur San Pedro Carcha', 'Las Casas', 'Salacuin',
    'El Rosario', 'Las Conchas', 'Raxruha Chisec',
  ] },
  Peten: { cod: '17', desde: 1, municipios: [
    'Flores', 'San Jose', 'San Benito', 'San Andres', 'La Libertad',
    'San Francisco', 'Santa Ana', 'Dolores', 'San Luis', 'Sayaxche',
    'Melchor de Mencos', 'Poptun', 'Tikal Flores', 'Dos Lagunas Flores',
    'Santo Toribio Dolores', 'Paso Caballos San Andres', 'Uaxactun Flores',
    'Carmelita San Andres', 'Machaquila Dolores', 'El Chal Dolores',
    'Macanche Dolores', 'El Remate Flores', 'La Felicidad Sayaxche',
    'El Naranjo La Libertad', 'Sacpuy San Andres', 'Paxcaman Flores',
    'Las Cruces La Libertad', 'Sabaneta Dolores', 'Santa Elena',
  ] },
  Izabal: { cod: '18', desde: 1, municipios: [
    'Puerto Barrios', 'Livingston', 'El Estor', 'Morales', 'Los Amates',
    'Playitas Morales', 'El Rico Los Amates', 'Cayuga Morales', 'Quirigua Los Amates',
    'El Cinchado Puerto Barrios', 'Las Quebradas Morales', 'Entre Rios Puerto Barrios',
    'Santo Tomas de Castilla Puerto Barrios', 'El Mitchal Morales', 'Las Vinas Morales',
    'El Refugio Los Amates', 'Santa Ines Los Amates', 'Tenedores Morales',
    'San Felipe Livingston', 'Bananera Morales', 'Fronteras Livingston',
    'Mariscos Los Amates', 'Buenos Aires Morales',
  ] },
  Zacapa: { cod: '19', desde: 1, municipios: [
    'Zacapa', 'Estanzuela', 'Rio Hondo', 'Gualan', 'Teculutan', 'Usumatlan',
    'Cabanas', 'San Diego', 'La Union', 'Huite', 'La Reforma Huite',
    'San Jose Teculutan', 'San Jorge Zacapa', 'Santa Rosalia Zacapa',
    'Santa Lucia Zacapa', 'La Fragua Zacapa', 'San Pablo Zacapa', 'San Vicente',
  ] },
  Chiquimula: { cod: '20', desde: 1, municipios: [
    'Chiquimula', 'San Jose La Arada', 'San Juan Ermita', 'Jocotan', 'Camotan',
    'Olopa', 'Esquipulas', 'Concepcion Las Minas', 'Quetzaltepeque', 'San Jacinto',
    'Ipala', 'Anguiatu Concepcion Las Minas', 'El Amatillo Jocotan',
    'El Florido Camotan', 'Santa Elena Chiquimula', 'Vado Hondo Chiquimula',
    'San Esteban Chiquimula', 'Tierra Colorada San Jose La Arada',
    'Agua Caliente Esquipulas', 'Nueva Anguiatu Concepcion Las Minas',
  ] },
  Jalapa: { cod: '21', desde: 1, municipios: [
    'Jalapa', 'San Pedro Pinula', 'San Luis Jilotepeque', 'San Manuel Chaparron',
    'San Carlos Alzatate', 'Monjas', 'Mataquescuintla', 'Llano Grande',
  ] },
  Jutiapa: { cod: '22', desde: 1, municipios: [
    'Jutiapa', 'El Progreso', 'Santa Catarina Mita', 'Agua Blanca', 'Asuncion Mita',
    'Yupiltepeque', 'Atescatempa', 'Jerez', 'El Adelanto', 'Zapotitlan', 'Comapa',
    'Jalpatagua', 'Conguaco', 'Moyuta', 'Pasaco', 'San Jose Acatempa', 'Quesada',
    'Ciudad Pedro de Alvarado Moyuta', 'San Cristobal Frontera Atescatempa',
    'Valle Nuevo Jalpatagua', 'Rio de Paz', 'Horcones Santa Catarina Mita',
    'El Ovejero El Progreso', 'Contepeque Atescatempa', 'La Esmeralda Jerez',
    'Horcones Atescatempa', 'Tiucal Asuncion Mita',
  ] },
};

/* Las zonas de la Ciudad de Guatemala usan 010NN, donde NN es el número de
   zona. Regla verificada contra cuatro códigos publicados: zona 6 = 01006,
   zona 7 = 01007, zona 11 = 01011 y zona 21 = 01021. Se generan en vez de
   escribirlas: veinticinco líneas idénticas son veinticinco dedazos posibles. */
const ZONAS_CIUDAD_GT = Array.from({ length: 25 }, (_, i) => ({
  nombre: `Ciudad de Guatemala zona ${i + 1}`,
  codigo: '010' + String(i + 1).padStart(2, '0'),
}));

/* Compara nombres de lugares tolerando cómo los escribe cada quien: el DPI usa
   MAYÚSCULAS sin tildes ("SANTA CATARINA MITA"), la gente escribe con tilde y
   el catálogo postal va sin ella. Sin esto, "Sololá" no encontraría "Solola". */
function normalizarGeo(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function departamentosGT() { return Object.keys(GEO_GT).sort(); }

/* Municipios de un departamento, con su código postal ya calculado. */
function municipiosGT(departamento) {
  const d = buscarDepartamento(departamento);
  if (!d) return [];
  const lista = GEO_GT[d].municipios.map((nombre, i) => ({
    nombre,
    codigo: GEO_GT[d].cod + String(GEO_GT[d].desde + i).padStart(3, '0'),
  }));
  /* La capital suma sus zonas: en la ciudad la gente dice "zona 10", no un
     municipio, y la vecindad del DPI lo refleja. */
  return d === 'Guatemala' ? [...ZONAS_CIUDAD_GT, ...lista] : lista;
}

/* Nombre EXACTO del departamento a partir de cualquier forma de escribirlo. */
function buscarDepartamento(q) {
  if (!q) return null;
  if (GEO_GT[q]) return q;
  const n = normalizarGeo(q);
  return Object.keys(GEO_GT).find(d => normalizarGeo(d) === n) || null;
}

/* El código postal de una pareja departamento + municipio.
   Devuelve null si no se encuentra: es preferible a inventar un código, que
   terminaría impreso en una declaración jurada. */
function codigoPostalGT(departamento, municipio) {
  const d = buscarDepartamento(departamento);
  if (!d) return null;
  if (!municipio) return GEO_GT[d].cod + '000';     // el del departamento
  const n = normalizarGeo(municipio);
  const m = municipiosGT(d).find(x => normalizarGeo(x.nombre) === n);
  return m ? m.codigo : null;
}

/* Los códigos ISO de tres letras que imprime el DPI. GTM aparece dos veces
   —en NACIONALIDAD y en PAÍS DE NAC.— y en la declaración jurada tiene que
   leerse "guatemalteca" en una y "Guatemala" en la otra: son cosas distintas.
   Un notario no acepta "de nacionalidad GTM". */
const PAISES_ISO3 = {
  GTM: { pais: 'Guatemala',      gentilicio: 'Guatemalteca' },
  MEX: { pais: 'México',         gentilicio: 'Mexicana' },
  USA: { pais: 'Estados Unidos', gentilicio: 'Estadounidense' },
  SLV: { pais: 'El Salvador',    gentilicio: 'Salvadoreña' },
  HND: { pais: 'Honduras',       gentilicio: 'Hondureña' },
  NIC: { pais: 'Nicaragua',      gentilicio: 'Nicaragüense' },
  CRI: { pais: 'Costa Rica',     gentilicio: 'Costarricense' },
  PAN: { pais: 'Panamá',         gentilicio: 'Panameña' },
  BLZ: { pais: 'Belice',         gentilicio: 'Beliceña' },
  COL: { pais: 'Colombia',       gentilicio: 'Colombiana' },
  ESP: { pais: 'España',         gentilicio: 'Española' },
  CAN: { pais: 'Canadá',         gentilicio: 'Canadiense' },
};

/* GTM → "Guatemala". Si ya viene el nombre completo, lo deja como está. */
function paisDesdeISO(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const iso = PAISES_ISO3[s.toUpperCase()];
  return iso ? iso.pais : s;
}

/* GTM → "Guatemalteca", que es lo que pide la declaración jurada. */
function nacionalidadDesdeISO(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const iso = PAISES_ISO3[s.toUpperCase()];
  return iso ? iso.gentilicio : s;
}

if (typeof window !== 'undefined') {
  window.GEO_GT = GEO_GT;
  window.PAISES_ISO3 = PAISES_ISO3;
  window.departamentosGT = departamentosGT;
  window.municipiosGT = municipiosGT;
  window.buscarDepartamento = buscarDepartamento;
  window.codigoPostalGT = codigoPostalGT;
  window.normalizarGeo = normalizarGeo;
  window.paisDesdeISO = paisDesdeISO;
  window.nacionalidadDesdeISO = nacionalidadDesdeISO;
}
