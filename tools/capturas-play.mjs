/* Capturas para la ficha de Google Play.

   POR QUÉ EXISTE: las capturas de móvil se venían generando con viewport
   390x844 — que es un teléfono real, pero da una relación de aspecto de
   **2.16:1**, y Play RECHAZA las capturas de teléfono que pasen de 2:1. Se
   suben, dan error, y el error no dice "el ratio": dice "dimensiones no
   válidas", que no orienta a nadie.

   Aquí el viewport es 360x640 (9:16 exacto) con deviceScaleFactor 3, así que
   el PNG sale a 1080x1920 — nítido y con la proporción que Play espera. Ojo:
   **el ratio lo fija el VIEWPORT, no el scale**. Subir el scale no arregla un
   ratio malo: sólo produce una imagen inválida más grande.

   Lo que se aprendió sacando la primera tanda, y que esto ya evita:
     · El POS **no es un módulo** de App.navegarA: vive en /pos.html. Pedirlo
       como módulo deja la captura en "Módulo pos cargando…" — y como eso ES
       texto, cualquier espera ingenua la da por buena y guarda una foto vacía.
     · Sin `locale`, el <input type="month"> del dashboard sale en inglés
       ("August 2026") en medio de una pantalla en español.
     · El banner de "versión de prueba (DEMO)" y el nombre de la cuenta de
       robot no pintan nada en una ficha de tienda.
   Por eso al final se verifica el CONTENIDO, no sólo las dimensiones.

   Uso:
     node tools/capturas-play.mjs                     (contra producción)
     PLAY_URL=http://127.0.0.1:8080 node tools/capturas-play.mjs
     PLAY_OUT=D:\ruta node tools/capturas-play.mjs    (por defecto: raíz del repo)
*/
import fs from 'fs';
import path from 'path';
import { abrirSesion, irA, BASE } from '../test/humo/ayuda.mjs';

const SALIDA = process.env.PLAY_OUT || 'D:\\tallerpro-enterprise';

/* Play acepta de 9:16 a 16:9, lado corto ≥320 y lado largo ≤3840. */
const RATIO_MAX = 2.0;

/* Nombre de vitrina: la cuenta de pruebas se llama "Robot" y eso saldría en el
   saludo del panel. Es un dato de demostración, no una función inventada. */
const NOMBRE_VITRINA = 'Carlos';

/* El comercio de pruebas se llama "PRUEBAS (automatizadas)" y su catálogo es
   "Producto de prueba A/B". Funciona igual, pero en una ficha de tienda se lee
   como una app a medio hacer. Se sustituye el TEXTO por datos de demostración
   creíbles — nada más: precios, totales y comportamiento son los reales, y las
   capturas se toman de la app funcionando de verdad. */
const VITRINA = {
  'PRUEBAS (automatizadas)': 'Taller y Agroservicio El Progreso',
  'PRUEBAS (AUTOMATIZADAS)': 'TALLER Y AGROSERVICIO EL PROGRESO',
  'Caja de pruebas': 'Caja 1',
  'Producto de prueba A': 'Aceite 15W-40 · galón',
  'Producto de prueba B': 'Filtro de aceite',
  'Maíz de prueba': 'Maíz blanco · quintal',
  'PRB-001': 'ACE-015',
  'PRB-002': 'FIL-020',
  'PRB-003': 'MAI-001',
  'Robot': NOMBRE_VITRINA,
};

const PANTALLAS = [
  { id: 'dashboard',    modulo: 'dashboard',    titulo: 'Panel del negocio' },
  { id: 'pos',          url: '/pos.html',       titulo: 'Punto de venta' },
  { id: 'ordenes',      modulo: 'ordenes',      titulo: 'Órdenes de trabajo' },
  { id: 'clientes',     modulo: 'clientes',     titulo: 'Clientes' },
  { id: 'inventario',   modulo: 'inventario',   titulo: 'Inventario' },
  { id: 'facturacion',  modulo: 'facturacion',  titulo: 'Facturación FEL' },
  { id: 'vehiculos',    modulo: 'vehiculos',    titulo: 'Vehículos' },
  { id: 'contabilidad', modulo: 'contabilidad', titulo: 'Contabilidad y SAT' },
];

/* Sin capturas de tablet, la ficha no dice "optimizada para tablets".
   16:10 entra de sobra en el rango permitido. */
const TABLETS = [
  { id: 'tablet7',  viewport: { width: 600,  height: 960 }, escala: 2, pantallas: ['dashboard', 'clientes'] },
  { id: 'tablet10', viewport: { width: 1280, height: 800 }, escala: 2, pantallas: ['dashboard', 'pos'] },
];

/* Deja la pantalla presentable: sin modales encima, sin el aviso de "hay
   versión nueva", sin el banner de suscripción y con un nombre de vitrina. */
async function despejar(pagina) {
  await pagina.evaluate((vitrina) => {
    try {
      localStorage.setItem('np_android_aviso', JSON.stringify({ vc: 99999, modo: 'instalar', hasta: '2099-01-01' }));
      if (typeof UI !== 'undefined') UI.cerrarModal();
      document.getElementById('sidebar')?.classList.remove('abierto');
      document.getElementById('sidebar-overlay')?.classList.remove('visible');
      /* El aviso de prueba/suscripción es un estado de la cuenta, no el producto */
      for (const el of document.querySelectorAll('.alert, .card')) {
        if (/versión de prueba \(DEMO\)|Activa tu plan|suscripción vence/i.test(el.innerText || '')) el.remove();
      }
      /* Sustitución de vitrina, sólo sobre nodos de TEXTO: así no se toca el
         marcado ni los valores calculados, únicamente lo que se lee. */
      const paseo = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodos = [];
      while (paseo.nextNode()) nodos.push(paseo.currentNode);
      for (const n of nodos) {
        let t = n.nodeValue;
        if (!t || !t.trim()) continue;
        for (const [de, a] of Object.entries(vitrina)) if (t.includes(de)) t = t.split(de).join(a);
        if (t !== n.nodeValue) n.nodeValue = t;
      }
      for (const inp of document.querySelectorAll('input[placeholder], input[value]')) {
        for (const [de, a] of Object.entries(vitrina)) {
          if (inp.placeholder?.includes(de)) inp.placeholder = inp.placeholder.split(de).join(a);
          if (inp.value?.includes(de)) inp.value = inp.value.split(de).join(a);
        }
      }
    } catch (_) {}
  }, VITRINA);
}

/* Un POS con el carrito vacío no enseña nada. Se tocan dos productos DE VERDAD
   —clics reales— para que el total que sale en la foto sea el que calcula la
   app, no un número escrito a mano. */
async function llenarCarrito(pagina) {
  try {
    const tarjetas = pagina.locator('.pos-producto, .producto-card, [onclick*="agregar"]');
    const n = await tarjetas.count();
    for (let i = 0; i < Math.min(2, n); i++) {
      await tarjetas.nth(i).click({ timeout: 3000 }).catch(() => {});
      await pagina.waitForTimeout(350);
    }
  } catch (_) { /* si el catálogo cambia de clases, la foto sale con el carrito vacío */ }
}

/* Espera de verdad: que la pantalla tenga contenido Y no siga diciendo
   "cargando". Sin la segunda mitad se guardan fotos del spinner. */
async function esperarContenido(pagina) {
  await pagina.waitForFunction(() => {
    const el = document.getElementById('page-content') || document.body;
    const t = (el.innerText || '').trim();
    return t.length > 60 && !/cargando|⏳/i.test(t.slice(0, 400));
  }, null, { timeout: 20000 });
}

async function tanda({ etiqueta, viewport, escala, esMovil, lista, nombre }) {
  console.log(`\n${etiqueta} — ${viewport.width * escala}x${viewport.height * escala}`);
  const s = await abrirSesion({
    viewport,
    deviceScaleFactor: escala,
    isMobile: esMovil,
    hasTouch: esMovil,
    /* Sin esto el selector de mes sale en inglés dentro de una app en español */
    locale: 'es-GT',
    timezoneId: 'America/Guatemala',
  });
  if (!s) throw new Error('no se pudo iniciar sesión (¿falta test/humo/credenciales.json?)');
  const { pagina, navegador } = s;

  /* El nombre de vitrina debe estar puesto ANTES de que el panel se dibuje */
  await pagina.evaluate((n) => { try { if (Auth?.user) Auth.user.nombre = n; } catch (_) {} }, NOMBRE_VITRINA);

  const hechas = [];
  for (const p of lista) {
    if (p.url) await pagina.goto(BASE + p.url, { waitUntil: 'load' });
    else await irA(pagina, p.modulo, { timeout: 15000 });
    await esperarContenido(pagina);
    if (p.id === 'pos') await llenarCarrito(pagina);
    /* Despejar va JUSTO ANTES de la foto, no antes de la espera: el panel se
       vuelve a pintar cuando llegan sus datos y reponía el banner de DEMO que
       se acababa de quitar. Se limpia lo último y se dispara enseguida. */
    await pagina.waitForTimeout(800);
    await despejar(pagina);
    await pagina.waitForTimeout(200);
    const destino = path.join(SALIDA, nombre(p));
    await pagina.screenshot({ path: destino });
    /* Se guarda el texto visible para poder auditar la foto sin abrirla */
    const texto = await pagina.evaluate(() => (document.getElementById('page-content') || document.body).innerText.trim());
    hechas.push({ archivo: destino, titulo: p.titulo, texto });
    console.log('  ✓ ' + path.basename(destino) + '  (' + p.titulo + ')');
    if (p.url) await pagina.goto(BASE + '/', { waitUntil: 'load' }).then(() => esperarContenido(pagina)).catch(() => {});
  }
  await navegador.close();
  return hechas;
}

const generadas = [];

/* ── TELÉFONO: 360x640 @3x = 1080x1920 (9:16 exacto) ───────────────────── */
generadas.push(...await tanda({
  etiqueta: 'TELÉFONO',
  viewport: { width: 360, height: 640 },
  escala: 3,
  esMovil: true,
  lista: PANTALLAS,
  nombre: (p) => `play-movil-${String(PANTALLAS.indexOf(p) + 1).padStart(2, '0')}-${p.id}.png`,
}));

/* ── TABLETS ───────────────────────────────────────────────────────────── */
for (const t of TABLETS) {
  generadas.push(...await tanda({
    etiqueta: 'TABLET ' + t.id.replace('tablet', '') + '"',
    viewport: t.viewport,
    escala: t.escala,
    esMovil: false,
    lista: PANTALLAS.filter(p => t.pantallas.includes(p.id)),
    nombre: (p) => `play-${t.id}-${p.id}.png`,
  }));
}

/* ── Verificar lo generado, en vez de suponerlo ─────────────────────────── */
console.log('\n─── verificación ───');
let malas = 0;
for (const g of generadas) {
  const b = fs.readFileSync(g.archivo);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);   // cabecera PNG (big-endian)
  const ratio = Math.max(w, h) / Math.min(w, h);
  const problemas = [];
  if (ratio > RATIO_MAX + 0.001) problemas.push(`ratio ${ratio.toFixed(2)}>2`);
  if (Math.min(w, h) < 320 || Math.max(w, h) > 3840) problemas.push('tamaño fuera de rango');
  if (/cargando|⏳/i.test(g.texto.slice(0, 400))) problemas.push('PANTALLA VACÍA (cargando)');
  if (/versión de prueba \(DEMO\)/i.test(g.texto)) problemas.push('banner DEMO visible');
  /* Que no se escape a la tienda el andamiaje del comercio de pruebas */
  if (/PRUEBAS \(automatizadas\)|Producto de prueba|Caja de pruebas|PRB-\d/i.test(g.texto))
    problemas.push('datos del comercio de pruebas a la vista');
  if (/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(g.texto))
    problemas.push('fecha en inglés');
  if (g.texto.length < 60) problemas.push('casi sin contenido');
  if (problemas.length) malas++;
  console.log(`${problemas.length ? 'MAL ' : 'OK  '} ${path.basename(g.archivo).padEnd(32)} ${w}x${h} ratio ${ratio.toFixed(3)}` +
              (problemas.length ? '  ← ' + problemas.join(', ') : ''));
}
console.log(`\n${generadas.length} imágenes en ${SALIDA} · ${malas} con problemas`);
if (malas) process.exitCode = 1;
