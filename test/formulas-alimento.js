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

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
