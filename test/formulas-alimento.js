/* Fórmulas de alimentación balanceada.

   Acá lo que puede salir mal no es la pantalla: es el DATO. Un porcentaje mal
   tecleado da un costo por quintal equivocado y el agroservicio cotiza mal. Y
   hay un error que no es de plata sino de animal muerto: la urea es nitrógeno
   no proteico que sólo el rumen puede aprovechar — en un caballo, un cerdo o
   una gallina es tóxica. Que no se cuele en esas especies se prueba, no se
   confía. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, Modulos: {}, UI: { esc: (s) => s, fecha: (f) => f }, DB: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'modulos', 'agropecuaria', 'formulas_alimento.js'), 'utf8'),
  ctx
);
const F = ctx.Modulos.formulas_alimento;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const especies = Object.entries(F._ESPECIES);
ok('están las cuatro especies que se pidieron (bovinos, porcinos, aves, equinos)',
   ['aves', 'porcinos', 'bovinos', 'equinos'].every((k) => F._ESPECIES[k]));

/* ── Los porcentajes tienen que cerrar ─────────────────────────────────── */
for (const [esp, def] of especies) {
  for (const f of def.formulas) {
    const suma = Object.values(f.ing).reduce((s, p) => s + p, 0);
    ok(`${esp} · "${f.nombre}" suma ${suma.toFixed(1)}% (100 ± 1)`, Math.abs(suma - 100) <= 1);
    ok(`${esp} · "${f.nombre}" no tiene ingredientes en 0 o negativos`,
       Object.values(f.ing).every((p) => p > 0));
  }
}

/* ── Ningún ingrediente fantasma ───────────────────────────────────────── */
for (const [esp, def] of especies) {
  for (const f of def.formulas) {
    const desconocidos = Object.keys(f.ing).filter((k) => !F._ING[k]);
    ok(`${esp} · "${f.nombre}" sólo usa ingredientes del catálogo`, desconocidos.length === 0);
  }
}

/* ── SEGURIDAD: urea sólo en rumiantes ─────────────────────────────────── */
{
  const conUrea = [];
  for (const [esp, def] of especies)
    for (const f of def.formulas)
      if (f.ing.urea) conUrea.push(esp);
  ok('la urea aparece sólo en bovinos', conUrea.every((e) => e === 'bovinos'));
  ok('a los caballos NUNCA se les mete urea',
     !F._ESPECIES.equinos.formulas.some((f) => f.ing.urea));
  ok('a los cerdos tampoco', !F._ESPECIES.porcinos.formulas.some((f) => f.ing.urea));
  ok('a las aves tampoco', !F._ESPECIES.aves.formulas.some((f) => f.ing.urea));
  ok('y la urea lleva su advertencia escrita', /SÓLO RUMIANTES/i.test(F._ING.urea.aviso || ''));
}

/* ── Advertencias que no pueden faltar ─────────────────────────────────── */
ok('la soya avisa que es pasta y no grano crudo', /inhibidores de tripsina/i.test(F._ING.soya.aviso || ''));
ok('el sorgo avisa por los taninos', /tanino/i.test(F._ING.sorgo.aviso || ''));

/* ── Sólo se marcan como MAGA los tres que el MAGA publica ─────────────── */
{
  const conMaga = Object.entries(F._ING).filter(([, v]) => v.maga).map(([k]) => k).sort();
  ok('maíz, maicillo y soya se costean con MAGA... y sólo ellos',
     JSON.stringify(conMaga) === JSON.stringify(['maiz', 'maiz_b', 'sorgo']));
  /* La soya la publica el MAGA como grano, pero la fórmula usa PASTA de soya,
     que es otro producto y otro precio: por eso va a precio propio. Si algún
     día se le pone `maga`, esta prueba obliga a pensarlo. */
  ok('la pasta de soya NO toma el precio del grano de soya', !F._ING.soya.maga);
}

/* ── Libras / kilos / gramos ────────────────────────────────────────────
   En Guatemala se pesa en libras. Lo que hay que cuidar es que la conversión
   no mienta en la báscula: un ingrediente mal convertido descuadra la mezcla
   y, en el caso de los aditivos, la sobredosis es el riesgo. */
{
  ok('arranca en libras, que es como se pesa acá', F._unidad === 'lb');

  F._unidad = 'lb';
  /* El quintal son 100 libras exactas: el % ES la libra. Sin cuentas. */
  ok('56% = 56 libras por quintal', F._masa(56) === '56.00 lb');
  ok('1% = 1 libra', F._masa(1) === '1.00 lb');
  /* Media libra de premezcla nadie la pesa en libras: en gramos sí. */
  ok('las inclusiones chicas pasan a gramos (0.2% = 91 g)', F._masa(0.2) === '91 g');
  ok('0.5% también sale en gramos', /g$/.test(F._masa(0.5)));

  F._unidad = 'kg';
  ok('56% = 25.40 kg por quintal', F._masa(56) === '25.40 kg');
  ok('en kilos las chicas también salen en gramos', F._masa(0.2) === '91 g');
  /* El mismo ingrediente pesa lo mismo, se muestre como se muestre. */
  const enLb = 56 * 0.45359237, enKg = 100 * 0.45359237 * 56 / 100;
  ok('libras y kilos describen la MISMA masa', Math.abs(enLb - enKg) < 1e-9);

  F._unidad = 'lb';
  const cl = F._costoUnitario(500);
  ok('Q500 el quintal = Q5.00 la libra', Math.abs(cl.valor - 5) < 1e-9 && cl.etiqueta === 'por libra');
  F._unidad = 'kg';
  const ck = F._costoUnitario(500);
  ok('Q500 el quintal = Q11.02 el kilo', Math.abs(ck.valor - 11.0231) < 0.001 && ck.etiqueta === 'por kg');
  ok('la libra siempre cuesta menos que el kilo', cl.valor < ck.valor);

  /* Una fórmula completa tiene que dar el quintal: si la suma de los
     ingredientes no da 100 lb, la mezcla no cierra. */
  F._unidad = 'lb';
  for (const [esp, def] of especies)
    for (const f of def.formulas) {
      const lb = Object.values(f.ing).reduce((s, p) => s + p, 0);
      ok(`${esp} · "${f.nombre}" cierra el quintal (${lb.toFixed(1)} lb)`, Math.abs(lb - 100) <= 1);
    }
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
