/* Piezas compartidas por todas las pruebas de navegador.

   Vive aparte para que cada suite (humo, crud, venta, permisos...) no repita el
   ingreso ni el manejo de errores: si el arranque cambia, se arregla en un
   lugar y no en siete. */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

export const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.join(AQUI, '..', '..');
export const BASE = process.env.HUMO_URL || 'http://localhost:8099';

/* Credenciales del comercio de PRUEBAS. Fuera de git a propósito. */
export function credenciales() {
  const f = path.join(AQUI, 'credenciales.json');
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

/* Ruido conocido que NO es un fallo de la pantalla. Se lista explícitamente
   para que agregar una excepción sea una decisión visible y no un filtro vago
   que después esconda un error de verdad. */
const RUIDO = [
  /favicon/i,
  /Failed to load resource.*(sw\.js|manifest)/i,
  /ServiceWorker/i,
  /Tracking Prevention/i,
  /net::ERR_INTERNET_DISCONNECTED/i,
];
export const esRuido = (t) => RUIDO.some(r => r.test(t));

/* Contador de resultados, igual que en las pruebas de texto del repo. */
export function marcador() {
  const estado = { pasadas: 0, fallidas: 0 };
  const ok = (nombre, cond, detalle) => {
    if (cond) { estado.pasadas++; console.log('PASS — ' + nombre); }
    else {
      estado.fallidas++;
      console.log('FAIL — ' + nombre);
      if (detalle) console.log('        ↳ ' + String(detalle).replace(/\s+/g, ' ').slice(0, 240));
    }
  };
  return { estado, ok };
}

/* Abre el navegador ya con sesión iniciada en el comercio de pruebas.
   `viewport` permite correr lo mismo en teléfono. */
export async function abrirSesion({ viewport = { width: 1440, height: 900 } } = {}) {
  const CRED = credenciales();
  if (!CRED) return null;

  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport });
  /* El 2FA es posponible para una cuenta sin factores. Va como script de
     inicialización —corre ANTES de cada carga— y no como un evaluate suelto:
     el servidor redirige /index.html a /, y un evaluate en medio de esa
     navegación muere con "Execution context was destroyed". */
  await contexto.addInitScript(() => {
    try { localStorage.setItem('mfa_enroll_later', 'true'); } catch (_) {}
  });
  const pagina = await contexto.newPage();

  const errores = [];
  pagina.on('console', (m) => { if (m.type() === 'error' && !esRuido(m.text())) errores.push(m.text()); });
  pagina.on('pageerror', (e) => { if (!esRuido(String(e))) errores.push('EXCEPCIÓN: ' + e.message); });
  /* Un "Failed to load resource: 403" sin decir CUÁL no sirve para nada: se
     anota la tabla o función que respondió mal, que es lo que se necesita para
     ir a mirar los permisos. */
  pagina.on('response', (r) => {
    if (r.status() < 400) return;
    const u = r.url();
    if (esRuido(u)) return;
    const corto = u.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    errores.push(`HTTP ${r.status()} en ${corto}`);
  });

  /* CON REINTENTOS. La app carga sus scripts y puede navegar sola justo
     mientras corre el signIn: eso mata el evaluate. No es un fallo de la app,
     es una carrera — y un humo que falla solo es un humo que nadie mira. */
  async function entrar() {
   try {
    await pagina.goto(BASE + '/', { waitUntil: 'load' });
    /* Si los scripts no cargaron, se reintenta: que el timeout salga como
       "reintentando" y no como una excepción que mata toda la suite. */
    await pagina.waitForFunction(() => typeof window.getSB === 'function', null, { timeout: 20000 });
    await pagina.waitForTimeout(500);

    const r = await pagina.evaluate(async (c) => {
      const x = await getSB().auth.signInWithPassword({ email: c.email, password: c.password });
      return x.error ? ('error: ' + x.error.message) : 'ok';
    }, CRED).catch((e) => 'carrera: ' + e.message.slice(0, 60));

    if (String(r).startsWith('error:')) return { ok: false, fatal: true, motivo: r };

    await pagina.waitForFunction(
      () => Object.keys(localStorage).some(k => /-auth-token$/.test(k)),
      null, { timeout: 15000 }).catch(() => {});
    await pagina.goto(BASE + '/', { waitUntil: 'load' }).catch(() => {});

    /* `App` y `POS` se declaran con const en un script clásico: existen en el
       ámbito global pero NO como propiedad de window. */
    const dentro = await pagina.waitForFunction(
      () => document.getElementById('app')?.classList.contains('visible') && typeof App !== 'undefined',
      null, { timeout: 30000 }).then(() => true).catch(() => false);
    return { ok: dentro, motivo: r };
   } catch (e) {
     return { ok: false, motivo: 'arranque: ' + e.message.slice(0, 70) };
   }
  }

  let entro = false;
  for (let i = 1; i <= 3 && !entro; i++) {
    const r = await entrar();
    entro = r.ok;
    if (!entro) console.log('reintentando el ingreso (' + r.motivo + ')');
    if (r.fatal) break;
  }
  if (!entro) { await navegador.close(); return null; }

  return { navegador, contexto, pagina, errores, CRED };
}

/* Va a un módulo y espera a que termine de cargar sus datos. */
export async function irA(pagina, modulo, { timeout = 8000 } = {}) {
  await pagina.evaluate((m) => App.navegarA(m), modulo);
  await pagina.waitForFunction(() => {
    const el = document.getElementById('page-content');
    return el && el.innerText.trim().length > 0 && !/^\s*(cargando|⏳)/i.test(el.innerText);
  }, null, { timeout }).catch(() => {});
}

/* Texto visible de la pantalla, para buscar en él. */
export const textoPantalla = (pagina) =>
  pagina.evaluate(() => document.getElementById('page-content')?.innerText || '');

/* Los modales de la app se confirman con UI.confirmar, que es un diálogo
   propio (no el del navegador): se acepta buscando su botón. */
export async function aceptarConfirmacion(pagina, textoBoton = /Eliminar|Aceptar|Sí|Confirmar/i) {
  const btn = pagina.getByRole('button', { name: textoBoton });
  if (await btn.count()) { await btn.last().click(); return true; }
  return false;
}

export function cerrar(sesion, fallidas) {
  return (async () => {
    if (fallidas && sesion?.pagina) {
      await sesion.pagina.screenshot({ path: path.join(RAIZ, 'humo-fallo.png') }).catch(() => {});
      console.log('Captura del fallo: humo-fallo.png');
    }
    await sesion?.navegador?.close?.();
  })();
}
