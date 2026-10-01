/* STOCK ATÓMICO (mig 149, RPC mover_stock).

   Antes: leer stock → restar en el navegador → escribir, con Math.max(0,…).
   Dos ventas a la vez se pisaban y vender de más dejaba 0 en silencio.
   Ahora el RPC hace UPDATE … WHERE stock >= cant, todo o nada, y los
   llamadores descuentan ANTES de crear la factura (si no alcanza, no se
   emite; si la factura falla, se devuelve). Probado contra la BD con un
   bloque revertido: 30→29, sobreventa bloqueada, todo-o-nada, devolución. */
const fs = require('fs');
const path = require('path');
const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const db = leer('js/core/db.js');
const fn = (src, nombre) => { const i = src.indexOf(nombre); return src.slice(i, src.indexOf('\n  },', i)); };

ok('descontarInventarioVenta va por el RPC (no lee-y-escribe)',
   /_moverStock\(items, 'salida'/.test(fn(db, 'async descontarInventarioVenta')) &&
   /rpc\('mover_stock'/.test(fn(db, 'async _moverStock')));
ok('moverStockArmeria va por el RPC', /_moverStock\(/.test(fn(db, 'async moverStockArmeria')));
ok('ya no queda el Math.max(0, stock - cant) que tapaba la sobreventa',
   !/Math\.max\(0,\s*Number\(inv\.stock\)/.test(db));

const antes = (src, a, b) => src.indexOf(a) > -1 && src.indexOf(a) < src.indexOf(b);
const pos = fn(leer('js/pos/pos.js'), 'async cobrar');
ok('POS: descuenta stock antes de crear la factura', antes(pos, 'descontarInventarioVenta', 'upsertFactura'));
ok('POS: devuelve el stock si la factura falla', /devolverInventarioVenta/.test(pos));
const ot = fn(leer('js/modulos/operacion/ordenes.js'), 'async enviarFacturacion');
ok('OT: descuenta stock antes de crear la factura', antes(ot, 'descontarInventarioVenta', 'upsertFactura'));
ok('OT: devuelve el stock si la factura falla', /devolverInventarioVenta/.test(ot));
const fac = leer('js/modulos/finanzas/facturacion.js');
ok('Facturación: descuenta antes de upsertFactura',
   antes(fac.slice(fac.indexOf('const conStock')), 'descontarInventarioVenta', 'upsertFactura'));

const mig = leer('db/migrations/149_mover_stock_atomico.sql');
ok('el RPC descuenta con guarda stock >= cantidad', /coalesce\(stock,0\) >= cant/.test(mig));
ok('el RPC respeta la RLS (SECURITY INVOKER)', /SECURITY INVOKER/.test(mig));
ok('los servicios no mueven stock', /'servicio'/.test(mig));

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
