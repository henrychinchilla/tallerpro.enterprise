/* COTIZACIÓN → OT CON SUS ÍTEMS.

   convertirCotizacionAOrden creaba la OT con una descripción de texto y
   CERO ot_items: al facturarla no había desglose. Ahora copia cada línea, y
   el descuento global de la cotización va como línea negativa para que la
   suma de ot_items (lo que factura la OT) sea igual al total cotizado. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const inserts = [], updates = [], deletes = [];
const tabla = nombre => ({
  insert: async filas => { inserts.push([nombre, filas]); return { error: null }; },
  update: v => ({ eq: async () => { updates.push([nombre, v]); return { error: null }; } }),
  delete: () => ({ eq: async () => { deletes.push(nombre); return { error: null }; } }),
  select: () => ({ eq() { return this; } }),
});
const ctx = { console, window: { Auth: { tenant: { id: 'T1' } } }, SUPABASE_URL: 'x', SUPABASE_KEY: 'k',
  supabase: { createClient: () => ({ from: tabla }) } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/core/db.js'), 'utf8') + '\n;this.__DB = DB;', ctx);
const DB = ctx.__DB;

/* 2 líneas (la 2ª con 10% de descuento de línea) + 5% de descuento global */
const items = [
  { descripcion: 'Cambio de aceite', cantidad: 1, precio_unit: 200, total: 200 },
  { descripcion: 'Filtro', cantidad: 2, precio_unit: 50, total: 90 },
];
const total = 290 - 14.5;
DB.getCotizacion = async () => ({ id: 'C1', num: 'COT-1', cliente_id: 'CL', vehiculo_id: 'V', total, cotizacion_items: items });
DB.upsertOrden = async () => ({ data: { id: 'OT1' }, error: null });

(async () => {
  const r = await DB.convertirCotizacionAOrden('C1');
  const ins = inserts.find(i => i[0] === 'ot_items');
  ok('devuelve la OT', r.data?.id === 'OT1');
  ok('inserta ot_items', !!ins);
  const filas = ins ? ins[1] : [];
  ok('copia las N líneas (+1 de descuento global)', filas.length === items.length + 1);
  ok('cada línea apunta a la OT y al tenant', filas.every(f => f.orden_id === 'OT1' && f.tenant_id === 'T1'));
  ok('precio unitario neto de la línea con descuento (90/2 = 45)', filas[1].precio_unit === 45 && filas[1].cantidad === 2);
  const suma = Math.round(filas.reduce((s, f) => s + f.total, 0) * 100) / 100;
  ok('la suma de ot_items es igual al total cotizado', suma === total);
  ok('la cotización queda marcada convertida', updates.some(u => u[0] === 'cotizaciones' && u[1].convertida_orden_id === 'OT1'));
  console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
  process.exitCode = fallidas ? 1 : 0;
})();
