/* El estado global se restaura AUNQUE ALGO FALLE.

   `_canExt` decide si la trama CAN se arma con id de 11 o de 29 bits, y es un
   flag del modulo entero. El escaneo por modulo lo cambia por cada modulo
   (la lista mezcla los dos direccionamientos) y tiene que dejarlo como estaba.

   Si no lo deja: el llamador atrapa el error y SIGUE con el escaneo, pero todas
   las tramas posteriores — sensores en vivo, borrado de codigos — salen mal
   armadas. Un flag global corrompido en silencio no falla donde se rompio, y
   eso es exactamente lo que arruinaria una prueba con el vehiculo enchufado.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M, ctx } = cargar();

M._via = 'usb'; M._canBaud = 500;
M._barrerModulos29 = async () => [];

(async () => {
  // ── el bucle de consulta revienta a la mitad ──────────────────────────
  M._canExt = false;
  M._barrerModulos = async () => [
    { req: 0x7E0, resp: 0x7E8, ext: false },
    { req: 0x18DA10F1, resp: 0x18DAF110, ext: true },   // cambia el flag a true
  ];
  M._udsPedir = async (req) => {
    if (req === 0x18DA10F1) throw new Error('el puente no respondio');
    return null;
  };
  let reventó = false;
  try { await M._escanearModulos(null, null); } catch (_) { reventó = true; }
  ok('el error sale a la superficie', reventó);
  ok('_canExt vuelve a false pese al error', M._canExt === false);

  /* El mismo caso pero al reves: se arranca en 29 bits y el que revienta es un
     modulo de 11. Si se dejara el flag como lo puso el ultimo modulo, quedaria
     en false y la asercion cazaria el error. Al reves no servia: el ultimo
     modulo ya dejaba el flag en el valor esperado y la prueba pasaba igual
     estando roto el codigo. */
  M._canExt = true;
  M._barrerModulos = async () => [
    { req: 0x18DA10F1, resp: 0x18DAF110, ext: true },
    { req: 0x740, resp: 0x748, ext: false },            // deja el flag en false
  ];
  M._udsPedir = async (req) => {
    if (req === 0x740) throw new Error('el puente no respondio');
    return null;
  };
  try { await M._escanearModulos(null, null); } catch (_) {}
  ok('_canExt vuelve a true pese al error', M._canExt === true);

  // ── camino normal con modulos mezclados ───────────────────────────────
  M._canExt = false;
  M._udsPedir = async () => null;
  await M._escanearModulos(null, null);
  ok('_canExt restaurado en el camino normal', M._canExt === false);

  // ── _probarConocidas ──────────────────────────────────────────────────
  M._canExt = false;
  M._tocarPuerta = async () => { throw new Error('bus caido'); };
  try { await M._probarConocidas([{ req: 0x18DA10F1, resp: 0x18DAF110, ext: true }]); } catch (_) {}
  ok('_probarConocidas restaura _canExt si falla', M._canExt === false);

  // ── _barrerModulos29 ──────────────────────────────────────────────────
  M._canExt = false;
  M._canTx = async () => { throw new Error('adaptador desconectado'); };
  try { await M._barrerModulos29(null); } catch (_) {}
  ok('_barrerModulos29 restaura _canExt si falla', M._canExt === false);

  // ── la cabecera del ELM vuelve a la difusion ──────────────────────────
  let cabecera = '740';
  M._via = 'ble';
  M._cmd = async c => { if (c.startsWith('ATSH')) cabecera = c.slice(5).trim(); return 'OK'; };
  await M._elmModoModulo(false);
  ok('_elmModoModulo(false) devuelve la cabecera a 7DF', cabecera === '7DF');

  fin();
})();
