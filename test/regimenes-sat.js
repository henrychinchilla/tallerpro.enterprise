/* Regímenes tributarios de Guatemala.

   El alta sólo ofrecía dos —General y Pequeño Contribuyente— y faltaban los
   del Decreto 7-2019, incluido el AGROPECUARIO, que es el que le toca a una
   venta de granos.

   Lo que de verdad puede doler no es que falte una opción en una lista: es
   que la app decidía si el comercio paga tasa reducida preguntando si el
   código empieza con "peque". Con 'agropecuario' eso da FALSO, y entonces le
   factura 12% a quien paga 5%. Eso se cobra mal a los clientes y se declara
   mal a la SAT, así que se prueba explícitamente. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, Math, Date, JSON };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'config.js'), 'utf8'), ctx);
const { REGIMENES_SAT, regimenSAT, regimenSimplificado, tasaIVARegimen } = ctx;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── Están los cinco ────────────────────────────────────────────────────── */
{
  const ids = Object.keys(REGIMENES_SAT);
  ok('ya no son sólo dos regímenes', ids.length >= 5);
  ['general', 'pequeno', 'pequeno_electronico', 'agropecuario', 'agropecuario_electronico']
    .forEach(id => ok(`está el régimen ${id}`, !!REGIMENES_SAT[id]));
  ok('todos tienen etiqueta y explicación',
     ids.every(id => REGIMENES_SAT[id].label && REGIMENES_SAT[id].detalle));
}

/* ── Las tasas ──────────────────────────────────────────────────────────── */
{
  ok('el general es 12%', tasaIVARegimen('general') === 0.12);
  ok('el pequeño contribuyente es 5%', tasaIVARegimen('pequeno') === 0.05);
  ok('el electrónico baja a 4%', tasaIVARegimen('pequeno_electronico') === 0.04);
  ok('el agropecuario es 5%', tasaIVARegimen('agropecuario') === 0.05);
  ok('el agropecuario electrónico, 4%', tasaIVARegimen('agropecuario_electronico') === 0.04);
  ok('el agropecuario llega hasta Q3,000,000 al año', REGIMENES_SAT.agropecuario.techo_anual === 3000000);
  ok('el pequeño contribuyente hasta Q150,000', REGIMENES_SAT.pequeno.techo_anual === 150000);
}

/* ── EL BUG QUE ESTO EVITA ──────────────────────────────────────────────── */
{
  /* La comprobación vieja: (regimen||'general').startsWith('peque') */
  const viejo = (r) => String(r || 'general').toLowerCase().startsWith('peque');

  ok('el agropecuario SÍ es de tasa reducida', regimenSimplificado('agropecuario') === true);
  ok('...y con la comprobación vieja daba falso (le cobraba 12%)', viejo('agropecuario') === false);
  ok('el agropecuario electrónico también es reducido', regimenSimplificado('agropecuario_electronico') === true);
  ok('el general NO es reducido', regimenSimplificado('general') === false);
  ok('el pequeño sigue siendo reducido', regimenSimplificado('pequeno') === true);
  ok('y el pequeño electrónico también', regimenSimplificado('pequeno_electronico') === true);
}

/* ── Tolerancia con lo que ya está guardado ─────────────────────────────── */
{
  ok('sin régimen configurado se asume general', regimenSAT(null).label === REGIMENES_SAT.general.label);
  ok('un código desconocido no revienta la contabilidad', regimenSAT('zzz').tasa_iva === 0.12);
  ok('las mayúsculas no importan', tasaIVARegimen('PEQUENO') === 0.05);
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
