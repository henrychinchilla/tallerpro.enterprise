/* El índice de boletines trae el nombre estadounidense del vehículo; el taller
   escribe el nombre con que el carro se vende acá. Sin traducción el modelo se
   queda sin boletines y en pantalla se lee "sin boletines para ese modelo", que
   es exactamente lo mismo que se lee cuando el vehículo de verdad no tiene
   ninguno. Ese es el fallo que estas pruebas cuidan: no que truene, sino que
   mienta callado.

   Caso que lo destapó: la Nissan Rogue 2017 — el vehículo de referencia del
   módulo — no estaba en el catálogo de alta, y el nombre que sí estaba
   (X-Trail) es justo el que el índice de NHTSA no conoce. */

const fs = require('fs');
const path = require('path');
const { cargar, ok, fin } = require('./harness');

/* Doble de fetch: sirve índices y archivos de boletines desde un mapa en
   memoria. Devolver {ok:false} para lo que no está imita al servidor real, que
   contesta 404 cuando la marca no tiene índice. */
function conIndice(mapa) {
  return cargar({
    fetch: async (ruta) => {
      if (!(ruta in mapa)) return { ok: false, json: async () => null };
      return { ok: true, json: async () => mapa[ruta] };
    },
  });
}

const NISSAN = ['ALTIMA', 'ARMADA', 'FRONTIER', 'KICKS', 'MURANO', 'PATHFINDER',
                'ROGUE', 'ROGUE-HYBRID', 'ROGUE-SPORT', 'SENTRA', 'VERSA',
                'VERSA-NOTE', 'XTERRA', 'TITAN'];

(async () => {
  const { M } = conIndice({
    '/data/tsb/NISSAN/_modelos.json': NISSAN,
    '/data/tsb/TOYOTA/_modelos.json': ['COROLLA', 'COROLLA-CROSS', 'RAV4'],
    '/data/tsb/ISUZU/_modelos.json': ['N-SERIES', 'F-SERIES', 'NPR'],
  });

  /* El nombre que el taller ya podía escribir sigue funcionando igual: la
     traducción no debe meterse cuando el índice conoce el nombre tal cual. */
  ok('Rogue resuelve directo (está en el índice)',
     await M._tsbModelo('NISSAN', 'Rogue') === 'ROGUE');
  ok('Frontier sigue siendo Frontier, no lo pisa ningún alias',
     await M._tsbModelo('NISSAN', 'Frontier') === 'FRONTIER');

  /* El corazón del arreglo. */
  ok('X-Trail se traduce a ROGUE',
     await M._tsbModelo('NISSAN', 'X-Trail') === 'ROGUE');
  ok('Qashqai se traduce a ROGUE-SPORT',
     await M._tsbModelo('NISSAN', 'Qashqai') === 'ROGUE-SPORT');
  ok('NP300 se traduce a FRONTIER',
     await M._tsbModelo('NISSAN', 'NP300') === 'FRONTIER');
  ok('Navara se traduce a FRONTIER',
     await M._tsbModelo('NISSAN', 'Navara') === 'FRONTIER');
  ok('Elf se traduce a N-SERIES',
     await M._tsbModelo('ISUZU', 'ELF') === 'N-SERIES');

  /* El taller no escribe el modelo pelado: escribe la versión completa. */
  ok('"X-Trail 2.5 SL" también se traduce a ROGUE',
     await M._tsbModelo('NISSAN', 'X-Trail 2.5 SL') === 'ROGUE');
  ok('"x-trail" en minúsculas se traduce igual',
     await M._tsbModelo('NISSAN', 'x-trail') === 'ROGUE');

  /* Un alias que apunta a un nombre que el índice no tiene no debe inventarlo:
     preferimos quedarnos sin boletín que servir el de otro vehículo. */
  const sinRogue = conIndice({
    '/data/tsb/NISSAN/_modelos.json': ['ALTIMA', 'SENTRA', 'FRONTIER'],
  });
  ok('si el destino del alias no está en el índice, devuelve null',
     await sinRogue.M._tsbModelo('NISSAN', 'X-Trail') === null);

  /* Lo que ya funcionaba antes del cambio tiene que seguir funcionando. */
  ok('Corolla XLI 1.8 sigue resolviendo a COROLLA (marca sin tabla de alias)',
     await M._tsbModelo('TOYOTA', 'Corolla XLI 1.8') === 'COROLLA');
  ok('un modelo desconocido sin alias sigue devolviendo null',
     await M._tsbModelo('NISSAN', 'Patrol') === null);
  ok('marca sin índice devuelve null y no revienta',
     await M._tsbModelo('SCANIA', 'R-Series') === null);

  /* El filtro por año es lo que hace segura una equivalencia que solo vale para
     cierta generación: los boletines fuera de rango se caen solos. */
  const conBoletines = conIndice({
    '/data/tsb/NISSAN/_modelos.json': NISSAN,
    '/data/tsb/NISSAN/ROGUE.json': [
      { d: 2014, h: 2018, t: 'Ruido en la CVT' },
      { d: 2021, h: 2023, t: 'Actualización de software del ABS' },
    ],
  });
  const b2017 = await conBoletines.M._tsbBuscar('Nissan', 'X-Trail', 2017);
  ok('la X-Trail 2017 recibe el boletín de la Rogue 2014-2018',
     b2017.length === 1 && b2017[0].t === 'Ruido en la CVT');
  const b2020 = await conBoletines.M._tsbBuscar('Nissan', 'X-Trail', 2020);
  ok('un año fuera de rango no recibe boletines aunque el alias resuelva',
     b2020.length === 0);

  /* Contra los archivos de verdad del repo: si mañana se regenera el índice y
     ROGUE cambia de nombre, el alias apunta al vacío y hay que enterarse acá,
     no con el carro enchufado. */
  const raiz = path.join(__dirname, '..', '..');
  const idxReal = JSON.parse(fs.readFileSync(
    path.join(raiz, 'data', 'tsb', 'NISSAN', '_modelos.json'), 'utf8'));
  ok('el índice real de Nissan sigue trayendo ROGUE',
     idxReal.includes('ROGUE'));
  ok('el índice real de Nissan sigue trayendo ROGUE-SPORT',
     idxReal.includes('ROGUE-SPORT'));

  /* Cada destino declarado en la tabla tiene que existir en el índice real de
     su marca. Es la prueba que evita que la tabla envejezca sin avisar. */
  let destinosOk = true, malos = [];
  for (const [marca, tabla] of Object.entries(M._tsbAliasMercado)) {
    const p = path.join(raiz, 'data', 'tsb', marca, '_modelos.json');
    if (!fs.existsSync(p)) { destinosOk = false; malos.push(marca + ' (sin índice)'); continue; }
    const lista = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const [local, usa] of Object.entries(tabla)) {
      if (!lista.includes(usa)) { destinosOk = false; malos.push(marca + ':' + local + '→' + usa); }
    }
  }
  ok('todos los destinos de la tabla existen en su índice real' +
     (malos.length ? ' — faltan: ' + malos.join(', ') : ''), destinosOk);

  /* La otra mitad del arreglo: que Rogue se pueda elegir al crear el vehículo. */
  const veh = fs.readFileSync(
    path.join(raiz, 'js', 'modulos', 'operacion', 'vehiculos.js'), 'utf8');
  const lineaNissan = veh.split('\n').find(l => /^\s*'Nissan':/.test(l)) || '';
  ok('el catálogo de alta de vehículos ofrece Rogue',
     /'Rogue'/.test(lineaNissan));
  ok('el catálogo de alta de vehículos conserva X-Trail',
     /'X-Trail'/.test(lineaNissan));
  ok('el catálogo de alta de vehículos ofrece Juke',
     /'Juke'/.test(lineaNissan));

  fin();
})();
