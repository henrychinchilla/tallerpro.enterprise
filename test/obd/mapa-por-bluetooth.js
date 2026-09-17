/* El mapa de acceso también se arma por Bluetooth.

   Antes, todo lo que le habla a UN módulo —el barrido por dirección, el mapa
   de acceso, el UDS punto a punto, borrar por módulo, reiniciar— preguntaba
   `_via === 'ble'`. Pero "ble" es UN transporte de tres que llevan el MISMO
   diálogo ELM327: BLE del navegador, el puente de la app y el Bluetooth
   clásico por COM. Con el vLinker en modo MFi —el caso real de taller, que se
   conecta por COM— la vía es 'serial': no entraba a ninguna de esas ramas, se
   iba al camino de CAN crudo (que necesita el puente RP1210) y devolvía nada
   sin fallar. Resultado: el vehículo se escaneaba pero NUNCA dejaba mapa.

   Parte del banco de pruebas del módulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M, ctx } = cargar();

(async () => {
  /* ── Qué es un ELM y qué no ── */
  for (const v of ['ble', 'android', 'serial']) {
    M._via = v;
    ok(`'${v}' es un dongle ELM al que se le habla en texto`, M._esELM() === true);
  }
  for (const v of ['usb', 'j1939', 'j1708']) {
    M._via = v;
    ok(`'${v}' NO es un ELM`, M._esELM() === false);
  }

  /* ── El barrido por módulo se habilita con cualquiera de los tres ── */
  M._protoNum = 6;
  for (const v of ['ble', 'android', 'serial']) {
    M._via = v;
    ok(`habilita el escaneo por módulo por '${v}'`, M._elmPuedeModulos() === true);
  }
  M._via = 'serial'; M._protoNum = 7;
  ok('sigue sin habilitarlo en CAN de 29 bits', M._elmPuedeModulos() === false);
  M._protoNum = 4;
  ok('K-line por Bluetooth clásico también cuenta', M._klinePuedeModulos() === true);

  /* ── Por COM el UDS va por el camino ELM, no por el de CAN crudo ── */
  M._via = 'serial'; M._protoNum = 6;
  let cabecera = null; const enviados = [];
  M._cmd = async (c) => {
    enviados.push(c);
    if (c.startsWith('ATSH')) { cabecera = c.slice(5).trim(); return 'OK'; }
    if (c.startsWith('AT')) return 'OK';
    if (cabecera !== '7E0') return 'NO DATA';
    if (c === '3E00') return '7E 00';
    if (c === '1101') return '51 01';
    return 'NO DATA';
  };
  /* Si cayera al camino de CAN crudo esto llamaría a _canTx, que por Bluetooth
     no existe: la prueba lo delata en vez de dejarlo devolver null en silencio. */
  M._canTx = async () => { throw new Error('por Bluetooth no hay CAN crudo'); };

  const r = await M._udsPedir(0x7E0, null, [0x11, 0x01], 1000);
  ok('el UDS punto a punto por COM sale por el ELM', !!r && r[0] === 0x51);

  const puerta = await M._tocarPuerta(0x7E0);
  ok('toca la puerta por COM', puerta && puerta.req === 0x7E0);
  ok('y admite que el ELM oculta la dirección de respuesta', puerta.resp === null);
  ok('en una dirección vacía no inventa', await M._tocarPuerta(0x7E1) === null);

  /* ── Se puede borrar y reiniciar un módulo por Bluetooth ── */
  /* El getter real deriva `_listo` del transporte; acá se fija a mano para
     probar la regla de permiso sin levantar una conexión. */
  Object.defineProperty(M, '_listo', { value: true, configurable: true });
  ok('deja tocar un módulo puntual por Bluetooth', M._puedePuntoAPunto().ok === true);
  M._protoNum = 7;
  const neg = M._puedePuntoAPunto();
  ok('en 29 bits lo niega', neg.ok === false);
  ok('y dice por qué, sin mandar a buscar un cable USB',
     /11 bits/.test(neg.motivo) && !/USB/.test(neg.motivo));
  M._protoNum = 6;

  /* La cabecera del ELM es ESTADO: si no vuelve a la difusión, el monitor en
     vivo le sigue hablando al módulo de frenos. */
  cabecera = null;
  await M._elmPuntoAPunto(async () => { await M._cmd('ATSH 760'); });
  ok('devuelve la cabecera a 7DF al terminar', cabecera === '7DF');

  let exploto = false;
  cabecera = null;
  try { await M._elmPuntoAPunto(async () => { await M._cmd('ATSH 760'); throw new Error('falló'); }); }
  catch (_) { exploto = true; }
  ok('la devuelve aunque la operación falle', exploto && cabecera === '7DF');

  /* ── El mapa del modelo mezcla escaneos de USB y de Bluetooth ── */
  ctx.DB.getDiagnosticosPorModelo = async () => [
    { mapa_acceso: { enlace:'can', via:'usb', bits:11, baud:500, modulos: [
        { req:0x7E0, resp:0x7E8, nombre:'Motor' },
        { req:0x760, resp:0x768, nombre:'ABS' } ] } },
    { mapa_acceso: { enlace:'can', via:'serial', bits:11, baud:500, modulos: [
        { req:0x7E0, resp:null, nombre:'Motor' },
        { req:0x7A0, resp:null, nombre:null } ] } },
  ];
  M._vehiculos = [{ id:'v1', marca:'Kia', modelo:'Picanto', anio:2019 }];
  const mapa = await M._mapaConocido('v1');
  ok('el mapa del modelo junta los dos escaneos', mapa && mapa.n === 2);
  ok('el motor NO se duplica por venir sin dirección de respuesta',
     mapa.modulos.filter(m => m.req === 0x7E0).length === 1);
  ok('y conserva la dirección de respuesta que sí se supo (la del USB)',
     mapa.modulos.find(m => m.req === 0x7E0).resp === 0x7E8);
  ok('el módulo que solo vio el Bluetooth también entra',
     mapa.modulos.some(m => m.req === 0x7A0));

  /* ── Una dirección de 29 bits no se le pregunta a un ELM ── */
  const preguntadas = [];
  M._tocarPuerta = async req => { preguntadas.push(req); return { req, resp:null, ext:false }; };
  await M._probarConocidas([{ req:0x7E0, ext:false }, { req:0x18DA10F1, ext:true }]);
  ok('por ELM se saltea la dirección de 29 bits',
     preguntadas.length === 1 && preguntadas[0] === 0x7E0);
  M._via = 'usb';
  preguntadas.length = 0;
  await M._probarConocidas([{ req:0x7E0, ext:false }, { req:0x18DA10F1, ext:true }]);
  ok('por USB sí se le pregunta', preguntadas.length === 2);

  /* ── El mapa que se guarda dice por dónde se entró ── */
  M._via = 'serial'; M._canBaud = 500; M._canExt = false; M._mapaFaltantes = [];
  const guardado = M._mapaDeEscaneo([{ ecu:0x7E0, resp:null, nombre:'Motor', codigos:[] }]);
  ok('el mapa guarda el transporte', guardado.via === 'serial');
  ok('y no miente sobre la dirección de respuesta', guardado.modulos[0].resp === null);
  ok('hay un nombre legible para cada vía', M._NOMBRE_VIA.serial === 'Bluetooth clásico');

  fin();
})();
