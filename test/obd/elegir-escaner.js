/* El selector de escáner NUNCA elige solo.

   En un taller hay manos libres, balanzas e impresoras emparejadas, y un
   barrido BLE levanta además llaveros y sensores de presión. Conectarse al
   primero que aparezca deja al mecánico esperando una respuesta que nunca
   llega — y peor: el aparato equivocado acepta la conexión y se queda mudo,
   que es indistinguible de un dongle roto.

   Había un camino silencioso hacia eso: cuando no existía el panel del escaneo
   (por ejemplo, llamado desde el módulo OEM) la función devolvía `lista[0]`
   sin preguntar nada. Esta prueba cierra ese camino. */
const { cargar, ok, fin } = require('./harness');

const dormir = ms => new Promise(r => setTimeout(r, ms));

const LISTA = [
  { nombre: 'Manos libres del carro', mac: 'AA:BB:CC:00:00:01', tipo: 'spp', vinculado: true },
  { nombre: 'vLinker MS 09327',       mac: 'AA:BB:CC:00:00:02', tipo: 'spp', vinculado: true },
  { nombre: 'FF:11:22:33:44:55',      mac: 'FF:11:22:33:44:55', tipo: 'ble', vinculado: false },
];

(async () => {
  const { M } = cargar();

  /* Sin panel de escaneo en el documento: es el caso que devolvía lista[0]. */
  let resuelto = false, elegido = null;
  const p = M._elegirEscaner(LISTA).then(v => { resuelto = true; elegido = v; });

  await dormir(60);
  ok('sin panel de escaneo NO elige solo: espera al usuario', resuelto === false);
  ok('...y deja un manejador para recibir la elección', typeof M._escanerElegido === 'function');

  /* El usuario elige el segundo, que es el dongle de verdad. */
  M._escanerElegido(1);
  await p;
  ok('devuelve EXACTAMENTE el que se eligió', !!elegido && elegido.mac === 'AA:BB:CC:00:00:02');
  ok('...y no el primero de la lista', !!elegido && elegido.nombre !== 'Manos libres del carro');

  /* Cancelar devuelve null, no un aparato cualquiera. */
  let cancelado = 'sin tocar';
  const p2 = M._elegirEscaner(LISTA).then(v => { cancelado = v; });
  await dormir(30);
  M._escanerElegido(null);
  await p2;
  ok('cancelar devuelve null, no un aparato al azar', cancelado === null);

  fin();
})();
