/* La pantalla OEM se PINTA de verdad, no se lee como texto.

   El hueco que tapa: un `Modulos.diagnostico_obd.metodoQueNoExiste(...)`
   escrito dentro de una plantilla es sintaxis válida —`node --check` lo
   aprueba— y las pruebas por expresión regular lo ven como una cadena más.
   Solo revienta cuando alguien abre la pantalla. Es el mismo hueco de
   `UI.escUI.jsAttr(...)`, pero con los botones del propio módulo, que
   referencias-vivas.js no mira porque solo persigue UI.* y DB.*.

   Acá se arma el HTML de verdad y después se verifica que CADA botón llame a
   algo que existe.

   Parte del banco de pruebas del módulo OBD — ver harness.js. */

const fs = require('fs'), vm = require('vm'), path = require('path');
const { ok, fin } = require('./harness');

const raiz = path.join(__dirname, '../..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

const pintados = [];
const ctx = {
  globalThis: null, Modulos: {}, console, setTimeout, clearTimeout, Date, JSON, Math,
  navigator: { userAgent: 'prueba', clipboard: { writeText: async () => {} } },
  document: { getElementById: () => null, querySelector: () => null },
  window: {},
  Auth: { tenant: { name: 'Taller de prueba' }, user: { id: 'u1' } },
  rolEnLista: () => true,
  UI: {
    esc: s => String(s == null ? '' : s),
    jsAttr: s => String(s == null ? '' : s).replace(/'/g, "\\'"),
    fecha: d => new Date(d).toISOString().slice(0, 10),
    toast: () => {}, cerrarModal: () => {}, confirmar: async () => false,
    modal: (titulo, html) => { pintados.push({ titulo, html }); },
  },
  DB: {
    getDefinicionesOEM: async () => ctx._defs,
    getDiagnosticosOBD: async () => [],
    getDiagnosticosPorModelo: async () => [],
    getMapasVehiculos: async () => [],
    getDTCCatalogo: async () => null,
    getVehiculos: async () => [],
    registrarEjecucionOEM: async () => ({}),
    upsertDefinicionOEM: async () => ({}),
  },
  _defs: [],
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(leer('js/modulos/operacion/diagnostico_obd.js'), ctx);
/* `Modulos.btnAccion` vive en js/core/app.js; acá alcanza con un doble que
   produzca el mismo tipo de llamada, que es lo que se está verificando. */
ctx.Modulos.btnAccion = (accion, onclick) =>
  `<button class="btn btn-sm" onclick="${onclick}">${accion}</button>`;
ctx.Modulos.eliminarRegistro = () => {};
vm.runInContext(leer('js/modulos/operacion/diagnostico_oem.js'), ctx);

const M = ctx.Modulos.diagnostico_obd;
const O = ctx.OEMMotor;
ok('el módulo OEM se enganchó sobre el de diagnóstico', typeof M.modalOEM === 'function');

/* Las definiciones que va a pintar: una ejecutable y una en borrador, sacadas
   del propio paquete del Picanto para que la prueba no invente casos que el
   producto no produce. */
const paquete = O.paquetes.find(x => x.id === 'kia_picanto').construir();
const ejecutable = paquete.find(d => d.tipo === 'reset' && d.estado === 'verificado');
const enBorrador = paquete.find(d => d.tipo === 'reset' && d.estado === 'borrador');
ctx._defs = [
  { ...ejecutable, id: 'def-ok' },
  { ...enBorrador, id: 'def-borrador' },
];

(async () => {
  let error = null;
  try { await M.modalOEM(); } catch (e) { error = e; }
  ok('la pantalla OEM se pinta sin reventar', !error, error && error.message);
  const pantalla = pintados[pintados.length - 1] || { html: '' };

  ok('ofrece cargar el paquete del Picanto',
     /cargarPaqueteOEM\('kia_picanto'\)/.test(pantalla.html));
  ok('ofrece completar direcciones desde el mapa',
     /completarDireccionesOEM\(\)/.test(pantalla.html));
  ok('el reset ejecutable trae su botón de ejecutar',
     /ejecutarResetOEM\('def-ok'\)/.test(pantalla.html));
  ok('el reset en borrador NO lo trae',
     !/ejecutarResetOEM\('def-borrador'\)/.test(pantalla.html));
  ok('dice que las direcciones no legisladas salen del vehículo',
     /sin dirección a propósito/i.test(pantalla.html));

  /* La ficha de una definición, con su botón según el tipo. */
  pintados.length = 0;
  error = null;
  try { M.verOEM('def-ok'); } catch (e) { error = e; }
  ok('la ficha de un reset se pinta sin reventar', !error, error && error.message);
  const ficha = pintados[pintados.length - 1] || { html: '' };
  ok('la ficha muestra la trama exacta que se transmitiría', /14 FF FF FF/.test(ficha.html));
  ok('y el botón de ejecutar reset', /ejecutarResetOEM\('def-ok'\)/.test(ficha.html));

  pintados.length = 0;
  try { M.verOEM('def-borrador'); } catch (e) { error = e; }
  const fichaB = pintados[pintados.length - 1] || { html: '' };
  ok('la ficha de un borrador deshabilita el botón', /disabled/.test(fichaB.html));

  /* ── Lo que motivó esta prueba: que ningún botón llame a algo inexistente ── */
  const htmlTodo = [pantalla.html, ficha.html, fichaB.html].join('\n');
  const llamadas = [...htmlTodo.matchAll(/Modulos\.diagnostico_obd\.([A-Za-z_$][\w$]*)/g)]
    .map(m => m[1]);
  ok('la pantalla sí tiene botones que llaman al módulo', llamadas.length > 5);
  const muertas = [...new Set(llamadas)].filter(n => typeof M[n] !== 'function');
  ok('ningún botón llama a un método que no existe' +
     (muertas.length ? ` — falta: ${muertas.join(', ')}` : ''), muertas.length === 0);

  fin();
})();
