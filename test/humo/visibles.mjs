/* QUE LO IMPORTANTE SE VEA, Y QUE NADA LO TAPE.

   Ésta es la queja de Henry hecha prueba. Sus palabras, dos veces distintas:
     · "las categorías no se ven atrás de los productos"
     · "no aparece el puto dato total de compra"
   Las dos son lo mismo: el elemento EXISTE en la página, pero está fuera de la
   vista o hay algo encima. Ninguna prueba de texto puede detectar eso, y el
   humo tampoco — para el humo la pantalla "tiene contenido" y punto.

   Acá se pregunta lo que preguntaría una persona mirando: ¿este botón se ve?
   ¿está dentro de la pantalla? ¿hay algo tapándolo? La última se responde con
   elementFromPoint: se mira QUÉ hay en el centro del elemento; si el navegador
   devuelve otra cosa que no es él ni un hijo suyo, está tapado.

   Corre en escritorio y en TELÉFONO, que es donde de verdad se tapan las cosas. */
import { abrirSesion, marcador, cerrar, BASE, irA } from './ayuda.mjs';

const MOVIL = process.env.HUMO_MOVIL === '1';
const viewport = MOVIL ? { width: 390, height: 844 } : { width: 1440, height: 900 };
console.log(MOVIL ? 'Pantalla de TELÉFONO (390x844)' : 'Pantalla de escritorio (1440x900)');

const sesion = await abrirSesion({ viewport });
if (!sesion) { console.log('⚠️  Sin credenciales o sin poder entrar — no se prueba la visibilidad.'); process.exit(0); }
const { pagina, errores, CRED } = sesion;
const { estado, ok } = marcador();

/* ¿Se ve de verdad? No alcanza con que exista en el DOM. */
const REVISAR = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return { existe: false };
  const r = el.getBoundingClientRect();
  const est = getComputedStyle(el);
  const dentro = r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0;
  /* elementFromPoint responde qué hay ENCIMA en ese punto. Si no es el
     elemento ni un descendiente suyo, algo lo tapa. */
  const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
  const cy = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
  const arriba = document.elementFromPoint(cx, cy);
  const tapado = !!(arriba && !el.contains(arriba) && arriba !== el);
  return {
    existe: true,
    tamano: r.width > 0 && r.height > 0,
    visible: est.display !== 'none' && est.visibility !== 'hidden' && Number(est.opacity) > 0.05,
    dentro, tapado,
    quienTapa: tapado ? (arriba.id || arriba.className || arriba.tagName).toString().slice(0, 60) : null,
    caja: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
  };
};

async function debeVerse(sel, queEs) {
  const r = await pagina.evaluate(REVISAR, sel);
  if (!r.existe) { ok(`${queEs}: existe en la pantalla`, false, sel); return; }
  ok(`${queEs}: tiene tamaño`, r.tamano, JSON.stringify(r.caja));
  ok(`${queEs}: no está oculto por CSS`, r.visible);
  ok(`${queEs}: está DENTRO de la pantalla`, r.dentro, JSON.stringify(r.caja));
  ok(`${queEs}: nada lo tapa`, !r.tapado, 'lo tapa: ' + r.quienTapa);
}

try {
  /* ── EL POS: el total, el botón de cobrar y los productos ───────────── */
  await pagina.goto(BASE + '/pos.html', { waitUntil: 'load' });
  await pagina.waitForFunction(() => typeof POS !== 'undefined' && Auth?.user?.rol, null, { timeout: 25000 });
  const abrir = pagina.getByRole('button', { name: /Abrir caja/i });
  if (await abrir.count()) await abrir.first().click();
  await pagina.waitForFunction(
    () => typeof POS !== 'undefined' && (POS._prod || []).length > 0 && document.getElementById('pos-totales'),
    null, { timeout: 20000 });

  /* Con el carrito CARGADO, que es cuando el total importa y cuando el panel
     crece: vacío se veía bien y por eso el problema se escondió tanto tiempo. */
  await pagina.evaluate((codigo) => {
    const p = (POS._prod || []).find(x => x.codigo === codigo);
    POS._cart = []; POS.addToCart(p.id); POS.setCant(p.id, 3);
  }, CRED.producto || 'PRB-001');
  await pagina.waitForTimeout(600);

  /* Primero el CATÁLOGO, con el carrito cerrado: es lo que el usuario ve al
     entrar. En teléfono el carrito se desliza ENCIMA, así que revisarlo con el
     panel abierto daría "tapado" — y sería cierto, pero no un error. */
  await debeVerse('#pos-grid', 'la rejilla de productos');
  await debeVerse('#pos-busca', 'el buscador de productos');
  await debeVerse('#pos-btn-cats', 'el botón de categorías');

  /* EN TELÉFONO EL TOTAL VIVE EN LA BARRA DE ABAJO hasta que uno abre el
     carrito. Medirlo como si fuera escritorio daría un rojo falso: el diseño
     es ése a propósito. Se comprueba lo que el usuario ve de verdad. */
  if (MOVIL) {
    await debeVerse('#pos-mbar', 'la barra inferior del POS en teléfono');
    const barra = await pagina.evaluate(() => (document.getElementById('pos-mbar')?.innerText || '').replace(/\s+/g, ' '));
    ok('la barra de abajo dice cuánto cobrar', /Q\d/.test(barra), barra);
    await pagina.evaluate(() => POS.toggleCart(true));
    await pagina.waitForTimeout(500);
  }

  await debeVerse('#pos-totales', 'el bloque de totales del POS');

  /* El total tiene que estar a la vista, no sólo existir. */
  const total = await pagina.evaluate(() => {
    const nodos = [...document.querySelectorAll('#pos-totales *')]
      .filter(e => /Cobrar\s+Q/i.test(e.innerText || '') && e.children.length === 0);
    const el = nodos[0];
    if (!el) return { hay: false };
    const r = el.getBoundingClientRect();
    return { hay: true, texto: el.innerText.trim(), dentro: r.top < innerHeight && r.bottom > 0 };
  });
  ok('el botón de cobrar dice el total', total.hay && /Q\d/.test(total.texto), JSON.stringify(total));
  ok('...y está dentro de la pantalla', total.dentro !== false, JSON.stringify(total));

  /* Se cierra el carrito para revisar el catálogo como lo ve el usuario. */
  if (MOVIL) { await pagina.evaluate(() => POS.toggleCart(false)); await pagina.waitForTimeout(500); }

  /* Las categorías NO deben tapar los productos: por eso pasaron a un
     desplegable. Se abre y se comprueba que la rejilla siga visible debajo. */
  await pagina.evaluate(() => document.getElementById('pos-btn-cats')?.click());
  await pagina.waitForTimeout(400);
  await debeVerse('#pos-cats-popover', 'el desplegable de categorías');
  const rejilla = await pagina.evaluate(REVISAR, '#pos-grid');
  ok('con las categorías abiertas, la rejilla de productos sigue a la vista',
     rejilla.dentro && rejilla.tamano, JSON.stringify(rejilla.caja));

  /* ── LA APP: el menú y el contenido ─────────────────────────────────── */
  await pagina.goto(BASE + '/', { waitUntil: 'load' });
  await pagina.waitForFunction(() => typeof App !== 'undefined' && document.getElementById('page-content'),
    null, { timeout: 25000 });

  for (const mod of ['dashboard', 'inventario', 'venta_granos']) {
    await irA(pagina, mod);
    const c = await pagina.evaluate(REVISAR, '#page-content');
    ok(`${mod}: el contenido se ve`, c.existe && c.tamano && c.dentro, JSON.stringify(c.caja));
  }

  ok('revisar la visibilidad no tiró errores de JavaScript', errores.length === 0, errores[0]);
} catch (e) {
  ok('la visibilidad se pudo revisar', false, e.message);
}

console.log(`\n${estado.pasadas} pasadas, ${estado.fallidas} fallidas`);
await cerrar(sesion, estado.fallidas);
process.exit(estado.fallidas ? 1 : 0);
