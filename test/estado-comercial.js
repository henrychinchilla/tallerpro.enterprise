/* ESTADO COMERCIAL DE UN COMERCIO.

   El Panel SaaS decía "Activo" a El Granjero (venció el 31/8) y a CM
   Multiservicios (10/7) mientras el KPI contaba 2 vencidos: el badge solo
   miraba `active`. Y la fecha de hoy salía de toISOString() (UTC): después
   de las 18:00 en Guatemala ya era "mañana". */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const ctx = { window: {}, console, Intl, Date };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/core/config.js'), 'utf8') +
  '\n;this.__f = { hoyLocal, estadoComercial, suscripcionVigente };', ctx);
const { hoyLocal, estadoComercial, suscripcionVigente } = ctx.__f;

ok('vencido + active=true → vencido (no "Activo")',
   estadoComercial({ active: true, suscripcion_vence: '2026-08-31' }, '2026-09-30') === 'vencido');
ok('active=false manda sobre la fecha → suspendido',
   estadoComercial({ active: false, suscripcion_vence: '2099-01-01' }, '2026-09-30') === 'suspendido');
ok('vence hoy sigue vigente',
   estadoComercial({ active: true, suscripcion_vence: '2026-09-30' }, '2026-09-30') === 'activo');
ok('sin fecha de vencimiento = activo',
   estadoComercial({ active: true }, '2026-09-30') === 'activo');
ok('hoyLocal usa Guatemala: 2026-10-01 02:00 UTC es todavía 30/9',
   hoyLocal(new Date('2026-10-01T02:00:00Z')) === '2026-09-30');
ctx.window.Auth = { tenant: { active: true, suscripcion_vence: '2000-01-01' } };
ok('suscripcionVigente() da false para un vencido activo', suscripcionVigente() === false);

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
