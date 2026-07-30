/* Escaneo por modulo con dongle Bluetooth via ATSH (PR #20), incluido el
   descarte de la linea de largo total que corria todos los bytes.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M, ctx } = cargar();

// Dongle ELM327 simulado. Solo 0x740 tiene a alguien.
let cabecera = null; const enviados = [];
M._via = 'ble'; M._protoNum = 6;
M._cmd = async (c) => {
  enviados.push(c);
  if (c.startsWith('ATSH')) { cabecera = c.slice(5).trim(); return 'OK'; }
  if (c.startsWith('AT')) return 'OK';
  if (cabecera !== '740') return 'NO DATA';
  if (c === '3E00') return '7E 00';
  if (c.startsWith('1902')) return '014\r0: 59 02 FF 01 71 00\r1: 09 00 00 00 00 00 00';
  return 'NO DATA';
};

(async () => {
  ok('habilita modulos en CAN 11 bits', M._elmPuedeModulos() === true);
  M._protoNum = 7;
  ok('NO habilita en 29 bits por BLE', M._elmPuedeModulos() === false);
  M._via = 'usb'; M._protoNum = 6;
  ok('_elmPuedeModulos es solo para BLE', M._elmPuedeModulos() === false);
  M._via = 'ble';

  ok('_hex3 rellena a 3 digitos', M._hex3(0x740) === '740' && M._hex3(0x7E) === '07E');

  // tocar puerta
  const hay = await M._tocarPuerta(0x740);
  ok('encuentra al que contesta', hay && hay.req === 0x740);
  ok('resp queda en null (el ELM la oculta)', hay.resp === null);
  ok('no inventa en direccion vacia', await M._tocarPuerta(0x741) === null);

  // UDS por ELM: respuesta multilinea con largo y prefijos 0:/1:
  const d = await M._udsPedirELM(0x740, [0x19, 0x02, 0xFF]);
  ok('descarta el largo total y arranca en 59', d[0] === 0x59 && d[1] === 0x02);
  const cods = M._dtcsUDS(d);
  ok('decodifica el codigo del modulo', cods.length === 1 && cods[0].codigo === 'P0171');
  ok('conserva el estado real', cods[0].confirmado === true);

  // respuesta negativa
  M._cmd = async c => c.startsWith('AT') ? 'OK' : '7F 19 11';
  const neg = await M._udsPedirELM(0x740, [0x19, 0x02, 0xFF]);
  ok('reconoce la respuesta negativa 7F', neg && neg[0] === 0x7F);
  M._cmd = async c => c.startsWith('AT') ? 'OK' : 'NO DATA';
  ok('NO DATA devuelve null', await M._udsPedirELM(0x740, [0x19,0x02,0xFF]) === null);

  // preparacion y restauracion de la cabecera
  enviados.length = 0; cabecera = null;
  M._cmd = async c => { enviados.push(c); if (c.startsWith('ATSH')) cabecera = c.slice(5).trim(); return 'OK'; };
  ok('prepara el dongle', await M._elmModoModulo(true) === true);
  ok('acelera el timeout con ATST', enviados.some(c => c.startsWith('ATST')));
  cabecera = '740';
  await M._elmModoModulo(false);
  ok('DEVUELVE la cabecera a la difusion 7DF', cabecera === '7DF');

  // dongle que no soporta ATSH: no se sigue
  M._cmd = async c => c.startsWith('ATSH') ? '?' : 'OK';
  ok('dongle sin ATSH se rechaza', await M._elmModoModulo(true) === false);

  // el USB no se toca
  M._via = 'usb'; M._canExt = false;
  let txUSB = null;
  M._canTx = async (id, dd) => { txUSB = { id, dd }; if (M._canRx) M._canRx(0x748, [0x02,0x7E,0x00]); };
  const u = await M._tocarPuerta(0x740);
  ok('USB sigue usando CAN crudo', txUSB && txUSB.id === 0x740 && txUSB.dd[1] === 0x3E);
  ok('USB si conserva la direccion de respuesta', u.resp === 0x748);
  fin();
})();
