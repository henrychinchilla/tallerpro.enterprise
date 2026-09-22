/* La IA bautiza los módulos, y el escaneo no se pierde al abrir una ventana.

   Dos pedidos de Henry el 2026-09-22, los dos sobre lo mismo: que la
   herramienta haga el trabajo en vez de devolvérselo.

   1. *"cuando se hace un escaneo y entro a los módulos, o hago algo que haga un
      popup, se sale el scan y tengo que volver a hacer otro"*. La app tiene UN
      solo modal: mientras el reporte viviera adentro, cualquier ventana lo
      reemplazaba. Ahora el reporte es la PÁGINA y todo lo demás se abre encima.

   2. *"no quiero volver a ver los módulos y que me diga renombrar... si hay
      módulos nuevos o que no tienen nombre, la IA debe investigar y colocar el
      nombre"*. Lo que NO cambia: un nombre que la IA no puede sostener vuelve
      en null y el módulo se queda sin nombre. Un nombre inventado manda a
      desmontar el módulo que no era.

   Parte del banco de pruebas del módulo OBD — ver harness.js. */

const fs = require('fs'), vm = require('vm'), path = require('path');
const { ok, fin } = require('./harness');

const raiz = path.join(__dirname, '../..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

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
    cerrarModal: () => {}, loading: () => {},
    confirmar: async () => ctx.respuestaConfirmar,
  },
  DB: {
    getDefinicionesOEM: async () => [],
    getModulosVehiculo: async () => [],
    getTodosModulosVehiculo: async () => ctx._declarados,
    getDiagnosticosPorModelo: async () => [],
    getDTCCatalogo: async () => null,
    getVehiculos: async () => [],
    upsertModuloVehiculo: async f => { ctx.guardados.push(f); return { data: f, error: null }; },
    upsertDiagnosticoOBD: async () => ({ data: { id: 'nuevo' }, error: null }),
    registrarEjecucionOEM: async () => ({}),
    deleteRegistro: async () => true,
  },
  /* La IA de mentira: devuelve lo que cada prueba le ponga en `ctx.respuestaIA`. */
  IA: { identificarModulos: async payload => { ctx.pedidoIA = payload; return ctx.respuestaIA; } },
  toasts: [], guardados: [], _declarados: [],
  respuestaIA: { ok: true, modulos: [] }, respuestaConfirmar: true, pedidoIA: null,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(leer('js/modulos/operacion/diagnostico_obd.js'), ctx);
ctx.Modulos.btnAccion = (a, onclick) => `<button onclick="${onclick}">${a}</button>`;
ctx.Modulos.eliminarRegistro = () => {};
vm.runInContext(leer('js/modulos/operacion/diagnostico_modulos.js'), ctx);
const M = ctx.Modulos.diagnostico_obd;

const nuevoEscaneo = () => ({
  vehiculo_id: 'v1', vehiculos: { marca: 'Kia', modelo: 'Picanto', anio: 2019 },
  por_modulo: [
    { ecu: 0x7B3, resp: null, ext: false, nombre: 'Módulo 0x7B3', codigos: [],
      ident: { referencia: '58920-G6300' } },
    { ecu: 0x7D4, resp: null, ext: false, nombre: 'Chasis / frenos (0x7D4)',
      codigos: [{ codigo: 'C0106-74', activo: true }], ident: null },
    { ecu: 0x7DF, resp: null, ext: false, nombre: 'Módulo 0x7DF', codigos: [], ident: null }, // difusión
    { ecu: 0x7E8, resp: null, ext: false, nombre: 'Módulo 0x7E8', codigos: [], ident: null }, // respuesta
    { ecu: 0x7E0, resp: null, ext: false, nombre: 'Motor (ECM)', codigos: [], ident: null },
  ],
});

(async () => {
  M._vehiculos = [{ id: 'v1', marca: 'Kia', modelo: 'Picanto', anio: 2019 }];
  M._modulosDeclarados = [];

  /* ── Qué cuenta como "sin nombre" ───────────────────────────────────────
     Un nombre que lleva su propia dirección adentro es el número otra vez. */
  ok('"Módulo 0x7B3" no es un nombre', M._nombreGenerico('Módulo 0x7B3', 0x7B3));
  ok('"Chasis / frenos (0x7D4)" tampoco: es la familia del código + la dirección',
     M._nombreGenerico('Chasis / frenos (0x7D4)', 0x7D4));
  ok('"Pieza 58920-G6300" tampoco: es el repuesto, no el módulo',
     M._nombreGenerico('Pieza 58920-G6300', 0x7B3));
  ok('"Sin identificar 0x7D4" tampoco', M._nombreGenerico('Sin identificar 0x7D4', 0x7D4));
  ok('vacío tampoco', M._nombreGenerico('', 0x7B3) && M._nombreGenerico('   ', 0x7B3));
  ok('un nombre de verdad SÍ vale',
     !M._nombreGenerico('Motor (ECM)', 0x7E0) &&
     !M._nombreGenerico('Airbag / SRS', 0x7D4) &&
     !M._nombreGenerico('Dirección asistida (MDPS)', 0x7B3));

  /* ── A quién se le pregunta ─────────────────────────────────────────────
     Los fantasmas NO se mandan a identificar: 0x7DF es difusión y 0x7E8 es
     una dirección de respuesta. Pedirle a la IA que les invente nombre es
     pedirle que invente. */
  let s = nuevoEscaneo();
  const pendientes = M._modulosSinNombre(s).map(m => m.ecu);
  ok('manda los dos que no tienen nombre', pendientes.includes(0x7B3) && pendientes.includes(0x7D4));
  ok('NO manda los fantasmas (0x7DF difusión, 0x7E8 respuesta)',
     !pendientes.includes(0x7DF) && !pendientes.includes(0x7E8));
  ok('NO manda el que ya tiene nombre', !pendientes.includes(0x7E0));

  /* Lo que el taller escribió a mano gana sobre cualquier búsqueda. */
  M._modulosDeclarados = [{ req: 0x7B3, nombre: 'Airbag (lo puso el mecánico)' }];
  ok('NO toca el módulo que ya nombró el taller',
     !M._modulosSinNombre(s).some(m => m.ecu === 0x7B3));
  M._modulosDeclarados = [];

  /* ── La evidencia que viaja ─────────────────────────────────────────── */
  ctx.respuestaIA = { ok: true, modulos: [] };
  await M.bautizarModulosConIA(s, () => {});
  const ev = (ctx.pedidoIA.modulos || []).find(m => m.ecu === '0x7B3');
  ok('le manda el número de pieza, que es LA pista', ev && ev.numero_de_pieza_F187 === '58920-G6300');
  ok('le manda la marca y el modelo del vehículo',
     ctx.pedidoIA.vehiculo.marca === 'Kia' && ctx.pedidoIA.vehiculo.modelo === 'Picanto');
  ok('y los códigos que reportó el otro módulo',
     (ctx.pedidoIA.modulos.find(m => m.ecu === '0x7D4') || {}).codigos_que_reporta[0] === 'C0106-74');

  /* ── Aplica lo que se puede sostener ────────────────────────────────── */
  s = nuevoEscaneo();
  ctx.guardados.length = 0;
  ctx.respuestaIA = { ok: true, modulos: [
    { ecu: '0x7B3', nombre: 'Dirección asistida eléctrica (MDPS)', sistema: 'eps',
      confianza: 'alta', fuente: 'pieza 58920-G6300 en catálogo Kia' },
    { ecu: '0x7D4', nombre: null, confianza: 'baja', fuente: 'sin evidencia' },
  ] };
  const puestos = await M.bautizarModulosConIA(s, () => {});
  const m7B3 = s.por_modulo.find(m => m.ecu === 0x7B3);
  const m7D4 = s.por_modulo.find(m => m.ecu === 0x7D4);
  ok('bautiza el que pudo sostener', puestos === 1 && m7B3.nombre === 'Dirección asistida eléctrica (MDPS)');
  ok('deja constancia de que el nombre lo puso la IA, con su fuente',
     m7B3.ident.ia.confianza === 'alta' && /58920-G6300/.test(m7B3.ident.ia.fuente));
  ok('el que NO pudo sostener se queda sin nombre — no se inventa nada',
     m7D4.nombre === 'Chasis / frenos (0x7D4)');
  ok('lo guarda para todo el modelo con origen "ia"',
     ctx.guardados.length === 1 && ctx.guardados[0].origen === 'ia' &&
     ctx.guardados[0].req === 0x7B3 && ctx.guardados[0].sistema === 'eps');
  ok('y la fuente queda en la nota, no se pierde', /58920-G6300/.test(ctx.guardados[0].nota));

  /* ── Lo que la IA devuelve pasa por el MISMO filtro ─────────────────── */
  s = nuevoEscaneo();
  ctx.guardados.length = 0;
  ctx.respuestaIA = { ok: true, modulos: [
    { ecu: '0x7B3', nombre: 'Módulo 0x7B3', confianza: 'alta', fuente: 'inventada' },
    { ecu: '0x7D4', nombre: 'Módulo de chasis 0x7D4', confianza: 'alta', fuente: 'inventada' },
  ] };
  ok('si la IA contesta la dirección otra vez, NO se acepta como nombre',
     (await M.bautizarModulosConIA(s, () => {})) === 0 && ctx.guardados.length === 0);

  /* Un "baja" se muestra en el escaneo pero no se le enseña al taller como
     si fuera un hecho: no se guarda para todo el modelo. */
  s = nuevoEscaneo();
  ctx.guardados.length = 0;
  ctx.respuestaIA = { ok: true, modulos: [
    { ecu: '0x7D4', nombre: 'Control de estabilidad (ESC)', confianza: 'baja', fuente: 'deducción' },
  ] };
  await M.bautizarModulosConIA(s, () => {});
  ok('una confianza BAJA se ve en este escaneo…',
     s.por_modulo.find(m => m.ecu === 0x7D4).nombre === 'Control de estabilidad (ESC)');
  ok('…pero no se guarda para todo el modelo', ctx.guardados.length === 0);

  /* Un sistema que la base no acepta cae en 'otro' en vez de reventar con
     23514 — la tabla tiene un CHECK con la lista cerrada. */
  s = nuevoEscaneo();
  ctx.guardados.length = 0;
  ctx.respuestaIA = { ok: true, modulos: [
    { ecu: '0x7D4', nombre: 'Módulo de portón eléctrico', sistema: 'porton',
      confianza: 'alta', fuente: 'manual' },
  ] };
  await M.bautizarModulosConIA(s, () => {});
  ok('un sistema fuera del catálogo se guarda como "otro", no rompe el CHECK',
     ctx.guardados[0].sistema === 'otro');

  /* Si la IA no contesta, el escaneo sigue: identificar es un extra, no un
     requisito para ver los códigos. */
  s = nuevoEscaneo();
  ctx.respuestaIA = { ok: false, error: 'sin conexión' };
  ok('si la IA falla, devuelve 0 y no revienta',
     (await M.bautizarModulosConIA(s, () => {})) === 0);
  ok('y los módulos quedan como estaban',
     s.por_modulo.find(m => m.ecu === 0x7B3).nombre === 'Módulo 0x7B3');

  /* ── El escaneo no se pierde ────────────────────────────────────────── */
  const fuente = leer('js/modulos/operacion/diagnostico_obd.js');
  ok('el modal del escaneo ya NO lleva el reporte adentro (era lo que lo hacía desaparecer)',
     !/id="obd-result"[\s\S]{0,400}obd-btn-scan/.test(fuente));
  ok('el reporte vive en la página del escaneo activo',
     /_scan\)[\s\S]*?id="obd-result"/.test(fuente));

  M._scan = { vehiculo_id: 'v1', por_modulo: [], dtcs: [] };   // sin id = sin guardar
  ctx.respuestaConfirmar = false;
  ctx.toasts.length = 0;
  await M.cerrarScanActivo();
  ok('salir de un escaneo SIN GUARDAR pregunta antes, y si se cancela no se pierde',
     M._scan !== null);
  ctx.respuestaConfirmar = true;
  await M.cerrarScanActivo();
  ok('y si se confirma, sale', M._scan === null);

  M._scan = { id: 'ya-guardado', vehiculo_id: 'v1', por_modulo: [], dtcs: [] };
  let preguntó = false;
  ctx.UI.confirmar = async () => { preguntó = true; return true; };
  await M.cerrarScanActivo();
  ok('un escaneo YA GUARDADO sale sin preguntar nada', !preguntó && M._scan === null);

  fin();
})();
