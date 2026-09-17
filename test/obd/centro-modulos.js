/* Centro de módulos: el orden que faltaba.

   Henry, mirando trece renglones que decían "Módulo 0x7B3": *"me siento
   perdido... porque no sé los nombres de los módulos"*. Dos cosas estaban mal
   y una faltaba:

   · Declarar en lote metía los DOS FANTASMAS (0x7DF difusión, 0x7E8 respuesta)
     y guardaba nombres que son la dirección otra vez — o sea dejaba la lista
     igual que antes, pero con la sensación de que ya estaba resuelto.
   · No había un nivel intermedio: o veías el reporte entero, o nada. Faltaba
     el resumen por gravedad y la ficha por módulo.

   Parte del banco de pruebas del módulo OBD — ver harness.js. */

const fs = require('fs'), vm = require('vm'), path = require('path');
const { ok, fin } = require('./harness');

const raiz = path.join(__dirname, '../..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

const borrados = [];
const ctx = {
  globalThis: null, Modulos: {}, console, setTimeout, clearTimeout, setInterval, clearInterval,
  Date, JSON, Math,
  navigator: { userAgent: 'prueba', clipboard: { writeText: async () => {} } },
  document: { getElementById: () => null, querySelector: () => null },
  window: {}, localStorage: { getItem: () => null, setItem: () => {} },
  Auth: { tenant: { name: 'Taller' }, user: { id: 'u1' } },
  rolEnLista: () => true, puedeAccion: () => true,
  UI: {
    esc: s => String(s == null ? '' : s),
    jsAttr: s => String(s == null ? '' : s).replace(/'/g, "\\'"),
    fecha: d => new Date(d).toISOString().slice(0, 10),
    toast: (m, t) => { ctx.toasts.push((t || 'ok') + ':' + m); },
    modal: (titulo, html) => { ctx.pintado = { titulo, html }; },
    cerrarModal: () => {}, confirmar: async () => true, loading: () => {},
  },
  DB: {
    getDefinicionesOEM: async () => ctx._oem,
    getModulosVehiculo: async () => [],
    getTodosModulosVehiculo: async () => ctx._declarados,
    getDiagnosticosPorModelo: async () => [],
    getDTCCatalogo: async () => null,
    getVehiculos: async () => [],
    upsertModuloVehiculo: async f => { ctx.guardados.push(f); return { data: f, error: null }; },
    upsertDiagnosticoOBD: async () => ({ error: null }),
    registrarEjecucionOEM: async f => { ctx.bitacora.push(f); return {}; },
    deleteRegistro: async (t, id) => { borrados.push(id); return true; },
  },
  toasts: [], guardados: [], bitacora: [], _oem: [], _declarados: [],
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(leer('js/modulos/operacion/diagnostico_obd.js'), ctx);
ctx.Modulos.btnAccion = (a, onclick) => `<button onclick="${onclick}">${a}</button>`;
ctx.Modulos.eliminarRegistro = () => {};
vm.runInContext(leer('js/modulos/operacion/diagnostico_oem.js'), ctx);
vm.runInContext(leer('js/modulos/operacion/diagnostico_modulos.js'), ctx);
const M = ctx.Modulos.diagnostico_obd;

/* El escaneo real del Picanto, tal cual quedó guardado. */
const escaneo = {
  id: 'scan1', vehiculo_id: 'v1', created_at: '2026-09-17T08:45:00Z',
  vehiculos: { marca:'Kia', modelo:'Picanto', anio:2019 },
  por_modulo: [
    { ecu:0x7B3, resp:null, nombre:'Módulo 0x7B3', codigos:[], ident:{ referencia:'58920-G6300' } },
    { ecu:0x7D2, resp:null, nombre:'Carrocería (0x7D2)',
      codigos:[{ codigo:'B2500', activo:false, sistema:'Carrocería' }], ident:null },
    { ecu:0x7D4, resp:null, nombre:'Módulo 0x7D4',
      codigos:[{ codigo:'C0106-74', activo:true, sistema:'Chasis' },
               { codigo:'P0741-07', activo:true, sistema:'Motor / transmisión' }], ident:null },
    { ecu:0x7DF, resp:null, nombre:'Módulo 0x7DF', codigos:[], ident:null },   // fantasma
    { ecu:0x7E0, resp:null, nombre:'Motor (ECM)', codigos:[], ident:null },
    { ecu:0x7E8, resp:null, nombre:'Módulo 0x7E8', codigos:[], ident:null },   // fantasma
  ],
};

(async () => {
  M._vehiculos = [{ id:'v1', marca:'Kia', modelo:'Picanto', anio:2019 }];
  M._scan = escaneo;
  M._modulosDeclarados = [];

  /* ── Declarar en lote: ni fantasmas ni nombres que son la dirección ── */
  M._modsDelEscaneo = { veh: escaneo.vehiculos, nuevos: escaneo.por_modulo };
  ctx.guardados.length = 0; ctx.toasts.length = 0;
  await M.declararTodosDelEscaneo();
  const dirs = ctx.guardados.map(g => g.req);
  ok('no declara 0x7DF: es la dirección de difusión', !dirs.includes(0x7DF));
  ok('no declara 0x7E8: es una dirección de respuesta', !dirs.includes(0x7E8));
  ok('no declara el que no dice NADA de sí mismo', !dirs.includes(0x7D4));
  ok('sí declara los que tienen nombre de verdad',
     dirs.includes(0x7D2) && dirs.includes(0x7E0));
  /* El que solo entregó su número de pieza SÍ vale: ese número se busca, se
     compara y se pide. Lo que no vale es declararlo llamándose 0x7B3 otra vez. */
  ok('el que solo dio su número de pieza se declara CON ese número',
     ctx.guardados.find(g => g.req === 0x7B3)?.nombre === 'Pieza 58920-G6300');
  ok('y avisa cuántos quedaron sin identificar', /sin identificar/.test(ctx.toasts.join(' ')));

  /* Si NINGUNO se pudo identificar, no declara nada y lo dice: trece
     direcciones declaradas no ayudan más que las trece de antes. */
  ctx.guardados.length = 0; ctx.toasts.length = 0;
  M._modsDelEscaneo = { veh: escaneo.vehiculos,
                        nuevos: [{ ecu:0x7B3, resp:null, nombre:'Módulo 0x7B3', codigos:[] }] };
  await M.declararTodosDelEscaneo();
  ok('con ninguno identificable no declara nada', ctx.guardados.length === 0);
  ok('y explica por qué', /nombralos de a uno/i.test(ctx.toasts.join(' ')));

  ok('reconoce un nombre inútil', M._nombreInutil('Módulo 0x7B3') && M._nombreInutil('  '));
  ok('y no confunde uno bueno', !M._nombreInutil('Airbag / SRS') && !M._nombreInutil('Motor (ECM)'));

  /* ── Limpiar lo que ya quedó mal declarado ── */
  M._modsDeclarados = [
    { id:'a', req:0x7DF, ext:false, nombre:'Módulo 0x7DF' },
    { id:'b', req:0x7E8, ext:false, nombre:'Módulo 0x7E8' },
    { id:'c', req:0x7B3, ext:false, nombre:'Módulo 0x7B3' },
    { id:'d', req:0x7D2, ext:false, nombre:'Carrocería' },
  ];
  borrados.length = 0;
  await M.limpiarModulosSinIdentificar();
  ok('limpia los dos fantasmas y el que no dice nada', borrados.length === 3);
  ok('y NO toca el que sí tiene nombre', !borrados.includes('d'));

  /* ── Resumen ordenado por gravedad ── */
  M._modsDeclarados = [];
  M._centroScan = null;
  await M.modalCentroModulos(escaneo);
  const html = ctx.pintado.html;
  ok('el centro se pinta sin reventar', !!html);
  const orden = [...html.matchAll(/fichaModulo\((\d+)\)/g)].map(x => Number(x[1]));
  ok('primero lo que está fallando AHORA', orden[0] === 0x7D4);
  ok('después lo guardado', orden[1] === 0x7D2);
  ok('y lo sano al final', orden[orden.length - 1] >= 0x7E0);
  ok('el encabezado dice cuántas fallas presentes hay', /2 falla\(s\) presentes/.test(html));
  ok('muestra el número de pieza cuando lo hay', /58920-G6300/.test(html));
  ok('y avisa cuántos módulos siguen sin nombre', /sin nombre/.test(html));

  /* ── Ficha de un módulo ── */
  ctx._oem = [{ id:'d1', marca:'Kia', modelo:'Picanto', ecu:'ECM / PCM (motor)', tipo:'reset',
                identificador:'dtc_modulo', estado:'verificado', riesgo:'controlado', activa:true,
                nombre:'Borrar códigos del módulo · Motor', protocolo:'uds',
                fuente:'Norma ISO / SAE: ISO 14229-1',
                definicion:{ red:'hs', request_id:0x7E0, response_id:0x7E8, objetivo_reset:'dtc_modulo' },
                precondiciones:['contacto'] }];
  M._oemDefs = ctx._oem;
  M.fichaModulo(0x7D4);
  const ficha = ctx.pintado.html;
  ok('la ficha se pinta sin reventar', !!ficha);
  ok('trae las cinco secciones en orden',
     ficha.indexOf('1 · QUIÉN ES') < ficha.indexOf('2 · CÓDIGOS') &&
     ficha.indexOf('2 · CÓDIGOS') < ficha.indexOf('3 · ACCIONES') &&
     ficha.indexOf('3 · ACCIONES') < ficha.indexOf('4 · FUNCIONES AUXILIARES') &&
     ficha.indexOf('4 · FUNCIONES AUXILIARES') < ficha.indexOf('5 · BANCO DE PRUEBAS'));
  ok('lista los dos códigos activos', /C0106-74/.test(ficha) && /P0741-07/.test(ficha));
  ok('ofrece bautizarlo', /nombrarModuloDelEscaneo\(2004\)/.test(ficha));
  ok('dice por qué las funciones auxiliares están bloqueadas',
     /no se transmite/.test(ficha) && /verificada/.test(ficha));

  M.fichaModulo(0x7E0);
  const fichaMotor = ctx.pintado.html;
  ok('en el motor aparece el procedimiento OEM cargado para ESE módulo',
     /Borrar códigos del módulo · Motor/.test(fichaMotor));

  /* ── Banco de pruebas ── */
  ok('traduce un rechazo a castellano', /fuera de rango/.test(M._nrcTexto(0x31)));
  ok('y uno desconocido no se lo inventa', /ver manual/.test(M._nrcTexto(0xAB)));

  const enviados = [];
  M._via = 'usb'; M._protoNum = 6;
  Object.defineProperty(M, '_listo', { value: true, configurable: true });
  M._udsPedir = async (req, resp, tx) => {
    enviados.push({ req, tx: tx.slice() });
    return [0x62, 0xF1, 0x87].concat([...'58920-G6300'].map(c => c.charCodeAt(0)));
  };
  const campos = { 'bp-dir':'7B3', 'bp-svc':'pieza' };
  ctx.document = { getElementById: id => (id in campos ? { value: campos[id] } : null), querySelector: () => null };
  ctx.bitacora.length = 0;
  await M.ejecutarPrueba();
  ok('manda el servicio a la dirección que se le puso',
     enviados.length === 1 && enviados[0].req === 0x7B3);
  ok('y la trama es la del número de pieza',
     enviados[0].tx.join(',') === [0x22, 0xF1, 0x87].join(','));
  ok('decodifica el texto de la respuesta', M._pruebas[0].texto === '58920-G6300');
  ok('todo queda en la bitácora', ctx.bitacora.length === 1 &&
     /banco_pruebas/.test(ctx.bitacora[0].operacion) && ctx.bitacora[0].respuesta_hex);

  enviados.length = 0;
  campos['bp-dir'] = 'ZZZ';
  ctx.toasts.length = 0;
  await M.ejecutarPrueba();
  ok('una dirección inválida no manda nada', enviados.length === 0);

  /* ── "No hay escaneos" con la lista llena de escaneos ──────────────────
     Reportado el 2026-09-17: "me dice que no hay escaneos y por eso no puedo
     subir los módulos.. pero claro que hay escaneos, hice uno ahora".
     `_scan` es SOLO el escaneo en curso: al recargar la app queda en null. */
  M._scan = null; M._centroScan = null;
  M._data = [escaneo];                     // lo que la pantalla ya tiene cargado
  ctx.toasts.length = 0;
  const trabajo = await M._escaneoDeTrabajo();
  ok('encuentra el escaneo aunque no haya ninguno EN CURSO', trabajo === escaneo);

  ctx.pintado = null;
  await M.modalCentroModulos();
  ok('el Centro abre sin escaneo en curso', !!ctx.pintado && /Centro de m/.test(ctx.pintado.titulo));
  ok('y no dice "no hay escaneos"', !/no hay escaneos/i.test(ctx.toasts.join(' ')));

  M._scan = null; M._centroScan = null;
  ctx.toasts.length = 0; ctx.pintado = null;
  await M.modalTomarDelEscaneo();
  ok('"Tomar del escaneo" también lo encuentra', !!ctx.pintado && /Tomar m/.test(ctx.pintado.titulo));

  /* Solo cuenta un escaneo si de verdad barrió módulos: uno de emisiones
     nada más no tiene nada que declarar. */
  M._scan = null; M._centroScan = null;
  M._data = [{ id:'x', created_at:'2026-09-01', por_modulo:[] }];
  ctx.DB.getDiagnosticosOBD = async () => [];
  ok('un escaneo sin barrido por módulo no cuenta', await M._escaneoDeTrabajo() === null);
  ctx.toasts.length = 0;
  await M.modalTomarDelEscaneo();
  ok('y ahí sí se dice, explicando cuándo corre el barrido',
     /barrido por módulo/i.test(ctx.toasts.join(' ')) && /ATSH/.test(ctx.toasts.join(' ')));

  /* Si el mes que se está mirando no tiene el escaneo, se busca sin límite de
     fecha antes de decir que no hay. */
  M._data = [];
  ctx.DB.getDiagnosticosOBD = async () => [escaneo];
  ok('busca fuera del mes activo antes de rendirse',
     (await M._escaneoDeTrabajo()) === escaneo);

  M._scan = escaneo; M._centroScan = escaneo; M._data = [escaneo];

  /* ── Ningún botón llama a un método que no existe ── */
  const todo = [html, ficha, fichaMotor].join('\n');
  const llamadas = [...todo.matchAll(/Modulos\.diagnostico_obd\.([A-Za-z_$][\w$]*)/g)].map(x => x[1]);
  const muertas = [...new Set(llamadas)].filter(n => typeof M[n] !== 'function');
  ok('ningún botón del centro llama a un método inexistente' +
     (muertas.length ? ` — falta: ${muertas.join(', ')}` : ''), muertas.length === 0);
  ok('y el centro tiene botones de verdad', llamadas.length > 8);

  fin();
})();
