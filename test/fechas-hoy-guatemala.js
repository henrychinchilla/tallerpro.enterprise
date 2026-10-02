/* "HOY" ES EL DE GUATEMALA, NO EL DE UTC.

   new Date().toISOString().slice(0,10) es la fecha UTC: de 18:00 a
   medianoche en Guatemala ya es "mañana". Lo vio la demo E2E (2026-10-01) en
   el POS: pedía las ventas del 2/10 siendo 1/10, y cada factura del POS se
   guardaba con fecha de mañana después de las 6 pm. Había 72 en 31 archivos;
   todos pasaron a hoyLocal() (config.js). Esta prueba no deja volver ninguno. */
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const sitios = [];
const rec = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return rec(p);
  if (!e.name.endsWith('.js')) return;
  fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
    if (/new Date\(\)\.toISOString\(\)\.slice\(0, *10\)/.test(l)) sitios.push(path.relative(raiz, p) + ':' + (i + 1));
  });
});
rec(path.join(raiz, 'js'));
ok('ningún "hoy" en UTC (new Date().toISOString().slice(0,10))' + (sitios.length ? ': ' + sitios.slice(0, 8).join(', ') : ''), !sitios.length);

const pos = fs.readFileSync(path.join(raiz, 'js/pos/pos.js'), 'utf8');
const cobrar = pos.slice(pos.indexOf('async cobrar'), pos.indexOf('\n  },', pos.indexOf('async cobrar')));
ok('la factura del POS se fecha con hoyLocal()', /fecha: hoyLocal\(\)/.test(cobrar));
for (const html of ['index.html', 'pos.html', 'feedback.html'])
  ok(`${html} carga config.js (donde vive hoyLocal)`, /js\/core\/config\.js/.test(fs.readFileSync(path.join(raiz, html), 'utf8')));

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
