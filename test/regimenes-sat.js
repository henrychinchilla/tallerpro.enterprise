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
const { REGIMENES_SAT, REGIMENES_ISR, regimenSAT, regimenSimplificado, tasaIVARegimen,
        tasaISR, aplicaISR, resolverRegimenes } = ctx;

const SIMPLIFICADOS = ['pequeno', 'pequeno_electronico', 'agropecuario', 'agropecuario_electronico'];

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
  /* Q150,000 era el límite viejo, y contradecía el aviso de Contabilidad → SAT
     que ya citaba la cifra del Decreto 31-2024 (125 salarios mínimos). */
  ok('el pequeño contribuyente hasta Q465,381.25 (Decreto 31-2024)',
     REGIMENES_SAT.pequeno.techo_anual === 465381.25);
  ok('la variante electrónica tiene el mismo techo',
     REGIMENES_SAT.pequeno_electronico.techo_anual === REGIMENES_SAT.pequeno.techo_anual);
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

/* ── ISR: es OTRO impuesto, no un IVA del 25% ───────────────────────────────
   Henry buscó "el régimen general del IVA del 25%" y no lo encontró, con razón:
   en Guatemala el IVA es 12% y el 25% es la tasa del ISR sobre utilidades.
   Estaban en el mismo saco —el 25% sólo se mencionaba dentro del texto de
   ayuda del régimen general— así que acá se prueba que son cosas separadas. */
{
  ok('el ISR tiene sus dos regímenes (Decreto 10-2012)',
     !!REGIMENES_ISR.utilidades && !!REGIMENES_ISR.opcional_simplificado);
  ok('sobre utilidades es 25%', tasaISR('utilidades') === 0.25);
  ok('...y el 25% NO es una tasa de IVA',
     !Object.values(REGIMENES_SAT).some(r => r.tasa_iva === 0.25));
  ok('el IVA más alto sigue siendo 12%',
     Math.max(...Object.values(REGIMENES_SAT).map(r => r.tasa_iva)) === 0.12);

  /* En el simplificado la tasa depende del monto: 5% hasta Q30,000, 7% arriba. */
  ok('simplificado: 5% en el primer tramo', tasaISR('opcional_simplificado', 20000) === 0.05);
  ok('simplificado: 5% justo en Q30,000', tasaISR('opcional_simplificado', 30000) === 0.05);
  ok('simplificado: 7% al pasar Q30,000', tasaISR('opcional_simplificado', 30001) === 0.07);
  ok('sobre utilidades no depende del monto',
     tasaISR('utilidades', 1) === tasaISR('utilidades', 9e9));
  ok('un régimen de ISR desconocido no revienta', tasaISR('zzz') === 0);
}

/* ── EL BUG QUE ESTO EVITA ──────────────────────────────────────────────────
   Las cuatro rutas de alta (registro por correo, registro con Google, alta
   desde el Panel SaaS y el respaldo de auth.js) hacían lo mismo:
     regimen_iva === 'pequeno' ? 'pequeno' : 'general'   +   tasa_isr: 0.05
   Es decir: quien elegía Agropecuario quedaba guardado como General con IVA
   12%, y TODO comercio nuevo nacía con ISR al 5% aunque tributara al 25%. */
{
  const viejo = (r) => (r === 'pequeno' ? 'pequeno' : 'general');

  const agro = resolverRegimenes('agropecuario', 'utilidades');
  ok('el agropecuario se guarda como agropecuario', agro.regimen_iva === 'agropecuario');
  ok('...y con la lógica vieja se guardaba como general', viejo('agropecuario') === 'general');
  ok('el agropecuario conserva su IVA del 5%', agro.tasa_iva === 0.05);
  ok('...que la lógica vieja subía a 12%', REGIMENES_SAT[viejo('agropecuario')].tasa_iva === 0.12);

  /* El ISR se comprueba sobre el general, que es el único que lo paga. */
  const util = resolverRegimenes('general', 'utilidades');
  ok('el ISR sobre utilidades se guarda al 25%', util.tasa_isr === 0.25);
  ok('...y antes quedaba fijo en 5% para todos', util.tasa_isr !== 0.05);
  ok('guarda también el nombre del régimen de ISR', util.regimen_isr === 'utilidades');

  /* Las tasas ya no se piden aparte: las deriva el régimen. Así no se puede
     guardar "Pequeño Contribuyente" con IVA 12%. */
  Object.keys(REGIMENES_SAT).forEach(id => {
    ok(`la tasa de IVA de ${id} sale del catálogo`,
       resolverRegimenes(id, 'utilidades').tasa_iva === REGIMENES_SAT[id].tasa_iva);
  });

  const porDefecto = resolverRegimenes(undefined, undefined);
  ok('sin elección se asume general', porDefecto.regimen_iva === 'general');
  ok('sin elección el ISR es el simplificado', porDefecto.regimen_isr === 'opcional_simplificado');
  ok('basura no revienta el alta', resolverRegimenes('zzz', 'zzz').tasa_iva === 0.12);
}

/* ── En los simplificados NO hay ISR ────────────────────────────────────────
   Lo cazó Henry: "cuando se elige pequeño contribuyente debería desaparecer el
   régimen de ISR porque estos regímenes no generan ISR". Es correcto, y aplica
   también al AGROPECUARIO, que es igual de simplificado:

     · Pequeño Contribuyente      — Decreto 27-92 (Ley del IVA), arts. 45 a 50
     · Contribuyente Agropecuario — Decreto 7-2019

   Su tasa única sobre ingresos brutos es de pago DEFINITIVO: quedan relevados
   de presentar y pagar ISR (anual, trimestral o mensual) y el ISO. Guardarles
   un régimen de ISR afirma una obligación que la ley no les impone. */
{
  SIMPLIFICADOS.forEach(id => {
    ok(`${id} NO paga ISR aparte`, aplicaISR(id) === false);
    const r = resolverRegimenes(id, 'utilidades');   // aunque el formulario insista
    ok(`...y no se le guarda régimen de ISR`, r.regimen_isr === null);
    ok(`...ni tasa de ISR`, r.tasa_isr === 0);
    ok(`...pero conserva su tasa de IVA`, r.tasa_iva === REGIMENES_SAT[id].tasa_iva);
  });

  ok('el régimen general SÍ paga ISR aparte', aplicaISR('general') === true);
  ok('...y ahí sí se guarda el régimen elegido',
     resolverRegimenes('general', 'utilidades').regimen_isr === 'utilidades');
  ok('sin régimen de IVA se asume general, que sí paga ISR', aplicaISR(undefined) === true);

  /* La regla se deriva de `simplificado` en el catálogo, no de una lista suelta:
     si mañana la SAT agrega otro régimen simplificado, hereda el trato solo. */
  Object.entries(REGIMENES_SAT).forEach(([id, r]) => {
    ok(`${id}: pagar ISR es lo contrario de ser simplificado`,
       aplicaISR(id) === !r.simplificado);
  });
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
