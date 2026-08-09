/* LOS NÚMEROS, VERIFICADOS CONTRA LA CUENTA HECHA A MANO.

   Una cuenta rota no revienta la pantalla: da un número creíble y equivocado.
   Nadie lo nota hasta la declaración de la SAT o hasta que el margen no cierra.
   Por eso acá no se comprueba "que aparezca un número" sino que el número sea
   EXACTAMENTE el que da la cuenta a mano.

   Las tres que importan hoy:
     · El IVA de Guatemala: 12% INCLUIDO en el precio. El total NO se multiplica
       por 1.12 — se divide. Confundirlo infla la factura un 12%.
     · El descuento del POS, que es lo que el cajero toca todos los días.
     · El costo por quintal de una fórmula de alimento, que es la base del
       precio al que el agroservicio vende el saco. */
import { abrirSesion, marcador, cerrar, BASE } from './ayuda.mjs';

const sesion = await abrirSesion();
if (!sesion) { console.log('⚠️  Sin credenciales o sin poder entrar — cálculos no se prueban.'); process.exit(0); }
const { pagina, errores, CRED } = sesion;
const { estado, ok } = marcador();
const casi = (a, b, tol = 0.011) => Math.abs(a - b) < tol;

try {
  /* ── EL IVA ─────────────────────────────────────────────────────────── */
  await pagina.goto(BASE + '/pos.html', { waitUntil: 'load' });
  await pagina.waitForFunction(() => typeof POS !== 'undefined', null, { timeout: 20000 }).catch(() => {});
  const abrir = pagina.getByRole('button', { name: /Abrir caja/i });
  if (await abrir.count()) await abrir.first().click();
  await pagina.waitForFunction(
    () => typeof POS !== 'undefined' && (POS._prod || []).length > 0 && document.getElementById('pos-totales'),
    null, { timeout: 20000 });

  const t = await pagina.evaluate((codigo) => {
    const p = (POS._prod || []).find(x => x.codigo === codigo);
    POS._cart = []; POS._descuento = 0;
    POS.addToCart(p.id); POS.setCant(p.id, 3);
    return { precio: Number(p.precio_venta), ...POS._totales() };
  }, CRED.producto || 'PRB-001');

  const bruto = +(t.precio * 3).toFixed(2);
  ok(`el bruto es ${3} x Q${t.precio} = Q${bruto}`, casi(t.bruto, bruto), 'dio ' + t.bruto);
  /* En Guatemala el IVA va INCLUIDO: sobre Q630 son Q67.50, no Q75.60. */
  ok('el IVA sale del precio (12% incluido), no se le suma encima',
     casi(t.iva, +(bruto * 12 / 112).toFixed(2)), `iva=${t.iva}, esperado=${(bruto*12/112).toFixed(2)}`);
  ok('subtotal + IVA = total', casi(t.subtotal + t.iva, t.total), `${t.subtotal} + ${t.iva} != ${t.total}`);
  ok('el total NO se infló sumando el IVA aparte', casi(t.total, bruto), 'dio ' + t.total);

  /* ── EL DESCUENTO ───────────────────────────────────────────────────── */
  /* El descuento manual es en QUETZALES, no en porcentaje — la etiqueta del
     POS dice "Descuento Manual: Q". Se prueba como es, no como uno supone. */
  const DESCUENTO = 50;
  const conDesc = await pagina.evaluate((d) => {
    POS._descuento = d;
    const r = POS._totales();
    POS._descuento = 0;
    return r;
  }, DESCUENTO);
  const esperadoDesc = +(bruto - DESCUENTO).toFixed(2);
  ok(`un descuento de Q${DESCUENTO} sobre Q${bruto} deja Q${esperadoDesc}`,
     casi(conDesc.total, esperadoDesc), 'dio ' + conDesc.total);
  ok('...y el IVA se recalcula sobre el total YA con descuento',
     casi(conDesc.iva, +(esperadoDesc * 12 / 112).toFixed(2)), 'iva=' + conDesc.iva);
  /* Nadie puede regalar más de lo que vale la venta. */
  const exagerado = await pagina.evaluate((b) => {
    POS._descuento = b * 10;
    const r = POS._totales();
    POS._descuento = 0;
    return r;
  }, bruto);
  ok('un descuento mayor que la venta no deja el total en negativo',
     exagerado.total === 0, 'dio ' + exagerado.total);

  /* ── EL COSTO DE UNA FÓRMULA ────────────────────────────────────────── */
  await pagina.goto(BASE + '/', { waitUntil: 'load' });
  await pagina.waitForFunction(() => typeof App !== 'undefined', null, { timeout: 20000 });

  const formula = await pagina.evaluate(async () => {
    const F = Modulos.formulas_alimento;
    /* Precios propios conocidos: así el costo esperado se puede calcular a
       mano y la prueba no depende de lo que publique el MAGA ese día. */
    F._insumos = [
      { id: 'x1', nombre: 'Maíz amarillo', precio_quintal: 200 },
      { id: 'x2', nombre: 'Pasta de soya (44-48% PC)', precio_quintal: 400 },
    ];
    F._ref = {}; F._mercado = {}; F._propias = [];
    /* Fórmula de dos ingredientes para que la cuenta sea obvia:
       60% a Q200 + 40% a Q400 = 120 + 160 = Q280 el quintal. */
    const f = { nombre: 'PRUEBA', animal: 'pollo', consumo: 0.1,
                ingredientes: [{ nombre: 'Maíz amarillo', pct: 60 },
                               { nombre: 'Pasta de soya (44-48% PC)', pct: 40 }] };
    const html = F._formulaHTML(f);
    const m = /Q(\d+\.\d{2})<span[^>]*>\/quintal/.exec(html);
    return { costo: m ? Number(m[1]) : null, tieneCosto: !!m };
  });

  ok('el costo por quintal se calcula (60% a Q200 + 40% a Q400)', formula.tieneCosto);
  ok('...y da exactamente Q280.00', casi(formula.costo, 280), 'dio ' + formula.costo);

  ok('los cálculos no tiraron errores de JavaScript', errores.length === 0, errores[0]);
} catch (e) {
  ok('los cálculos se pudieron probar', false, e.message);
}

console.log(`\n${estado.pasadas} pasadas, ${estado.fallidas} fallidas`);
await cerrar(sesion, estado.fallidas);
process.exit(estado.fallidas ? 1 : 0);
