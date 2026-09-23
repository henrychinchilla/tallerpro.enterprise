/* Nissan Juke 2017, 2026-09-23: los 10 módulos contestaron 7F xx 11/12
   ("servicio no soportado") a TODA pregunta de códigos, y el reporte los dio
   "sin códigos" con la alarma de TPMS prendida en el tablero.

   1. Un rechazo no es un sano: queda como lectura 'rechazada'.
   2. En Nissan se abre la sesión 10 C0 (CONSULT) y se reintenta la lectura;
      después se devuelve con 10 81.

   Parte del banco de pruebas del módulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M } = cargar();
const hex = tx => tx.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

(async () => {
  M._barrerModulos = async () => [{ req: 0x745, resp: 0x765, ext: false }];
  M._barrerModulos29 = async () => [];

  /* ── 1. Otra marca: todo rechazado → 'rechazada', y NO se abre 10 C0 ── */
  let enviados = [];
  M._marcaBarrido = 'Kia';
  M._udsPedir = async (req, resp, tx) => { enviados.push(hex(tx)); return tx[0] === 0x10 ? [0x7F, 0x10, 0x12] : [0x7F, tx[0], 0x11]; };
  let res = await M._escanearModulos(null, null);
  ok('un módulo que rechaza todo NO queda como leído', res[0].lectura === 'rechazada' && res[0].codigos.length === 0);
  ok('fuera de Nissan no se abre la sesión 10 C0', !enviados.includes('10 C0'));

  /* ── 2. Nissan: los códigos salen solo dentro de 10 C0 ── */
  enviados = [];
  let enC0 = false;
  M._marcaBarrido = 'Nissan';
  M._udsPedir = async (req, resp, tx) => {
    enviados.push(hex(tx));
    if (tx[0] === 0x10 && tx[1] === 0xC0) { enC0 = true; return [0x50, 0xC0]; }
    if (tx[0] === 0x10 && tx[1] === 0x81) { enC0 = false; return [0x50, 0x81]; }
    if (enC0 && tx[0] === 0x18 && tx[1] === 0x02) return [0x58, 0x01, 0x47, 0x34, 0x08];   // C0734? se decodifica igual que modo 03
    return tx[0] === 0x10 ? [0x7F, 0x10, 0x12] : [0x7F, tx[0], 0x11];
  };
  res = await M._escanearModulos(null, null);
  ok('en Nissan abre 10 C0 y lee los códigos', res[0].codigos.length === 1 && /10 C0/.test(res[0].servicio));
  ok('queda como lectura ok', res[0].lectura === 'ok');
  ok('y devuelve el módulo a la sesión normal (10 81)', enviados.includes('10 81') && enC0 === false);
  ok('el 10 81 va después de leer', enviados.indexOf('10 81') > enviados.indexOf('18 02 FF 00'));

  /* ── 3. Nissan que tampoco en 10 C0 deja leer: sigue 'rechazada' ── */
  M._udsPedir = async (req, resp, tx) => (tx[0] === 0x10 && tx[1] === 0xC0) ? [0x50, 0xC0]
    : tx[0] === 0x10 ? [0x7F, 0x10, 0x12] : [0x7F, tx[0], 0x11];
  res = await M._escanearModulos(null, null);
  ok('si ni con 10 C0 contesta, sigue siendo "no se pudo leer"', res[0].lectura === 'rechazada');

  M._marcaBarrido = null;
  fin();
})();
