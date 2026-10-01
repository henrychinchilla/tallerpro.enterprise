/* UNA FACTURA VIVA POR OT (mig 151) Y CONTEOS QUE SE ENTIENDEN.

   La doble factura de una OT solo la frenaba un SELECT en el navegador: dos
   clics pasaban ambos. El índice único parcial lo impide en la base (las
   anuladas no cuentan). Y "83 vs 140" no era un descuadre: Facturación
   muestra el mes activo (83 de septiembre) y Admin el histórico (140). */
const fs = require('fs');
const path = require('path');
const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const mig = leer('db/migrations/151_factura_unica_por_ot.sql');
ok('índice único (tenant_id, ot_id)', /CREATE UNIQUE INDEX[\s\S]*facturas \(tenant_id, ot_id\)/.test(mig));
ok('las anuladas no bloquean refacturar', /<> 'anulada'/.test(mig));
ok('upsertFactura traduce el choque del índice', /facturas_una_por_ot_idx/.test(leer('js/core/db.js')));
ok('Facturación dice que cuenta el período', /facturas del período/.test(leer('js/modulos/finanzas/facturacion.js')));
ok('Admin dice que cuenta el histórico', /histórico, todos los meses/.test(leer('js/modulos/admin/admin.js')));

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
