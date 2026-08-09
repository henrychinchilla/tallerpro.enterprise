/* LA VENTA COMPLETA: el camino del dinero, de punta a punta.

   El humo verifica que el total se vea. Esto verifica que la VENTA OCURRA:
   se cobra, baja el stock, queda la factura y el corte de caja la cuenta.
   Es el camino que si se rompe le cuesta plata al negocio, y hasta hoy nadie
   lo recorría entero — ni una prueba ni una persona.

   Lo que se comprueba, en orden:
     1. El total en pantalla es el número correcto (cantidad x precio).
     2. El vuelto: con Q1000 recibidos sobre Q630, el cambio es Q370.
     3. Al cobrar, el STOCK BAJA exactamente lo vendido.
     4. La venta queda registrada (aparece en las ventas del día).
     5. El carrito queda limpio para la siguiente.

   Corre contra el comercio de PRUEBAS y su producto PRB-001, así que la venta
   que genera es de mentira y no ensucia números reales. */
import { abrirSesion, marcador, cerrar, BASE } from './ayuda.mjs';

const sesion = await abrirSesion();
if (!sesion) { console.log('⚠️  Sin credenciales o sin poder entrar — la venta no se prueba.'); process.exit(0); }
const { pagina, errores, CRED } = sesion;
const { estado, ok } = marcador();
const CANT = 3;

try {
  await pagina.goto(BASE + '/pos.html', { waitUntil: 'load' });
  await pagina.waitForFunction(() => typeof POS !== 'undefined', null, { timeout: 20000 }).catch(() => {});

  /* Abrir caja si la pide: es parte del camino real del cajero. */
  const abrir = pagina.getByRole('button', { name: /Abrir caja/i });
  if (await abrir.count()) await abrir.first().click();

  await pagina.waitForFunction(
    () => typeof POS !== 'undefined' && (POS._prod || []).length > 0 && document.getElementById('pos-totales'),
    null, { timeout: 20000 });

  /* ── 1. El total ────────────────────────────────────────────────────── */
  errores.length = 0;
  const antes = await pagina.evaluate(({ codigo, cant }) => {
    const p = (POS._prod || []).find(x => x.codigo === codigo);
    if (!p) return { error: 'falta el producto de prueba ' + codigo };
    POS._cart = [];
    POS.addToCart(p.id);
    POS.setCant(p.id, cant);
    return {
      precio: Number(p.precio_venta),
      stock: Number(p.stock),
      total: POS._totales().total,
      pantalla: document.getElementById('pos-totales').innerText.replace(/\s+/g, ' '),
    };
  }, { codigo: CRED.producto || 'PRB-001', cant: CANT });

  if (antes.error) throw new Error(antes.error);

  const esperado = +(antes.precio * CANT).toFixed(2);
  ok(`el total calcula ${CANT} x Q${antes.precio} = Q${esperado.toFixed(2)}`,
     Math.abs(antes.total - esperado) < 0.001, 'dio ' + antes.total);
  ok('...y ese número está EN PANTALLA', antes.pantalla.includes(`Q${esperado.toFixed(2)}`), antes.pantalla);
  ok('no hubo errores de JavaScript al armar el carrito', errores.length === 0, errores[0]);

  /* ── 2. El vuelto ───────────────────────────────────────────────────── */
  const recibido = 1000;
  const vuelto = await pagina.evaluate((r) => {
    const inp = document.getElementById('pos-recibido');
    if (!inp) return { error: 'no hay campo de recibido' };
    /* Se usa el mismo camino que el botón "Exacto" (POS._setRecibido), que es
       el que la app usa de verdad: escribir el value a mano no dispara el
       recálculo y la prueba estaría midiendo otra cosa. */
    POS._setRecibido(r);
    return { texto: (document.getElementById('pos-cambio')?.innerText || '').trim() };
  }, recibido);

  if (vuelto.error) ok('el cobro en efectivo pide el monto recibido', false, vuelto.error);
  else {
    const esperadoVuelto = +(recibido - esperado).toFixed(2);
    /* Se compara el NÚMERO, no el texto: "Q 370.00" y "Q370.00" son lo mismo. */
    const num = Number(String(vuelto.texto).replace(/[^\d.-]/g, ''));
    ok(`el vuelto de Q${recibido} sobre Q${esperado.toFixed(2)} es Q${esperadoVuelto.toFixed(2)}`,
       Math.abs(num - esperadoVuelto) < 0.01, 'mostró "' + vuelto.texto + '"');
  }

  /* ── 3, 4 y 5. Cobrar de verdad ─────────────────────────────────────── */
  errores.length = 0;
  const ventasAntes = await pagina.evaluate(() => (POS._ventasHoy || []).length);

  await pagina.evaluate(() => POS.cobrar());
  /* Cobrar toca varias tablas (factura, renglones, inventario, caja): se espera
     a que el carrito quede vacío, que es la señal de que terminó. */
  await pagina.waitForFunction(() => (POS._cart || []).length === 0, null, { timeout: 25000 }).catch(() => {});
  await pagina.waitForTimeout(1500);

  const despues = await pagina.evaluate(async ({ codigo }) => {
    /* Se relee el inventario de la base, no la copia en memoria: lo que
       importa es que el stock haya bajado DE VERDAD. */
    const frescos = await DB.getInventario();
    const p = frescos.find(x => x.codigo === codigo);
    return {
      stock: p ? Number(p.stock) : null,
      carrito: (POS._cart || []).length,
      ventasHoy: (POS._ventasHoy || []).length,
    };
  }, { codigo: CRED.producto || 'PRB-001' });

  ok('cobrar no tiró errores de JavaScript', errores.length === 0, errores[0]);
  ok(`el stock bajó exactamente ${CANT} (de ${antes.stock} a ${antes.stock - CANT})`,
     despues.stock !== null && Math.abs(despues.stock - (antes.stock - CANT)) < 0.001,
     'quedó en ' + despues.stock);
  ok('el carrito queda limpio para la siguiente venta', despues.carrito === 0);
  ok('la venta quedó registrada en el día', despues.ventasHoy > ventasAntes,
     `antes ${ventasAntes}, después ${despues.ventasHoy}`);
} catch (e) {
  ok('la venta completa se pudo ejecutar', false, e.message);
}

console.log(`\n${estado.pasadas} pasadas, ${estado.fallidas} fallidas`);
await cerrar(sesion, estado.fallidas);
process.exit(estado.fallidas ? 1 : 0);
