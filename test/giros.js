/* Catálogo de giros de negocio.

   Esto es la pieza de la que cuelgan Inventario, Proveedores, POS y los
   módulos verticales, así que un error acá se multiplica por cinco pantallas.

   Lo que de verdad puede doler: las EQUIVALENCIAS. Un quintal mal convertido
   descuadra la bodega y factura de menos; y peor, convertir lo que no se puede
   convertir —un metro lineal a kilos— produce un número que parece dato. Eso
   se prueba a mano con los valores reales de Guatemala. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'giros.js'), 'utf8'), ctx);
const { GIROS, convertirUnidad, girosDelTenant, giroPorDefecto } = ctx;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── Equivalencias guatemaltecas ────────────────────────────────────────── */
ok('un quintal son 100 libras', Math.abs(convertirUnidad(1, 'quintal', 'libra') - 100) < 1e-9);
ok('un quintal son 45.359 kg', Math.abs(convertirUnidad(1, 'quintal', 'kg') - 45.359237) < 1e-6);
ok('una arroba son 25 libras', Math.abs(convertirUnidad(1, 'arroba', 'libra') - 25) < 1e-9);
ok('una tonelada son 22.046 quintales', Math.abs(convertirUnidad(1, 'tonelada', 'quintal') - 22.0462) < 0.001);
ok('12.5 quintales son 1250 libras', Math.abs(convertirUnidad(12.5, 'quintal', 'libra') - 1250) < 1e-9);
ok('ida y vuelta no pierde nada',
   Math.abs(convertirUnidad(convertirUnidad(7.3, 'quintal', 'kg'), 'kg', 'quintal') - 7.3) < 1e-9);

/* Lo que NO se puede convertir tiene que devolver null, no un número. */
ok('un metro lineal NO se convierte a kilos', convertirUnidad(3, 'metro lineal', 'kg') === null);
ok('un cilindro tampoco', convertirUnidad(1, 'cilindro', 'libra') === null);
ok('un saco tampoco: no es peso fijo', convertirUnidad(1, 'saco', 'quintal') === null);
ok('basura no revienta', convertirUnidad('x', 'quintal', 'kg') === null);

/* ── Cada giro tiene lo que necesita ────────────────────────────────────── */
for (const [id, g] of Object.entries(GIROS)) {
  ok(`${id} tiene etiqueta, unidades y categorías`,
     !!g.label && Array.isArray(g.unidades) && g.unidades.length > 0
     && Array.isArray(g.categorias) && Array.isArray(g.campos));
  const ids = g.campos.map(c => c.id);
  ok(`${id} no repite el id de un campo`, ids.length === new Set(ids).size);
  ok(`${id} declara el tipo de todos sus campos`,
     g.campos.every(c => ['texto', 'entero', 'decimal', 'lista', 'fecha'].includes(c.tipo)));
  ok(`${id}: las listas traen opciones`,
     g.campos.filter(c => c.tipo === 'lista').every(c => Array.isArray(c.opciones) && c.opciones.length));
}

/* ── Las unidades que importan, donde importan ──────────────────────────── */
ok('granos se mide en quintales', GIROS.granos.unidades.includes('quintal'));
ok('granos NO ofrece "pieza": el maíz no se cuenta en piezas', !GIROS.granos.unidades.includes('pieza'));
ok('refrigeración cobra el gas por libra', GIROS.refrigeracion.unidades.includes('libra'));
ok('y también maneja el cilindro como envase', GIROS.refrigeracion.unidades.includes('cilindro'));
ok('herrería vende por metro lineal', GIROS.herreria.unidades.includes('metro lineal'));
ok('peletería vende por yarda', GIROS.peleteria.unidades.includes('yarda'));
ok('el maicillo aparece como categoría de granos',
   GIROS.granos.categorias.some(c => /maicillo/i.test(c)));

/* ── Los campos del taller son columnas, no jsonb ───────────────────────── */
{
  const cols = GIROS.mecanico.campos.filter(c => c.col).map(c => c.id);
  ok('los campos mecánicos van a sus columnas de siempre',
     cols.includes('compat_marca') && cols.includes('num_parte_oem') && cols.length === GIROS.mecanico.campos.length);
  /* Los demás giros NO tienen columna propia: si alguno se marcara `col`, se
     guardaría en una columna que no existe y el guardado fallaría entero. */
  const otros = Object.entries(GIROS).filter(([id]) => id !== 'mecanico');
  ok('ningún otro giro pretende tener columnas propias',
     otros.every(([, g]) => g.campos.every(c => !c.col)));
}

/* ── Qué giros ve cada comercio ─────────────────────────────────────────── */
{
  ok('una venta de granos ve el giro granos',
     girosDelTenant(['venta_granos', 'pos']).includes('granos'));
  ok('...y no le aparece el de refrigeración',
     !girosDelTenant(['venta_granos', 'pos']).includes('refrigeracion'));
  ok('un comercio con granos Y electrónica ve los dos', (() => {
    const g = girosDelTenant(['venta_granos', 'electronica']);
    return g.includes('granos') && g.includes('electronica');
  })());
  ok('"general" siempre está disponible', girosDelTenant(['venta_granos']).includes('general'));
  /* Un comercio sin ningún vertical es un taller: es como nació la app y hay
     que dejarle sus campos, no un inventario pelado. */
  ok('sin verticales, el comercio es taller', giroPorDefecto(['clientes', 'pos']) === 'mecanico');
  ok('El Granjero (granos) arranca en el giro granos', giroPorDefecto(['venta_granos', 'pos']) === 'granos');
  ok('no revienta sin módulos', Array.isArray(girosDelTenant(null)));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
