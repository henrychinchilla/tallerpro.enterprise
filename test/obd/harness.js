/* Banco de pruebas del módulo de diagnóstico OBD.

   El módulo se valida contra vehículos reales, y eso es lento y caro: hay que
   tener el carro enchufado. Estas pruebas no reemplazan esa validación —
   ninguna toca un bus de verdad — pero sí atajan lo que sí se puede atajar en
   segundos: parsers que corren los bytes medio lugar, direccionamientos que se
   arman mal, estados que se afirman sin haberlos leído.

   Cómo funciona: se carga el módulo tal cual en un sandbox de `vm`, con las
   dependencias del navegador (UI, DB, navigator, document) reemplazadas por
   dobles. No hay build ni framework a propósito — el proyecto no tiene uno y
   agregarlo por las pruebas sería peor el remedio.

   Correr todo:      npm test
   Correr una sola:  node test/obd/kwp2000.js      (desde la raíz del repo) */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

/* El módulo se dividió en partes el 2026-09-22 (el archivo único pasaba de
   9.000 líneas). Mismo orden que index.html: el núcleo define el objeto y cada
   parte le agrega sus métodos. */
const PARTES_OBD = ['diagnostico_obd.js', 'diagnostico_obd_lecturas.js', 'diagnostico_obd_uds.js',
  'diagnostico_obd_barrido.js', 'diagnostico_obd_camiones.js', 'diagnostico_obd_catalogo.js',
  'diagnostico_obd_escaneo.js', 'diagnostico_obd_monitor.js', 'diagnostico_obd_acciones.js'];
const DIR_OBD = path.join(__dirname, '..', '..', 'js', 'modulos', 'operacion');

/* Todo el código del módulo, en orden de carga. Sirve para ejecutarlo en un
   sandbox y para las pruebas que buscan algo en el texto de la fuente. */
function fuenteOBD() {
  return PARTES_OBD.map(p => fs.readFileSync(path.join(DIR_OBD, p), 'utf8')).join('\n;\n');
}

/* Carga el módulo en un sandbox nuevo. `extra` reemplaza o agrega globales.
   Los dobles cubren lo que el módulo usa en el navegador; cada prueba redefine
   encima sólo lo que le importa (ctx.DB.getX = ..., M._cmd = ..., etc.). */
function cargar(extra = {}) {
  const ctx = {
    Modulos: {}, console, setTimeout, clearTimeout, Date, JSON, Math,
    UI: {
      esc: s => String(s == null ? '' : s),
      fecha: d => new Date(d).toISOString().slice(0, 10),
      toast: (m, t) => { ctx.toasts.push((t || 'ok') + ':' + m); },
      modal: () => {}, cerrarModal: () => {}, confirmar: async () => true,
    },
    DB: {
      getDTCCatalogo: async () => null,
      getDiagnosticosPorVehiculo: async () => [],
      getDiagnosticosPorModelo: async () => [],
      getMapasVehiculos: async () => [],
      upsertDiagnosticoOBD: async () => ({ error: null }),
    },
    navigator: { clipboard: { writeText: async t => { ctx.copiado = t; } } },
    document: { getElementById: () => null, querySelector: () => null },
    window: {},
    toasts: [], copiado: null,
  };
  Object.assign(ctx, extra);
  vm.createContext(ctx);
  vm.runInContext(fuenteOBD(), ctx);
  return { M: ctx.Modulos.diagnostico_obd, ctx };
}

let pasadas = 0, fallidas = 0;

function ok(nombre, condicion) {
  if (condicion) { pasadas++; console.log('PASS — ' + nombre); }
  else { fallidas++; console.log('FAIL — ' + nombre); }
}

/* Se llama al final de cada archivo. El código de salida es lo que mira el
   runner: sin esto una prueba fallida se vería en pantalla pero el proceso
   saldría en 0 y nadie se enteraría. */
function fin() {
  console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
  if (fallidas) process.exitCode = 1;
}

/* Una promesa que revienta el proceso en vez de quedarse colgada en silencio:
   un await sin resolver dentro de una prueba async no falla, simplemente no
   imprime nada, y el archivo "pasa". */
process.on('unhandledRejection', e => {
  console.log('FAIL — excepción no atrapada: ' + (e && e.message ? e.message : e));
  process.exit(1);
});

module.exports = { cargar, ok, fin, fuenteOBD, PARTES_OBD };
