/* La bitacora viaja con el escaneo guardado (PR #23): antes se perdia al
   cerrar el modal y habia que volver a enchufar el vehiculo.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M, ctx } = cargar();

// escaneo GUARDADO, con su bitacora adentro y el vehiculo embebido
const guardado = {
  id:'d1', vin:'JN8AT2MT0HW123456', mil:false, protocolo:'CAN 11/500', adaptador:'USB-Link',
  vehiculos:{ marca:'Nissan', modelo:'Rogue', anio:2017, placa:'P123ABC' },
  por_modulo:[{ ecu:0x758, resp:0x760, nombre:'TPMS', servicio:'19 02',
                codigos:[{codigo:'C1707-11'}] }],
  traza:[ {nota:'barrido 11 bits: 9 modulo(s)'}, {q:'UDS 0x758 19 02 FF', r:'59 02 FF C1 70 11 09'} ],
};
M._data = [guardado, { id:'d2', vehiculos:{}, traza:[] }];
M._vehiculos = [];

(async () => {
  // el reporte de un escaneo guardado sale completo aunque _scan este vacio
  M._scan = null; M._traza = null;
  const txt = M._trazaTexto(guardado);
  ok('usa el vehiculo embebido del guardado', /Nissan Rogue 2017/.test(txt) && /P123ABC/.test(txt));
  ok('usa la traza guardada, no la viva', /UDS 0x758/.test(txt) && /59 02 FF/.test(txt));
  ok('trae la nota del barrido', /# barrido 11 bits/.test(txt));
  ok('cuenta las entradas guardadas', /dialogo \(2 entradas\)/.test(txt));
  ok('trae el modulo con su codigo', /0x758/.test(txt) && /C1707-11/.test(txt));

  // copiar desde el reporte guardado
  await M.copiarTraza('d1');
  ok('copia la del escaneo guardado', /Nissan Rogue/.test(ctx.copiado || ''));

  // un escaneo viejo sin bitacora lo dice en vez de copiar un reporte vacio
  ctx.copiado = null; ctx.toasts.length = 0;
  await M.copiarTraza('d2');
  ok('avisa si el escaneo no tiene bitacora', ctx.copiado === null && /antes de que existiera/.test(ctx.toasts.join(' ') || ''));

  // id inexistente
  ctx.toasts.length = 0;
  await M.copiarTraza('nope');
  ok('avisa si no encuentra el escaneo', /No se encontro/.test(ctx.toasts.join(' ') || ''));

  // sin id sigue funcionando con el escaneo en curso
  M._traza = [{q:'0100', r:'41 00 BE'}];
  M._scan = { vehiculo_id:'v9', protocolo:'CAN' };
  M._vehiculos = [{ id:'v9', marca:'Toyota', modelo:'Hilux', anio:2019, placa:'C555' }];
  ctx.copiado = null;
  await M.copiarTraza();
  ok('sin id usa el escaneo en curso', /Toyota Hilux/.test(ctx.copiado||'') && /> 0100/.test(ctx.copiado||''));

  ok('traza en _CAMPOS_NUEVOS (degrada si falta la columna)', M._CAMPOS_NUEVOS.includes('traza'));
  fin();
})();
