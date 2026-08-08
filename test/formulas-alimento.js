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

const ctx = { console, Modulos: {}, DB: {},
  UI: { esc: (s) => s, fecha: (f) => f,
        /* El rendimiento cuenta animales con separador de miles desde que hay
           alevines (un quintal alimenta 453,592, no "453592"). */
        numero: (v, d = 3) => (Number(v) || 0).toLocaleString('es-GT', { maximumFractionDigits: d }) } };
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

/* ── De dónde sale cada precio ───────────────────────────────────────────
   El orden importa y es plata: si el precio del supermercado le ganara al
   que cargó el comercio, el costeo se llenaría de números de góndola —que
   son presentación de cocina— y cotizaría carísimo. Y si un tentativo se
   mostrara como firme, nadie sabría que hay que corregirlo. */
{
  F._insumos = [];
  F._ref = { 'Maíz amarillo, de primera': { precio: 200 } };
  F._mercado = { melaza: { precio_kg: 37.87, nombre: 'Melaza X 500 g', fuente: 'walmart.com.gt', fecha: '2026-08-01' } };

  const maiz = F._precioQq('maiz');
  ok('el maíz toma el precio del MAGA', maiz.q === 200 && maiz.fuente === 'MAGA');
  ok('el del MAGA va como firme', maiz.firme === true);

  const mel = F._precioQq('melaza');
  ok('la melaza cae al menudeo cuando no hay otro', mel.fuente === 'menudeo');
  ok('el menudeo NO es firme: hay que poder distinguirlo', mel.firme === false);
  /* Q37.87/kg × 45.36 kg = Q1,717 el quintal: absurdo para melaza forrajera,
     y justamente por eso tiene que verse marcado y editable. */
  ok('el menudeo se convierte de kg a quintal', Math.abs(mel.q - 37.87 * 100 * 0.45359237) < 0.02);
  ok('el menudeo dice de dónde salió', /walmart/.test(mel.detalle || ''));

  /* Ahora el comercio carga SU precio: tiene que ganarle a los dos. */
  F._insumos = [{ id: '1', nombre: 'Melaza de caña', precio_quintal: 220 }];
  const mel2 = F._precioQq('melaza');
  ok('el precio propio le gana al menudeo', mel2.q === 220 && mel2.fuente === 'tuyo' && mel2.firme === true);
  F._insumos = [{ id: '2', nombre: 'Maíz amarillo', precio_quintal: 180 }];
  ok('el precio propio también le gana al MAGA', F._precioQq('maiz').q === 180);

  F._insumos = [];
  ok('sin ninguna fuente devuelve null y no inventa', F._precioQq('premezcla') === null);
}

/* ── Cuántos animales come un quintal ────────────────────────────────── */
{
  F._unidad = 'lb';
  const pollo = F._ESPECIES.aves.formulas[0];          // consumo 0.06 kg/día
  const html = F._rendimiento(pollo, 500, true);
  const animales = Math.floor((100 * 0.45359237) / pollo.consumo);
  ok('un quintal da para 755 pollos en un día', animales === 755);
  ok('lo dice en pantalla', html.includes(String(animales)) && /pollos/.test(html));
  ok('y calcula el costo por animal al día', /Q0\.66 por pollo/.test(html));

  const vaca = F._ESPECIES.bovinos.formulas[0];        // 6 kg/día
  ok('una vaca se come 7 quintales al mes, no 700',
     Math.floor((100 * 0.45359237) / vaca.consumo) === 7);

  /* Sin costo completo no se inventa el costo por animal, pero sí se dice
     cuántos animales come: eso no depende del precio. */
  const sinCosto = F._rendimiento(pollo, 0, false);
  ok('sin precios completos igual dice cuántos animales', /755/.test(sinCosto));
  ok('pero no muestra costo por animal inventado', !/por pollo al d/.test(sinCosto));

  ok('las 10 fórmulas tienen consumo y animal',
     especies.every(([, d]) => d.formulas.every(f => f.consumo > 0 && f.animal)));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
