/* Bitacora tecnica del escaneo (PR #22): el dialogo crudo con el vehiculo,
   para diagnosticar una falla sin tenerlo enfrente.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M, ctx } = cargar();

M._traza = [];
M._via = 'ble'; M._protoNum = 6; M._conectado = true; M._busy = false;

(async () => {
  // _cmd traza pedido y respuesta
  M._cmdRaw = async c => c === '0100' ? '41 00 BE 3F A8 13' : 'OK';
  await M._cmd('0100');
  ok('traza el comando y su respuesta',
     M._traza.length === 1 && M._traza[0].q === '0100' && /41 00 BE/.test(M._traza[0].r));

  // los saltos de linea no rompen el texto
  M._cmdRaw = async () => '014\r0: 59 02 FF\r1: 01 71';
  await M._cmd('1902FF');
  ok('aplana la respuesta multilinea', !/\r|\n/.test(M._traza[1].r) && /\|/.test(M._traza[1].r));

  // errores tambien quedan
  M._cmdRaw = async () => { throw new Error('Sin respuesta a ATZ'); };
  try { await M._cmd('ATZ'); } catch (_) {}
  ok('traza el error', /ERROR: Sin respuesta/.test(M._traza[2].r));

  // UDS: una entrada por consulta, con la direccion delante
  M._traza = []; M._via = 'usb'; M._canExt = false;
  M._udsPedirCAN = async () => [0x59,0x02,0xFF,0x01,0x71,0x00,0x09];
  const guardar = M._udsPedirCAN;
  M._udsPedirCAN = async (a,b,tx) => tx[0] === 0x19 ? [0x59,0x02,0xFF] : null;
  await M._udsPedir(0x740, 0x748, [0x19,0x02,0xFF]);
  ok('UDS traza con la direccion', M._traza.length === 1 && /0x740/.test(M._traza[0].q));
  ok('UDS traza los bytes de ida', /19 02 FF/.test(M._traza[0].q));
  ok('UDS traza los bytes de vuelta', /59 02 FF/.test(M._traza[0].r));
  await M._udsPedir(0x741, 0x749, [0x22,0xF1,0x97]);
  ok('sin respuesta se dice', M._traza[1].r === 'sin respuesta');

  // el barrido NO ahoga la bitacora: se resume en una nota
  M._traza = [];
  let tocadas = 0;
  M._tocarPuerta = async req => { tocadas++; return req === 0x740 ? {req, resp:0x748, ext:false} : null; };
  const h = await M._barrerModulos(null);
  ok('el barrido toco las 240 puertas', tocadas === 240);
  ok('pero deja UNA sola entrada', M._traza.length === 1);
  ok('y esa entrada resume el hallazgo', /barrido 11 bits/.test(M._traza[0].nota) && /0x740/.test(M._traza[0].nota));

  // tope
  M._traza = []; M._sinTraza = false;
  for (let i = 0; i < 500; i++) M._trazar('x', 'y');
  ok('respeta el tope', M._traza.length === M._TRAZA_TOPE);

  // el texto final
  M._traza = [{q:'0100', r:'41 00 BE'}, {nota:'barrido: 2 modulos'}];
  M._scan = { vehiculo_id:'v1', vin:'JN8AT2MT0HW123456', mil:true, protocolo:'CAN 11/500',
              adaptador:'Vgate', voltaje:'14.1V',
              por_modulo:[{ecu:0x758, resp:0x760, nombre:'TPMS', servicio:'19 02',
                           codigos:[{codigo:'C1707-11'}]}],
              mapa_acceso:{bits:11, modulos:[{req:0x758}], faltantes:[]} };
  M._vehiculos = [{id:'v1', marca:'Nissan', modelo:'Rogue', anio:2017, placa:'P123ABC'}];
  const txt = M._trazaTexto();
  ok('el reporte trae el vehiculo', /Nissan Rogue 2017/.test(txt) && /P123ABC/.test(txt));
  ok('trae el VIN y el protocolo', /JN8AT2MT0HW123456/.test(txt) && /CAN 11\/500/.test(txt));
  ok('trae el modulo con su servicio', /0x758/.test(txt) && /TPMS/.test(txt) && /19 02/.test(txt));
  ok('trae el codigo hallado', /C1707-11/.test(txt));
  ok('trae el dialogo', /> 0100/.test(txt) && /< 41 00 BE/.test(txt));
  ok('trae la nota del barrido', /# barrido: 2 modulos/.test(txt));

  await M.copiarTraza();
  ok('copia al portapapeles', /NexusPro/.test(ctx.copiado || ''));
  fin();
})();
