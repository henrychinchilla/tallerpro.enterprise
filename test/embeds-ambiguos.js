/* ÓRDENES: EL EMBED DE EMPLEADOS VA CALIFICADO.

   `ordenes` tiene DOS llaves hacia `empleados` (mecanico_id y tecnico_id).
   Un `empleados(nombre)` a secas es ambiguo: PostgREST responde PGRST201
   (HTTP 300) y la consulta entera vuelve null. Lo encontró la demo E2E el
   2026-10-01: la lista de OTs salía vacía, el Dashboard decía "0 órdenes" y
   Facturar una OT no hacía nada, en silencio. Y facturaDeOrden contaba las
   facturas ANULADAS, al revés que el índice de la mig 151. */
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const archivos = [];
const recorrer = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) recorrer(p); else if (e.name.endsWith('.js')) archivos.push(p);
});
recorrer(path.join(raiz, 'js'));

/* Pares tabla → destino con MÁS DE UNA llave en la BD (consulta a
   pg_constraint del 2026-10-01). Un embed a secas entre ellos es ambiguo.
   Si se agrega una segunda llave hacia una tabla ya embebida, va aquí. */
const PARES = [['agroservicio_servicios','ordenes'],['cajas_pos','usuarios'],['envios','bodegas'],['ingresos','ordenes'],
  ['ordenes','empleados'],['traslados','bodegas'],['traslados','documentos'],['viaticos','empleados']];
const ambiguos = [];
for (const f of archivos) {
  const L = fs.readFileSync(f, 'utf8').split('\n');
  L.forEach((l, i) => {
    for (const [t, d] of PARES) {
      if (!l.includes(`from('${t}')`)) continue;
      if (new RegExp(`[,(\\s'\`]${d}\\(`).test(L.slice(i, i + 3).join(' ')))
        ambiguos.push(`${path.relative(raiz, f)}:${i + 1} (${t} → ${d})`);
    }
  });
}
ok('ningún embed ambiguo (tabla con 2+ llaves al mismo destino) sin nombrar la llave' + (ambiguos.length ? ': ' + ambiguos.join(', ') : ''), !ambiguos.length);

const db = fs.readFileSync(path.join(raiz, 'js/core/db.js'), 'utf8');
const fn = n => db.slice(db.indexOf(n), db.indexOf('\n  },', db.indexOf(n)));
ok('getOrden ya no se traga el error', /if \(error\) console\.error\('getOrden:/.test(fn('async getOrden(')));
ok('getOrdenes ya no se traga el error', /if \(error\) console\.error\('getOrdenes:/.test(fn('async getOrdenes(')));
ok('facturaDeOrden no cuenta las anuladas', /\.neq\('estado', 'anulada'\)/.test(fn('async facturaDeOrden(')));
ok('el humo marca las respuestas 300 (PGRST201)',
   /r\.status\(\) !== 300/.test(fs.readFileSync(path.join(raiz, 'test/humo/ayuda.mjs'), 'utf8')));

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
