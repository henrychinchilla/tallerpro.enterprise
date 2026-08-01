/* Proveedores por giro.

   Mismo riesgo que en Inventario: al comercio de granos se le ofrecían
   categorías de taller ("Repuestos Automotriz", "Compresores y Partes A/C") y
   ninguna de grano. Y una pantalla de proveedores rota deja al comercio sin
   poder registrar a quién le compra, así que se verifica que el formulario
   entero se arme. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);
let htmlCapturado = '';

const ctx = {
  console,
  Modulos: { btnAccion: () => '' },
  UI: { esc: (v) => String(v === null || v === undefined ? '' : v), modal: (t, h) => { htmlCapturado = h; } },
  DB: { getProveedores: async () => [] },
  Auth: { tenant: { modulos_activos: ['venta_granos', 'pos'] }, user: { rol: 'admin' } },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  /* El modulo recuerda si se ve en tarjetas o en lista. */
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  setTimeout: (fn) => { try { fn(); } catch (_) {} },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'core', 'giros.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'modulos', 'operacion', 'proveedores.js'), 'utf8'), ctx);
const PROV = ctx.Modulos.proveedores;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── Categorías coherentes con el negocio ───────────────────────────────── */
{
  const granos = PROV._categorias('granos');
  ok('a un proveedor de granos se le ofrece "Maíz"', granos.some(c => /Ma[ií]z/.test(c)));
  ok('y NO se le ofrecen repuestos de motor', !granos.some(c => /Motor|Frenos|Suspensi/.test(c)));

  const mec = PROV._categorias('mecanico');
  ok('al de taller sí se le ofrecen frenos y motor', mec.some(c => /Motor/.test(c)) && mec.some(c => /Frenos/.test(c)));

  const refri = PROV._categorias('refrigeracion');
  ok('al de refrigeración, refrigerantes y compresores',
     refri.some(c => /Refrigerante/i.test(c)) && refri.some(c => /Compresor/i.test(c)));

  /* Sin giro elegido se ofrecen las de TODOS los giros del comercio: un
     proveedor puede surtir de todo y no hay que obligarlo a elegir uno. */
  const todas = PROV._categorias('');
  ok('sin giro se ofrecen las de todos los giros del comercio', todas.length > granos.length);
  ok('siempre quedan las genéricas (servicios, courier, otro)',
     todas.some(c => /Courier/i.test(c)) && todas.includes('Otro'));
  ok('no se repiten categorías', todas.length === new Set(todas).size);
}

/* ── El formulario se arma ──────────────────────────────────────────────── */
{
  let error = null;
  try { PROV.modalForm(); } catch (e) { error = e; }
  ok('el formulario de proveedor se arma sin error', !error && htmlCapturado.length > 500);
  ok('aparece el selector de giro', /id="prov-giro"/.test(htmlCapturado));
  ok('y la categoría ya no es la lista fija de taller', !/Repuestos Automotriz/.test(htmlCapturado));
  ok('no deja "undefined" a la vista', !/>undefined|value="undefined"/.test(htmlCapturado));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
