/* El aviso de obligaciones SAT no puede salir en CADA refresh.

   Reportado el 2026-09-20: "me aparece siempre que hago refresh un aviso de
   Obligaciones SAT por vencer ... y no sé cómo pararlo y me tiene loco siempre
   sale". Era un IVA 2026-06 de Q0.00 marcado VENCIDA.

   El botón decía "Después" y no posponía nada: sólo cerraba el modal. Una
   obligación vencida de Q0.00 —que no hay cómo "pagar"— quedaba avisando para
   siempre y desde la pantalla no había manera de callarla.

   Lo que se cuida acá son las DOS mitades, porque arreglar sólo una es peor:
     · posponer tiene que posponer de verdad (si no, la queja sigue);
     · posponer NO puede ser enmudecer (si no, una obligación nueva y con plata
       de por medio pasa desapercibida, que es mucho peor que un aviso molesto).

   Se prueba el código real de js/core/app.js en un sandbox. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const APP_JS = path.join(__dirname, '..', 'js', 'core', 'app.js');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const hoy = new Date();
const dia = d => new Date(hoy.getTime() + d * 86400000).toISOString().slice(0, 10);

function cargar(obligaciones) {
  const datos = {};
  const modales = [];
  const localStorage = {
    getItem: k => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v); },
    removeItem: k => { delete datos[k]; },
  };
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Number, Array,
    String, Object, URLSearchParams, isNaN, parseInt, parseFloat, encodeURIComponent,
    localStorage, sessionStorage: localStorage,
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    navigator: { userAgent: 'node' },
    location: { search: '', pathname: '/', hash: '' },
    history: { replaceState: () => {} },
    document: { referrer: '', getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    Auth: { user: { rol: 'admin' }, tenant: { id: 't1' } },
    /* Como la de verdad: filtra por año (`periodo LIKE '2026%'`), así que las
       dos llamadas que hace avisoSAT —este año y el pasado— no se pisan. */
    DB: { getObligaciones: async anio => obligaciones.filter(o => String(o.periodo || '').startsWith(String(anio))) },
    UI: {
      esc: (v = '') => String(v == null ? '' : v),
      jsAttr: (v = '') => String(v == null ? '' : v).replace(/'/g, "\\'"),
      q: v => 'Q' + Number(v || 0).toFixed(2),
      fecha: d => String(d),
      modal: (titulo, cuerpo) => modales.push({ titulo, cuerpo }),
      cerrarModal: () => {},
      toast: () => {},
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(APP_JS, 'utf8') + '\n;globalThis.__App = App;', ctx);
  return { App: ctx.__App, modales, datos };
}

/* El caso de Henry: un IVA de Q0.00 que venció hace rato. */
const IVA_VIEJO = { id: 'o-iva-2026-06', tipo: 'IVA', periodo: '2026-06', estado: 'pendiente',
                    monto_calculado: 0, fecha_vencimiento: dia(-90), notas: 'SAT-2237 IVA General' };

(async () => {
  /* ── Sale una vez ─────────────────────────────────────────────────────── */
  {
    const { App, modales } = cargar([IVA_VIEJO]);
    await App.avisoSAT();
    ok('con una obligación vencida, el aviso sale', modales.length === 1);
    ok('...y la nombra', /IVA · 2026-06/.test(modales[0].cuerpo));
    ok('...y el botón ya no es un cierre pelado', /_posponerAvisoSAT/.test(modales[0].cuerpo));
    ok('...y dice cómo callarlo para siempre', /Contabilidad/.test(modales[0].cuerpo));
  }

  /* ── Y después de "Después", NO vuelve ────────────────────────────────── */
  {
    const { App, modales } = cargar([IVA_VIEJO]);
    await App.avisoSAT();
    /* Lo que hace el botón del modal. */
    App._posponerAvisoSAT('o-iva-2026-06·2026-06');
    await App.avisoSAT();          // el refresh siguiente
    await App.avisoSAT();          // y el otro
    ok('"Después" lo calla de verdad en los refresh siguientes', modales.length === 1);
  }

  /* ── Pero posponer no es enmudecer ────────────────────────────────────── */
  {
    const nueva = { id: 'o-isr-2026-09', tipo: 'ISR', periodo: '2026-09', estado: 'pendiente',
                    monto_calculado: 4500, fecha_vencimiento: dia(1), notas: 'ISR trimestral' };
    const { App, modales } = cargar([IVA_VIEJO, nueva]);
    /* Se pospuso el conjunto viejo (sólo el IVA), y ahora entró el ISR. */
    App._posponerAvisoSAT('o-iva-2026-06·2026-06');
    await App.avisoSAT();
    ok('una obligación NUEVA vuelve a avisar aunque haya posposición vigente', modales.length === 1);
    ok('...y trae la nueva', modales.length === 1 && /ISR · 2026-09/.test(modales[0].cuerpo));
  }

  /* ── Cuando vence la posposición, vuelve ──────────────────────────────── */
  {
    const { App, modales, datos } = cargar([IVA_VIEJO]);
    datos['np_sat_aviso'] = JSON.stringify({ firma: 'o-iva-2026-06·2026-06', hasta: dia(-1) });
    await App.avisoSAT();
    ok('pasados los días, el aviso vuelve (no es un "nunca más")', modales.length === 1);
  }

  /* ── Una obligación pagada no avisa ───────────────────────────────────── */
  {
    const { App, modales } = cargar([{ ...IVA_VIEJO, estado: 'pagado' }]);
    await App.avisoSAT();
    ok('marcarla pagada la calla del todo', modales.length === 0);
  }

  console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
  if (fallidas) process.exitCode = 1;
})();

process.on('unhandledRejection', e => {
  console.log('FAIL — excepción no atrapada: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
