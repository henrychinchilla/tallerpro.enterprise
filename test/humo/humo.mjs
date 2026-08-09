/* HUMO: abre CADA módulo en un navegador de verdad y falla si algo revienta.
   ═══════════════════════════════════════════════════════════════════════════

   POR QUÉ EXISTE. Todas las demás pruebas de este repo leen el código como
   TEXTO y le aplican expresiones regulares: nunca ejecutan una pantalla. Por
   eso podían decir "todo verde" mientras el POS no mostraba el total. Los
   últimos tres bugs que llegaron al usuario fueron exactamente eso:

     · UI.numero(...)        — la lista de granos moría al pintar la 1ª fila
     · UI.escUI.jsAttr(...)  — la pantalla de fórmulas reventaba entera
     · this._montosRapidos() — el POS dejaba de mostrar el TOTAL al agregar el
                               primer producto (con el carrito vacío se veía
                               bien, por eso costó tanto verlo)

   Ninguno es un error de sintaxis: `node --check` los da por buenos. Sólo
   aparecen al EJECUTAR. Esta prueba ejecuta.

   QUÉ VERIFICA en cada módulo:
     1. que no salte ningún error de JavaScript,
     2. que la pantalla no quede vacía,
     3. que no se cuele "undefined", "NaN" ni "[object Object]" en el texto
        visible — eso delata una cuenta o una plantilla rota.
   Y en el POS, además, LA MATEMÁTICA: agrega producto, cambia cantidad y
   comprueba que el total mostrado sea el número correcto.

   CÓMO SE USA:  npm run humo        (arranca el servidor local solo)
   Corre contra un comercio de PRUEBAS con su propio usuario y productos, así
   que jamás toca datos reales. Las credenciales van en test/humo/credenciales.json
   (fuera de git). Si el archivo no está, la prueba lo dice y no falla el deploy.
═══════════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(aqui, '..', '..');
const BASE = process.env.HUMO_URL || 'http://localhost:8099';

const credFile = path.join(aqui, 'credenciales.json');
if (!fs.existsSync(credFile)) {
  console.log('⚠️  Falta test/humo/credenciales.json — el humo no corre.');
  console.log('   (Es el usuario del comercio de PRUEBAS; no va a git a propósito.)');
  process.exit(0);
}
const CRED = JSON.parse(fs.readFileSync(credFile, 'utf8'));

/* Los módulos que se abren. Es la lista de MODULOS de config.js menos los
   encabezados de grupo (no son pantallas) y mi_ot (es el portal del cliente,
   con su propio login). */
const MODULOS = [
  'dashboard', 'clientes', 'vehiculos', 'diagnostico_obd', 'bitacora', 'ordenes',
  'cotizaciones', 'inventario', 'bodegas', 'proveedores', 'activos', 'envios',
  'herreria', 'peleteria', 'electronica', 'refrigeracion', 'armeria',
  'agroservicio', 'venta_granos', 'facturacion', 'bancos', 'finanzas',
  'presupuesto', 'contabilidad', 'rrhh', 'marketing', 'calendario',
  'comunicaciones', 'configuracion', 'usuarios', 'admin', 'respaldos', 'descarga',
];

/* Ruido conocido que NO es un fallo de la pantalla: recursos externos que el
   entorno local no tiene y avisos del navegador. Se lista explícitamente para
   que agregar una excepción sea una decisión visible y no un filtro vago. */
const RUIDO = [
  /favicon/i,
  /Failed to load resource.*(sw\.js|manifest)/i,
  /ServiceWorker/i,
  /Tracking Prevention/i,
  /net::ERR_INTERNET_DISCONNECTED/i,
];
const esRuido = (t) => RUIDO.some(r => r.test(t));

const fallos = [];
const anotar = (modulo, motivo, detalle) => {
  fallos.push({ modulo, motivo, detalle });
  console.log(`FAIL — ${modulo}: ${motivo}`);
  if (detalle) console.log('        ↳ ' + String(detalle).replace(/\s+/g, ' ').slice(0, 220));
};

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
/* El 2FA es posponible para una cuenta sin factores. La marca se pone con un
   script de inicialización —corre ANTES de cada carga— en vez de con un
   evaluate suelto: el servidor redirige /index.html a /, y un evaluate en medio
   de esa navegación muere con "Execution context was destroyed". */
await contexto.addInitScript(() => {
  try { localStorage.setItem('mfa_enroll_later', 'true'); } catch (_) {}
});
const pagina = await contexto.newPage();

let errores = [];
pagina.on('console', (m) => { if (m.type() === 'error' && !esRuido(m.text())) errores.push(m.text()); });
pagina.on('pageerror', (e) => { if (!esRuido(String(e))) errores.push('EXCEPCIÓN: ' + e.message); });

/* ── Entrar ─────────────────────────────────────────────────────────────── */
await pagina.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await pagina.waitForFunction(() => typeof window.getSB === 'function', null, { timeout: 20000 });

/* La app NO entra sola al iniciar sesión: lee la sesión cuando CARGA la
   página. Así que se firma, se le da un instante para que el token quede
   guardado en localStorage, y recién ahí se recarga. Hacer el goto antes de
   eso corría una carrera y terminaba en "Execution context was destroyed". */
const rLogin = await pagina.evaluate(async (c) => {
  const r = await getSB().auth.signInWithPassword({ email: c.email, password: c.password });
  return r.error ? ('error: ' + r.error.message) : ('ok, token=' + Object.keys(localStorage).filter(k=>/auth-token/.test(k)).length);
}, CRED).catch((e) => 'excepcion: ' + e.message.slice(0, 80));
console.log('login -> ' + rLogin);
await pagina.waitForFunction(
  () => Object.keys(localStorage).some(k => /-auth-token$/.test(k)),
  null, { timeout: 15000 }).catch(() => {});
await pagina.goto(BASE + '/', { waitUntil: 'domcontentloaded' }).catch(() => {});

const entro = await pagina.waitForFunction(
  /* `App` y `POS` se declaran con const en un script clásico: existen en el
     ámbito global del documento pero NO como propiedad de window. Preguntar
     por window.App da undefined aunque la app esté corriendo. */
  () => document.getElementById('app')?.classList.contains('visible') && typeof App !== 'undefined',
  null, { timeout: 30000 }).then(() => true).catch(() => false);

if (!entro) {
  const diag = await pagina.evaluate(() => ({
    url: location.href,
    token: Object.keys(localStorage).filter(k => /auth-token/.test(k)),
    appVisible: document.getElementById('app')?.className,
    hayApp: typeof App,
    vistaLogin: document.getElementById('login-screen')?.style.display,
    texto: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
  })).catch(e => ({ err: e.message }));
  console.log('DIAGNÓSTICO: ' + JSON.stringify(diag));
}

if (!entro) {
  console.log('FAIL — no se pudo entrar con el usuario de pruebas');
  await pagina.screenshot({ path: path.join(RAIZ, 'humo-fallo.png') }).catch(() => {});
  await navegador.close();
  process.exit(1);
}
console.log('Sesión iniciada.');

/* ── Cada módulo ────────────────────────────────────────────────────────── */
for (const mod of MODULOS) {
  errores = [];
  try {
    await pagina.evaluate((m) => App.navegarA(m), mod);
    /* Los módulos cargan datos: se espera a que el "cargando" se vaya o a que
       haya contenido. 4 s es de sobra contra una base real. */
    await pagina.waitForFunction(() => {
      const el = document.getElementById('page-content');
      return el && el.innerText.trim().length > 0 && !/^\s*(cargando|⏳)/i.test(el.innerText);
    }, null, { timeout: 6000 }).catch(() => {});

    const info = await pagina.evaluate(() => {
      const el = document.getElementById('page-content');
      const txt = el ? el.innerText : '';
      return { largo: txt.trim().length, texto: txt.slice(0, 4000) };
    });

    if (errores.length) anotar(mod, 'error de JavaScript al abrir', errores[0]);
    else if (info.largo === 0) anotar(mod, 'la pantalla quedó VACÍA');
    else {
      const sucio = /\bundefined\b|\bNaN\b|\[object Object\]/.exec(info.texto);
      if (sucio) anotar(mod, `muestra "${sucio[0]}" en pantalla`, info.texto.slice(Math.max(0, sucio.index - 60), sucio.index + 60));
      else console.log(`PASS — ${mod}`);
    }
  } catch (e) {
    anotar(mod, 'no se pudo abrir', e.message);
  }
}

/* ── EL POS Y SU MATEMÁTICA ─────────────────────────────────────────────── */
{
  errores = [];
  const mod = 'pos (total y cambio)';
  try {
    await pagina.goto(BASE + '/pos.html', { waitUntil: 'domcontentloaded' });
    await pagina.waitForFunction(() => typeof POS !== 'undefined', null, { timeout: 20000 }).catch(() => {});
    /* Si pide abrir caja, se abre: es parte del camino real del cajero. */
    const abrir = pagina.getByRole('button', { name: /Abrir caja/i });
    if (await abrir.count()) { await abrir.first().click(); }
    /* El catálogo se carga DESPUÉS de abrir la caja: esperar a que haya
       productos, no un tiempo fijo (un tiempo fijo falla el día que la base
       tarda un segundo más). */
    await pagina.waitForFunction(
      () => typeof POS !== 'undefined' && (POS._prod || []).length > 0 && document.getElementById('pos-totales'),
      null, { timeout: 20000 }).catch(() => {});

    const r = await pagina.evaluate((codigo) => {
      const p = (POS._prod || []).find(x => x.codigo === codigo);
      if (!p) return { error: 'el producto de prueba no está en el inventario' };
      POS._cart = [];
      POS.addToCart(p.id);
      POS.setCant(p.id, 3);
      const tot = document.getElementById('pos-totales');
      return {
        precio: Number(p.precio_venta),
        total: POS._totales().total,
        enPantalla: tot ? tot.innerText.replace(/\s+/g, ' ') : '',
      };
    }, CRED.producto || 'PRB-001');

    if (r.error) anotar(mod, r.error);
    else if (errores.length) anotar(mod, 'error de JavaScript al cobrar', errores[0]);
    else {
      const esperado = +(r.precio * 3).toFixed(2);
      const enPantalla = r.enPantalla.includes(`Q${esperado.toFixed(2)}`);
      if (Math.abs(r.total - esperado) > 0.001) anotar(mod, `la cuenta da mal: ${r.total} y debería dar ${esperado}`);
      else if (!enPantalla) anotar(mod, `el total NO aparece en pantalla (se esperaba Q${esperado.toFixed(2)})`, r.enPantalla);
      else console.log(`PASS — ${mod}: 3 x Q${r.precio} = Q${esperado.toFixed(2)} en pantalla`);
    }
  } catch (e) {
    anotar(mod, 'no se pudo probar el cobro', e.message);
  }
}

/* ── Resultado ──────────────────────────────────────────────────────────── */
if (fallos.length) {
  const shot = path.join(RAIZ, 'humo-fallo.png');
  await pagina.screenshot({ path: shot }).catch(() => {});
  console.log(`\n${fallos.length} pantalla(s) con problema. Captura: humo-fallo.png`);
} else {
  console.log(`\n${MODULOS.length + 1} pantallas abiertas, ninguna rota.`);
}
await navegador.close();
process.exit(fallos.length ? 1 : 0);
