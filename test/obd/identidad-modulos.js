/* Quién es cada módulo, y no dejarle el testigo prendido al vehículo.

   Las tres cosas que se vieron en el Picanto 2019 el 2026-09-17, en un escaneo
   real por Bluetooth:

   1. El barrido reportó "módulos" en 0x7DF y 0x7E8, los dos con cero códigos.
      No son módulos: 0x7DF es la dirección de DIFUSIÓN (le pregunta a todos a
      la vez) y 0x7E8-0x7EF son las de RESPUESTA. Un fantasma en el mapa es peor
      que un módulo de menos: el próximo escaneo lo busca, no lo encuentra y
      reporta una avería que no existe.

   2. Los once módulos salieron como "Módulo 0x7Bx". El nombre se pedía con un
      solo identificador (F197), que la mayoría no publica — teniendo el NÚMERO
      DE PIEZA (F187) a una consulta de distancia, que es con lo que un mecánico
      identifica un módulo de verdad.

   3. Durante el escaneo se encendió el testigo de la dirección (el volante con
      "!") y no se apagó hasta apagar el vehículo. Es la sesión de diagnóstico
      extendida que el escaneo abre para sacarle los códigos a los módulos que
      no los dan en sesión normal: el módulo avisa, con razón, que está en modo
      diagnóstico. Lo que faltaba era cerrarla.

   Parte del banco de pruebas del módulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M, ctx } = cargar();

(async () => {
  /* ── 1. Direcciones que no son un módulo ── */
  ok('0x7DF (difusión) no es un módulo', M._DIR_NO_ES_MODULO(0x7DF) === true);
  ok('0x7E8 (respuesta del motor) no es un módulo', M._DIR_NO_ES_MODULO(0x7E8) === true);
  ok('0x7EF (última de respuesta) tampoco', M._DIR_NO_ES_MODULO(0x7EF) === true);
  ok('0x7E0 (el motor) SÍ es un módulo', M._DIR_NO_ES_MODULO(0x7E0) === false);
  ok('0x7B3, donde contestó el Picanto, SÍ es un módulo', M._DIR_NO_ES_MODULO(0x7B3) === false);

  /* Un mapa guardado ANTES de saber esto trae los fantasmas adentro. Al releerlo
     hay que filtrarlos, o el modelo los arrastra para siempre. */
  ctx.DB.getDiagnosticosPorModelo = async () => [
    { mapa_acceso: { enlace:'can', via:'serial', bits:11, baud:500, modulos: [
      { req:0x7B3, resp:null, nombre:'Módulo 0x7B3' },
      { req:0x7DF, resp:null, nombre:'Módulo 0x7DF' },   // fantasma: difusión
      { req:0x7E8, resp:null, nombre:'Módulo 0x7E8' },   // fantasma: respuesta
      { req:0x7E0, resp:null, nombre:'Motor (ECM)' },
    ] } },
  ];
  M._vehiculos = [{ id:'v1', marca:'Kia', modelo:'Picanto', anio:2019 }];
  const mapa = await M._mapaConocido('v1');
  ok('el mapa viejo se limpia al releerlo', mapa.modulos.length === 2);
  ok('quedan los módulos de verdad',
     mapa.modulos.some(m => m.req === 0x7B3) && mapa.modulos.some(m => m.req === 0x7E0));
  ok('y no queda ningún fantasma',
     !mapa.modulos.some(m => M._DIR_NO_ES_MODULO(m.req)));

  /* ── 2. La identidad del módulo ── */
  const txt = (did, t) => [0x62, did >> 8, did & 0xFF].concat([...t].map(c => c.charCodeAt(0)));
  M._via = 'usb'; M._canExt = false; M._canBaud = 500;

  M._udsPedir = async (req, resp, tx) => {
    if (tx[0] === 0x22 && tx[1] === 0xF1 && tx[2] === 0x87) return txt(0xF187, '58920-G6300');
    return null;
  };
  const soloRef = await M._identidadModulo({ req:0x7B3 });
  ok('un módulo sin nombre igual entrega su referencia', soloRef.referencia === '58920-G6300');
  ok('y no se le inventa nombre', !soloRef.nombre);

  let consultados = [];
  M._udsPedir = async (req, resp, tx) => {
    consultados.push(tx.slice(0, 3).map(b => b.toString(16).padStart(2, '0')).join(''));
    if (tx[0] === 0x22 && tx[2] === 0x97) return txt(0xF197, 'MDPS');
    if (tx[0] === 0x22 && tx[2] === 0x87) return txt(0xF187, '56340-G6000');
    return null;
  };
  const completo = await M._identidadModulo({ req:0x7D4 });
  ok('cuando publica nombre Y referencia, se guardan los dos',
     completo.nombre === 'MDPS' && completo.referencia === '56340-G6000');
  ok('no se gasta una tercera consulta si ya se identificó', consultados.length === 2);

  /* ── 3. El testigo de la dirección: cerrar la sesión extendida ── */
  const enviados = [];
  M._barrerModulos = async () => [{ req:0x7D4, resp:null, ext:false }];
  M._barrerModulos29 = async () => [];
  M._udsPedir = async (req, resp, tx) => {
    enviados.push(tx.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
    /* Este módulo no entrega códigos en sesión normal: el caso que obliga a
       abrir la sesión extendida, que es el que enciende el testigo. */
    if (tx[0] === 0x19 && tx[1] === 0x02 && !M._enExtendida) return [0x7F, 0x19, 0x11];
    if (tx[0] === 0x10 && tx[1] === 0x03) { M._enExtendida = true; return [0x50, 0x03]; }
    if (tx[0] === 0x10 && tx[1] === 0x01) { M._enExtendida = false; return [0x50, 0x01]; }
    if (tx[0] === 0x19 && tx[1] === 0x02) return [0x59, 0x02, 0xFF, 0xC1, 0x06, 0x74, 0x09];
    if (tx[0] === 0x22 && tx[2] === 0x87) return txt(0xF187, '56340-G6000');
    return null;
  };
  M._enExtendida = false;
  const res = await M._escanearModulos(null, null);

  ok('le saca los códigos abriendo sesión extendida',
     res[0].codigos.length === 1 && /sesión extendida/.test(res[0].servicio));
  ok('y DEVUELVE el módulo a la sesión por defecto', enviados.includes('10 01'));
  ok('el 10 01 va DESPUÉS de haber leído los códigos',
     enviados.indexOf('10 01') > enviados.lastIndexOf('19 02 FF'));
  ok('el módulo queda fuera de la sesión de diagnóstico', M._enExtendida === false);
  ok('queda anotado que se devolvió la sesión', res[0].sesion_devuelta === true);
  ok('la identidad viaja con el escaneo, no solo al abrir la ficha',
     res[0].ident && res[0].ident.referencia === '56340-G6000');

  /* Un módulo que contesta a la primera NO abre sesión extendida: no hay por
     qué encenderle ningún testigo. */
  enviados.length = 0;
  M._udsPedir = async (req, resp, tx) => {
    enviados.push(tx.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
    if (tx[0] === 0x19 && tx[1] === 0x02) return [0x59, 0x02, 0xFF, 0xC1, 0x06, 0x74, 0x09];
    return null;
  };
  await M._escanearModulos(null, null);
  ok('al que contesta a la primera no se le abre sesión extendida', !enviados.includes('10 03'));
  ok('y por lo tanto tampoco hay que cerrarla', !enviados.includes('10 01'));

  /* ── La sugerencia por número de pieza es una pista, nunca el nombre ── */
  const sug = M._sugerenciaPorReferencia('56340-G6000');
  ok('sugiere el sistema por el grupo', sug && /Direcci/.test(sug.sistema));
  ok('y dice de qué grupo salió', sug.grupo === '56');
  ok('una referencia sin formato de pieza no sugiere nada',
     M._sugerenciaPorReferencia('XYZ') === null);

  /* ── La tabla "quién es cada módulo" se pinta y sus botones existen ── */
  M._modulosDeclarados = [];
  const filas = [
    { ecu:0x7B3, resp:null, ext:false, nombre:'Módulo 0x7B3', codigos:[],
      ident:{ referencia:'58920-G6300' } },
    { ecu:0x7E0, resp:null, ext:false, nombre:'Motor (ECM)', codigos:[], ident:null },
  ];
  let html = '';
  let reventó = null;
  try { html = M._identidadModulosHTML(filas, { marca:'Kia', modelo:'Picanto' }); }
  catch (e) { reventó = e; }
  ok('la tabla de identidad se pinta sin reventar', !reventó, reventó && reventó.message);
  ok('muestra la referencia que entregó el módulo', /58920-G6300/.test(html));
  ok('muestra la pista por dirección con su fuente', /por la dirección/i.test(html));
  /* El botón de "Nombrar" salió de la tabla el 2026-09-22: investigar quién es
     un módulo es trabajo de la IA. Queda el de volver a pedírselo. */
  ok('ofrece que la IA lo intente de nuevo', /identificarConIA\(\)/.test(html));
  ok('y ya no le pide al mecánico que lo bautice', !/nombrarModuloDelEscaneo/.test(html));
  ok('el que no publicó nada lo dice, no lo inventa', /no publicó identificación/.test(html));

  const llamadas = [...html.matchAll(/Modulos\.diagnostico_obd\.([A-Za-z_$][\w$]*)/g)].map(x => x[1]);
  const muertas = [...new Set(llamadas)].filter(n => typeof M[n] !== 'function');
  ok('ningún botón de la tabla llama a un método que no existe' +
     (muertas.length ? ` — falta: ${muertas.join(', ')}` : ''), muertas.length === 0);

  /* ── Mantener la conexión viva ── */
  ok('hay latido para que el dongle no se duerma', typeof M._iniciarLatido === 'function');
  ok('y una forma de soltarlo a mano', typeof M.desconectarAhora === 'function');
  ok('el saludo del latido le habla al DONGLE, no al vehículo',
     /* La DEFINICIÓN del método, no la primera llamada que aparezca: con
        `_iniciarLatido()` a secas el match empezaba en un lugar donde se lo
        invoca y capturaba el bloque equivocado. */
     /_cmd\('ATI'/.test(require('fs').readFileSync(
       require('path').join(__dirname, '../../js/modulos/operacion/diagnostico_obd.js'), 'utf8')
       .match(/_iniciarLatido\(\) \{[\s\S]*?\n  \},/)[0]));

  /* ── El eco del adaptador dejaba el escaneo sin protocolo ──────────────
     Picanto por COM, 2026-09-17 22:47: el escaneo se guardó con el protocolo
     `ATDPISO 15765-4 (CAN 11/500)>` — con el eco del comando pegado adelante y
     el prompt detrás. Y `ATDPN` devolvía `ATDPNA6>`: la expresión que buscaba
     el dígito AL FINAL de la cadena no encontraba nada por el '>', así que
     `_protoNum` quedaba en 0. Con 0 el barrido por módulo NO CORRE, y el
     escaneo salió con cero módulos y sin mapa, sin un solo error en pantalla. */
  ok('limpia el eco y el prompt de una respuesta AT',
     M._limpiarAT('ATDP', 'ATDPISO 15765-4 (CAN 11/500)>') === 'ISO 15765-4 (CAN 11/500)');
  ok('y no rompe una respuesta que ya venía limpia',
     M._limpiarAT('ATDP', 'ISO 15765-4 (CAN 11/500)') === 'ISO 15765-4 (CAN 11/500)');

  const pedidos = [];
  M._via = 'serial'; M._protoNum = 0;
  M._cmd = async c => {
    pedidos.push(c);
    /* Adaptador con el eco ENCENDIDO: contesta el comando y después el dato. */
    if (c === 'ATDPN') return 'ATDPNA6>';
    if (c === 'ATDP')  return 'ATDPISO 15765-4 (CAN 11/500)>';
    if (c === '0100')  return '41 00 BE 3F A8 13';
    if (c === 'ATI')   return 'ATIELM327 v2.3>';
    return 'OK';
  };
  const proto = await M._init(() => {});
  ok('saca el protocolo aunque venga con eco y prompt', M._protoNum === 6);
  ok('y por lo tanto el barrido por módulo SÍ corre', M._elmPuedeModulos() === true);
  ok('el nombre del protocolo se guarda limpio', proto === 'ISO 15765-4 (CAN 11/500)');
  ok('al detectar el eco lo vuelve a apagar',
     pedidos.filter(c => c === 'ATE0').length >= 2);

  /* Un adaptador sano no gasta el ATE0 de más. */
  pedidos.length = 0;
  M._cmd = async c => {
    pedidos.push(c);
    if (c === 'ATDPN') return 'A6';
    if (c === 'ATDP')  return 'ISO 15765-4 (CAN 11/500)';
    if (c === '0100')  return '41 00 BE 3F A8 13';
    if (c === 'ATI')   return 'ELM327 v2.3';
    return 'OK';
  };
  await M._init(() => {});
  ok('con el eco ya apagado, el protocolo sale igual', M._protoNum === 6);
  ok('y no se repite el ATE0 sin motivo', pedidos.filter(c => c === 'ATE0').length === 1);

  fin();
})();
