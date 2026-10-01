/* PRECIOS MAGA CON SU FECHA REAL.

   Venta de Granos decía "Referencia … del día" y "entran cada mañana" con
   datos del 18/8 — 43 días congelados: maga-sync falla a diario con
   "El MAGA no listó los archivos diarios (HTTP 403)". La pantalla ahora usa
   la fecha real de cada dato y avisa cuando tiene más de 2 días. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const src = fs.readFileSync(path.join(__dirname, '..', 'js/modulos/agropecuaria/venta_granos.js'), 'utf8');
const ctx = { console, Modulos: {}, window: {},
  hoyLocal: () => '2026-09-30',
  UI: { fecha: f => f.split('-').reverse().join('/'), esc: s => String(s) } };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const VG = ctx.Modulos.venta_granos;
const r = (fecha, precio = 100) => ({ precio, fecha, mercado: 'La Terminal', medida: 'quintal' });

VG._ref = { [VG._REF_MAGA.maiz]: r('2026-08-18'), [VG._REF_MAGA.frijol]: r('2026-08-18') };
let h = VG._refMagaHTML();
ok('dato viejo: muestra la fecha real 18/08/2026', h.includes('18/08/2026'));
ok('dato viejo: avisa los días sin datos nuevos', /sin datos nuevos hace 43 días/.test(h));
ok('dato viejo: ya no promete que "entran cada mañana"', !/entran cada mañana/.test(h));

VG._ref = { [VG._REF_MAGA.maiz]: r('2026-09-30'), [VG._REF_MAGA.frijol]: r('2026-09-29') };
h = VG._refMagaHTML();
ok('fechas distintas: toma la más reciente como último dato', /último dato 30\/09\/2026/.test(h));
ok('fechas distintas: el grano atrasado muestra la suya', h.includes('29/09/2026'));
ok('dato al día: sin aviso', !/sin datos nuevos/.test(h));

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
