/* EL COBRO MANUAL RENUEVA LA SUSCRIPCIÓN.

   guardarCobro() solo insertaba en tenant_pagos: el comercio pagaba y seguía
   vencido. Ahora va por el RPC registrar_cobro_saas (mig 148), que extiende
   suscripcion_vence en la misma transacción. Probado contra la BD con un
   bloque que se revierte: pendiente no renueva, pagado sí, admin no puede. */
const fs = require('fs');
const path = require('path');
const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const sa = leer('js/modulos/admin/superadmin.js');
const g = sa.slice(sa.indexOf('async guardarCobro'), sa.indexOf('async eliminarPago'));
ok('guardarCobro usa el RPC registrar_cobro_saas', /rpc\('registrar_cobro_saas'/.test(g));
ok('guardarCobro ya no inserta el pago por fuera del RPC', !/upsertTenantPago/.test(g));
ok('el formulario pregunta cuántos meses cubre', /id="co-meses"/.test(sa));

const mig = leer('db/migrations/148_registrar_cobro_saas.sql');
ok('el RPC exige superadmin', /IF NOT public\.is_superadmin\(\)/.test(mig));
ok('solo un cobro pagado extiende la fecha', /IF p_estado = 'pagado' THEN[\s\S]*suscripcion_vence = vence/.test(mig));
ok('extiende desde max(vence, hoy), con hoy de Guatemala',
   /greatest\(coalesce\(t\.suscripcion_vence, hoy\), hoy\)/.test(mig) && /America\/Guatemala/.test(mig));

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
