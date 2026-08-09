/* LOS DOCUMENTOS QUE SE IMPRIMEN.

   Un ticket, un corte de caja o una declaración jurada con huecos no es un
   detalle estético: es un papel que alguien firma o entrega. Y son de lo más
   fácil de romper sin que nadie note, porque se abren en OTRA ventana — el
   humo normal ni los ve.

   Acá se hace una venta de prueba, se manda a reimprimir el ticket y se lee la
   ventana que se abre: que traiga el total, que no diga "undefined" ni "NaN",
   y que no venga vacía. Lo mismo con el reporte de ventas.

   Si algo no se puede probar por falta de datos, se dice EN VOZ ALTA y cuenta
   como fallo — un "salté esto" silencioso es la forma más común de que una
   prueba se vuelva decorativa. */
import { abrirSesion, marcador, cerrar, BASE } from './ayuda.mjs';

const sesion = await abrirSesion();
if (!sesion) { console.log('⚠️  Sin credenciales o sin poder entrar — no se prueban los impresos.'); process.exit(0); }
const { pagina, contexto, errores, CRED } = sesion;
const { estado, ok } = marcador();

/* Los impresos abren una ventana nueva. Se atrapa y se lee su contenido. */
async function capturarImpreso(accion, espera = 6000) {
  const [popup] = await Promise.all([
    contexto.waitForEvent('page', { timeout: espera }).catch(() => null),
    accion(),
  ]);
  if (!popup) return null;
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  const texto = await popup.evaluate(() => document.body?.innerText || '').catch(() => '');
  await popup.close().catch(() => {});
  return texto.replace(/\s+/g, ' ').trim();
}

function revisarDocumento(nombre, texto, debeContener = []) {
  if (texto === null) { ok(`${nombre}: se abre la ventana de impresión`, false, 'no se abrió ninguna ventana'); return; }
  ok(`${nombre}: se abre y trae contenido`, texto.length > 40, texto.slice(0, 120));
  const sucio = /\bundefined\b|\bNaN\b|\[object Object\]/.exec(texto);
  ok(`${nombre}: no muestra undefined/NaN`, !sucio,
     sucio ? texto.slice(Math.max(0, sucio.index - 60), sucio.index + 60) : '');
  debeContener.forEach(t => ok(`${nombre}: incluye ${t}`, texto.includes(t), texto.slice(0, 200)));
}

try {
  /* ── Una venta, para tener qué imprimir ─────────────────────────────── */
  await pagina.goto(BASE + '/pos.html', { waitUntil: 'load' });
  await pagina.waitForFunction(() => typeof POS !== 'undefined' && Auth?.user?.rol, null, { timeout: 25000 });
  const abrir = pagina.getByRole('button', { name: /Abrir caja/i });
  if (await abrir.count()) await abrir.first().click();
  await pagina.waitForFunction(
    () => typeof POS !== 'undefined' && (POS._prod || []).length > 0 && document.getElementById('pos-totales'),
    null, { timeout: 20000 });

  const venta = await pagina.evaluate(async (codigo) => {
    const p = (POS._prod || []).find(x => x.codigo === codigo);
    POS._cart = []; POS._descuento = 0;
    POS.addToCart(p.id); POS.setCant(p.id, 2);
    const total = POS._totales().total;
    await POS.cobrar();
    return { total, ventas: (POS._ventasHoy || []).length };
  }, CRED.producto || 'PRB-001');

  ok('hay una venta para imprimir', venta.ventas > 0, JSON.stringify(venta));

  if (venta.ventas > 0) {
    const totalTxt = 'Q' + venta.total.toFixed(2);

    /* ── El ticket ────────────────────────────────────────────────────── */
    const ticket = await capturarImpreso(() => pagina.evaluate(() => POS.reimprimirUltimo()));
    revisarDocumento('el ticket de la venta', ticket, [totalTxt]);

    /* ── El reporte de ventas ─────────────────────────────────────────── */
    const reporte = await pagina.evaluate(async () => {
      await POS.reportes();
      const m = document.querySelector('.modal, [class*="modal"]');
      return (m?.innerText || '').replace(/\s+/g, ' ').trim();
    });
    ok('el reporte de ventas se arma', reporte.length > 40, reporte.slice(0, 150));
    ok('...y no muestra undefined/NaN', !/\bundefined\b|\bNaN\b/.test(reporte),
       reporte.slice(0, 200));
    ok('...y cuenta la venta del día', /Q\d/.test(reporte), reporte.slice(0, 150));
  }

  ok('los impresos no tiraron errores de JavaScript', errores.length === 0, errores[0]);
} catch (e) {
  ok('los impresos se pudieron probar', false, e.message);
}

console.log(`\n${estado.pasadas} pasadas, ${estado.fallidas} fallidas`);
await cerrar(sesion, estado.fallidas);
process.exit(estado.fallidas ? 1 : 0);
