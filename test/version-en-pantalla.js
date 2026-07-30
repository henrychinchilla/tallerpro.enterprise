/* La versión que se muestra bajo NEXUSPRO.

   Sirve para una sola cosa: saber si un cambio ya llegó a producción. Por eso
   el riesgo no es que no aparezca — es que aparezca un número EQUIVOCADO. Un
   "v4.19.0" mostrado cuando en realidad corre el SW viejo haría dar por
   desplegado algo que no lo está, que es justo la duda que esto viene a matar.

   De ahí que se pruebe sobre todo el caso feo: el Service Worker que no
   contesta. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const RUTA = path.join(__dirname, '..', 'js', 'core', 'config.js');

/* Doble del MessageChannel del navegador: port2.postMessage entrega en
   port1.onmessage, que es exactamente el camino que usa el código. */
function CanalFalso() {
  const p1 = { onmessage: null };
  this.port1 = p1;
  this.port2 = { postMessage: d => { if (p1.onmessage) p1.onmessage({ data: d }); } };
}

/* `contesta` decide si el SW responde el mensaje 'version'. Un SW anterior a
   este cambio simplemente lo ignora. */
function cargar({ haySW = true, contesta = 'v9.9.9-prueba', nodos = 1 } = {}) {
  const elementos = [];
  for (let i = 0; i < nodos; i++) elementos.push({ textContent: '', title: '' });

  const sw = {
    recibidos: [],
    postMessage(msg, ports) {
      this.recibidos.push(msg);
      if (msg === 'version' && contesta && ports && ports[0])
        ports[0].postMessage({ version: contesta });
    },
  };

  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date,
    MessageChannel: CanalFalso,
    navigator: haySW ? { serviceWorker: { ready: Promise.resolve({ active: sw }), controller: sw } } : {},
    document: { querySelectorAll: sel => (sel === '.app-version' ? elementos : []) },
    window: {},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(RUTA, 'utf8'), ctx);
  return { ctx, elementos, sw };
}

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

process.on('unhandledRejection', e => {
  console.log('FAIL — excepción no atrapada: ' + (e && e.message ? e.message : e));
  process.exit(1);
});

(async () => {
  /* ── El caso normal ─────────────────────────────────────────────────────── */
  {
    const { ctx, elementos, sw } = cargar();
    const v = await ctx.cargarVersion();
    ok('devuelve la versión que dijo el Service Worker', v === 'v9.9.9-prueba');
    ok('le pregunta al SW, no a una constante del bundle', sw.recibidos.includes('version'));
    ok('la pinta en pantalla', elementos[0].textContent === 'v9.9.9-prueba');
    ok('deja una explicación al pasar el mouse', /recarg/i.test(elementos[0].title));
  }

  /* ── El caso feo: el SW viejo no sabe contestar ──────────────────────────── */
  {
    const { ctx, elementos } = cargar({ contesta: null });
    const t0 = Date.now();
    const v = await ctx.cargarVersion();
    ok('sin respuesta del SW devuelve null', v === null);
    ok('NO inventa un número: deja el hueco vacío', elementos[0].textContent === '');
    /* Lo importante no es el número exacto sino que corte: sin el plazo, el
       await se cuelga para siempre y con él quien lo esperaba. */
    ok('corta por plazo en vez de colgarse', Date.now() - t0 >= 1900 && Date.now() - t0 < 6000);
  }

  /* ── Nunca muestra la versión vieja de APP ───────────────────────────────── */
  {
    const { ctx, elementos } = cargar({ contesta: null });
    await ctx.cargarVersion();
    /* `const APP` no se cuelga del objeto del contexto (sólo lo hacen `var` y
       las funciones), así que se lee evaluando dentro del sandbox. */
    const versionVieja = vm.runInContext('APP.version', ctx);
    ok('el APP.version del bundle sigue existiendo y está viejo', versionVieja === '3.2.0');
    ok('pero NO se usa como respaldo cuando el SW calla',
       elementos[0].textContent === '' && elementos[0].textContent !== versionVieja);
  }

  /* ── Navegador sin Service Worker (http, navegador viejo) ────────────────── */
  {
    const { ctx, elementos } = cargar({ haySW: false });
    let reventó = false;
    try { await ctx.cargarVersion(); } catch (_) { reventó = true; }
    ok('sin Service Worker no revienta', !reventó);
    ok('sin Service Worker no muestra nada', elementos[0].textContent === '');
  }

  /* ── Pinta TODOS los huecos: el logo del login y el del menú ─────────────── */
  {
    const { ctx, elementos } = cargar({ nodos: 3 });
    await ctx.cargarVersion();
    ok('rellena los huecos de las dos pantallas', elementos.every(e => e.textContent === 'v9.9.9-prueba'));
    /* El login y el menú se redibujan enteros y se llevan el texto; volver a
       pintarlo tiene que funcionar sin preguntarle otra vez al SW. */
    for (const e of elementos) e.textContent = '';
    ctx.pintarVersion();
    ok('repinta tras un render sin volver a preguntar', elementos.every(e => e.textContent === 'v9.9.9-prueba'));
  }

  console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
  if (fallidas) process.exitCode = 1;
})();
