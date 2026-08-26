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
export const BASE = process.env.HUMO_URL || 'http://127.0.0.1:8199';

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
export async function abrirSesion({ viewport = { width: 1440, height: 900 }, ...opcionesContexto } = {}) {
  const CRED = credenciales();
  if (!CRED) return null;

  /* En español, como el usuario real. No es cosmético: los controles NATIVOS
     del navegador (el <input type="month"> del panel, por ejemplo) se pintan en
     el idioma de la INTERFAZ de Chromium — no en el `locale` del contexto, que
     sólo cambia navigator.language e Intl. Sin esto el selector de mes sale
     "August 2026" en mitad de una pantalla en español, y así salió en la
     primera tanda de capturas para Play. */
  const navegador = await chromium.launch({ args: ['--lang=es-GT'] });
  /* Lo que venga de más (deviceScaleFactor, isMobile, hasTouch...) pasa tal
     cual al contexto: las capturas de la ficha de Play necesitan un teléfono
     de verdad y a 3x, y no vale la pena tener un segundo login copiado — el
     de aquí ya sabe posponer el 2FA y reintentar la carrera del arranque. */
  const contexto = await navegador.newContext({ viewport, ...opcionesContexto });
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
/* OJO con la espera, que era un falso positivo de manual: sólo pedía que
   #page-content tuviera texto y no dijera "cargando". Viniendo de otra
   pantalla eso YA se cumple con el contenido VIEJO, así que la espera
   terminaba en el primer intento y la prueba leía la pantalla ANTERIOR
   creyendo estar en la nueva. Se notaba únicamente con módulos lentos: el
   2026-08-26 tumbó un despliegue con "la pantalla de Descargas muestra la
   versión publicada" enseñando el Dashboard, porque Descargas pide
   app-version.json y pesa el APK por red — varios segundos.

   Lo que sirve es esperar a que el contenido CAMBIE. No se compara contra
   App.paginaActual: desde page.evaluate ese valor no refleja la navegación
   (se comprobó que sigue en null tras navegar), así que condicionarlo a eso
   deja la espera colgada hasta el timeout. */
export async function irA(pagina, modulo, { timeout = 12000 } = {}) {
  const leer = () => pagina.evaluate(() =>
    document.getElementById('page-content')?.innerText.trim() || '');

  /* Espera a que la pantalla deje de moverse: el mismo texto en dos sondeos
     seguidos. Sin esto, "el texto cambió" se cumple con las KPIs del Dashboard
     terminando de cargar — seguía siendo el Dashboard, y la navegación se daba
     por buena cuando aún no había pasado nada. */
  const asentar = (ms) => pagina.waitForFunction(() => {
    const el = document.getElementById('page-content');
    const t = el ? el.innerText.trim() : '';
    const w = window.__irA || (window.__irA = {});
    const igual = t.length > 0 && w.prev === t;
    w.prev = t;
    return igual;
  }, null, { timeout: ms, polling: 300 }).then(() => true).catch(() => false);

  const cambio = (previo, ms) => pagina.waitForFunction((p) => {
    const el = document.getElementById('page-content');
    if (!el) return false;
    const t = el.innerText.trim();
    if (!t || /^\s*(cargando|⏳)/i.test(t) || t === p) return false;
    const w = window.__irA || (window.__irA = {});
    const igual = w.prev2 === t;   // ya no se está repintando
    w.prev2 = t;
    return igual;
  }, previo, { timeout: ms, polling: 300 }).then(() => true).catch(() => false);

  await asentar(6000);
  const antes = await leer();
  await pagina.evaluate((m) => App.navegarA(m), modulo);
  if (await cambio(antes, timeout)) return;

  /* App.navegarA tiene varias salidas silenciosas (sin permiso, cambios sin
     guardar, módulo ya activo) y ademas render() es async: si no hubo cambio,
     lo mas probable es que la navegacion no surtiera efecto. Un reintento
     distingue "no navego" de "esta pantalla no muestra lo que esperabamos", que
     es lo que confundio el diagnostico del 2026-08-26. */
  await pagina.evaluate((m) => App.navegarA(m), modulo);
  if (await cambio(antes, timeout)) return;

  /* Si tras dos intentos la pantalla no cambió, el fallo se manifestaría más
     abajo como "esta pantalla no dice lo que esperaba" mostrando el contenido
     ANTERIOR — que fue exactamente lo que despistó el 2026-08-26. Se deja dicho
     aquí, con el estado que permite distinguir las salidas silenciosas de
     App.navegarA (sin sesión, sin permiso, cambios sin guardar, módulo
     inexistente). OJO: App y Modulos son globales LÉXICOS, no viven en window. */
  const porque = await pagina.evaluate((m) => ({
    paginaActual: typeof App !== 'undefined' ? App.paginaActual : 'sin App',
    haySesion   : typeof Auth !== 'undefined' && !!Auth.user,
    puedeSalir  : (() => { try { return App.puedeSalir(); } catch (e) { return 'throw:' + e.message; } })(),
    acceso      : (() => { try { return tieneAcceso(m); } catch (e) { return 'throw:' + e.message; } })(),
    hayModulo   : typeof Modulos !== 'undefined' && !!Modulos[m],
    pantalla    : (document.getElementById('page-content')?.innerText || '').slice(0, 60)
  }), modulo).catch(e => ({ error: e.message }));
  /* Llegar al módulo que YA estaba en pantalla es normal (App.navegarA sólo
     colapsa el submenú y no repinta): ahí no hay nada que avisar. */
  if (porque.paginaActual !== modulo)
    console.log(`   ⚠️  irA('${modulo}') no cambió la pantalla — ${JSON.stringify(porque)}`);
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
