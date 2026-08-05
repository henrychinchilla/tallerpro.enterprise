/* El recomendador de precios y el régimen fiscal.

   Al agregar el régimen de ISR salió que `_regimen()` en precios.js seguía
   clasificando con `startsWith('peque')` — el mismo bug que ya se había
   arreglado en la facturación, pero acá vivo y en la fórmula del precio.

   Con AGROPECUARIO (que es simplificado y paga 5% definitivo) hacía DOS cosas
   mal a la vez:
     1. Lo mandaba por la rama del régimen general → le sumaba IVA 12% al
        precio, cuando en el simplificado no hay IVA que trasladar.
     2. Le restaba un ISR del 5%/7% que por ley no paga (Decreto 7-2019).
   El resultado es un precio recomendado inflado y un margen neto que no
   cuadra con lo que de verdad queda en la bolsa.

   Además la tasa del simplificado estaba escrita a mano como 0.05 en seis
   lugares, así que las variantes ELECTRÓNICAS (4%, Decreto 7-2019) se
   calculaban como si pagaran 5%. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ctx = { console, Math, Date, JSON };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'js', 'core', 'config.js'), 'utf8'), ctx);

/* Lo mínimo que precios.js necesita para cargar y calcular. */
ctx.Modulos = {};
ctx.Auth = { tenant: { config_pos_tarjeta: null, config_precios: null } };
ctx.UI = { q: n => 'Q' + n };
ctx.DB = {};
vm.runInContext(fs.readFileSync(path.join(raiz, 'js', 'modulos', 'finanzas', 'precios.js'), 'utf8'), ctx);

const P = ctx.Modulos.precios;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* Prepara el módulo como si viniera de la BD, sin tocar red. */
function conRegimen(regimen_iva, extra = {}) {
  P._fiscal = { regimen_iva, ...extra };
  P._cfg = Object.assign({}, P.DEFAULTS, {
    margen_neto_pct: 25, margen_minimo_pct: 20,
    ventas_mes: 100000, merma_pct: 3, gastos_fijos: [{ nombre: 'Local', monto: 10000 }],
  });
  P._costoDirPct = 0.55;
  return P;
}

/* ── Los simplificados se reconocen todos, no sólo los que empiezan con "peque" ── */
{
  const viejo = (r) => String(r || 'general').toLowerCase().startsWith('peque');

  ['pequeno', 'pequeno_electronico', 'agropecuario', 'agropecuario_electronico'].forEach(id => {
    ok(`${id} se trata como simplificado`, conRegimen(id)._regimen().pequeno === true);
  });
  ok('...y con la comprobación vieja el agropecuario daba falso', viejo('agropecuario') === false);
  ok('el general no es simplificado', conRegimen('general')._regimen().pequeno === false);
}

/* ── Ningún simplificado paga ISR ───────────────────────────────────────── */
{
  ['pequeno', 'agropecuario'].forEach(id => {
    const r = conRegimen(id)._regimen();
    ok(`${id}: no entra por la rama de utilidades`, r.utilidades === false);
    ok(`${id}: el rótulo dice que no paga ISR aparte`, /sin ISR/i.test(r.label));
  });

  /* Un comercio viejo del régimen general, con tasa guardada y sin nombre. */
  const viejoUtil = conRegimen('general', { tasa_isr: 0.25 })._regimen();
  ok('un comercio viejo con tasa 0.25 sigue leyéndose como utilidades', viejoUtil.utilidades === true);
  const conNombre = conRegimen('general', { regimen_isr: 'utilidades', tasa_isr: 0.05 })._regimen();
  ok('cuando hay nombre guardado, manda el nombre y no la tasa', conNombre.utilidades === true);
}

/* ── La tasa del simplificado sale del catálogo, no de un 0.05 escrito a mano ── */
{
  ok('pequeño contribuyente: 5%', conRegimen('pequeno')._regimen().tasaSimpl === 0.05);
  ok('pequeño electrónico: 4%, no 5%', conRegimen('pequeno_electronico')._regimen().tasaSimpl === 0.04);
  ok('agropecuario: 5%', conRegimen('agropecuario')._regimen().tasaSimpl === 0.05);
  ok('agropecuario electrónico: 4%', conRegimen('agropecuario_electronico')._regimen().tasaSimpl === 0.04);

  /* Pagar menos impuesto tiene que dar un precio recomendado MENOR. */
  const m5 = conRegimen('pequeno')._calc().M;
  const m4 = conRegimen('pequeno_electronico')._calc().M;
  ok('el electrónico (4%) recomienda un precio menor que el 5%', m4 < m5);
}

/* ── EL BUG QUE ESTO EVITA ──────────────────────────────────────────────────
   Al agropecuario se le agregaba IVA 12% al precio. En el simplificado el
   precio ya es final: no hay IVA que trasladar. */
{
  const agro = conRegimen('agropecuario')._calc();
  const peq  = conRegimen('pequeno')._calc();
  const gen  = conRegimen('general', { regimen_isr: 'opcional_simplificado' })._calc();

  ok('agropecuario y pequeño contribuyente cotizan igual (misma tasa, mismo trato)',
     Math.abs(agro.M - peq.M) < 1e-9);
  ok('...y NO como el régimen general', Math.abs(agro.M - gen.M) > 1e-6);
  ok('en el simplificado no se le suma IVA al precio', agro.M < gen.M);

  /* El punto de equilibrio y el margen inverso van por la misma rama. */
  ok('el punto de equilibrio del agropecuario también cambia',
     agro.breakEven !== null && Math.abs(agro.breakEven - gen.breakEven) > 1);

  const margenAgro = conRegimen('agropecuario')._margenDe(1000, 500);
  const margenGen  = conRegimen('general', { regimen_isr: 'opcional_simplificado' })._margenDe(1000, 500);
  ok('el margen real al mismo precio difiere entre simplificado y general',
     Math.abs(margenAgro - margenGen) > 1e-6);
  ok('el margen del simplificado es un número usable',
     Number.isFinite(margenAgro) && margenAgro < 1);
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
