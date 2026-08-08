/* LAS MEDIDAS QUE SE USAN EN GUATEMALA.

   Henry las pidió por su nombre: gramos, litros, galones, quintales,
   toneladas, onzas, metros, yardas, pies, pulgadas, kilómetros, metros
   cuadrados, metros cúbicos, mililitros y vasos — "casi no usamos kilogramos".

   Lo que esta prueba cuida, en orden de qué tan caro sale equivocarse:

   1) QUE LAS EQUIVALENCIAS SEAN LAS REALES. Un galón mal puesto (el imperial
      británico son 4.546 l, el que se usa acá son 3.785) da 20% de diferencia
      en cada pipa de diésel. Una libra redondeada a 0.45 arrastra error en
      cada quintal.

   2) QUE NO SE MEZCLEN FAMILIAS. Tres galones no son metros. La respuesta
      correcta a eso es null, no un número.

   3) QUE NINGÚN GIRO OFREZCA UNA UNIDAD QUE NO EXISTE en el catálogo: si el
      dropdown de inventario ofrece "vara" y nada sabe cuánto es, el artículo
      queda con una unidad muerta.

   4) QUE EL KILOGRAMO SIGA SIENDO VÁLIDO aunque casi no se use. Borrarlo
      dejaría sin unidad a los artículos ya cargados con él, y editarlos se
      las cambiaría en silencio. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);
const leer = (...f) => fs.readFileSync(raiz(...f), 'utf8');

const ctx = { console, Math, Object, Array, String, Number, isFinite };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(leer('js', 'core', 'giros.js'), ctx);
const { GIROS, UNIDADES_GT, UNIDADES_TODAS, UNIDAD_KG, UNIDAD_L, UNIDAD_M,
        convertirUnidad, esUnidadDePeso } = ctx;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };
const casi = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

/* ── 1. ESTÁN TODAS LAS QUE PIDIÓ ───────────────────────────────────────── */
{
  /* En singular, que es como se guardan y como se leen en la etiqueta de un
     artículo ("stock 12 quintal"). */
  ['gramo', 'litro', 'galón', 'quintal', 'tonelada', 'onza', 'metro', 'yarda',
   'pie', 'pulgada', 'kilómetro', 'metro cuadrado', 'metro cúbico', 'mililitro', 'vaso']
    .forEach(u => ok(`el catálogo trae "${u}"`, UNIDADES_TODAS.includes(u)));

  /* Las que ya se usaban y no se pueden perder: el quintal son 100 LIBRAS y el
     módulo de fórmulas entero está armado sobre esa identidad. */
  ok('la libra sigue estando (el quintal son 100 libras)', UNIDADES_TODAS.includes('libra'));
  ok('la arroba también (frutas y café)', UNIDADES_TODAS.includes('arroba'));

  ok('el kilogramo sigue siendo válido (hay artículos cargados con él)',
     UNIDADES_TODAS.includes('kg') && !!UNIDAD_KG.kg);
  /* Pero deja de ser lo primero que ve el usuario. */
  const conKg = Object.values(GIROS).filter(g => g.unidades.includes('kg'));
  ok('...pero ya no lo ofrece ningún giro de primero',
     conKg.every(g => g.unidades.indexOf('kg') === g.unidades.length - 1));
  ok('...y el peso arranca en libra, no en kg', UNIDADES_GT.peso[0] === 'libra');
}

/* ── 2. LAS EQUIVALENCIAS SON LAS DE VERDAD ─────────────────────────────── */
{
  ok('un quintal son 100 libras', casi(convertirUnidad(1, 'quintal', 'libra'), 100, 1e-9));
  ok('una arroba son 25 libras', casi(convertirUnidad(1, 'arroba', 'libra'), 25, 1e-9));
  ok('una libra son 453.59237 gramos', casi(convertirUnidad(1, 'libra', 'gramo'), 453.59237, 1e-6));
  ok('una libra son 16 onzas', casi(convertirUnidad(1, 'libra', 'onza'), 16, 1e-9));
  ok('una tonelada son 22.046 quintales', casi(convertirUnidad(1, 'tonelada', 'quintal'), 22.0462, 1e-3));
  ok('un quintal son 45.359 kg', casi(convertirUnidad(1, 'quintal', 'kg'), 45.359237, 1e-6));

  /* EL GALÓN ES EL ESTADOUNIDENSE. El imperial (4.546 l) daría 20% de más. */
  ok('un galón son 3.785 litros', casi(convertirUnidad(1, 'galón', 'litro'), 3.785411784, 1e-9));
  ok('...y NO el imperial de 4.546', !casi(convertirUnidad(1, 'galón', 'litro'), 4.54609, 0.1));
  ok('un litro son 1000 mililitros', casi(convertirUnidad(1, 'litro', 'mililitro'), 1000, 1e-6));
  ok('un metro cúbico son 1000 litros', casi(convertirUnidad(1, 'metro cúbico', 'litro'), 1000, 1e-9));
  ok('un vaso son 250 ml (convención de cocina)', casi(convertirUnidad(1, 'vaso', 'mililitro'), 250, 1e-6));

  ok('una yarda son 0.9144 metros', casi(convertirUnidad(1, 'yarda', 'metro'), 0.9144, 1e-9));
  ok('una yarda son 3 pies', casi(convertirUnidad(1, 'yarda', 'pie'), 3, 1e-9));
  ok('un pie son 12 pulgadas', casi(convertirUnidad(1, 'pie', 'pulgada'), 12, 1e-9));
  ok('un kilómetro son 1000 metros', casi(convertirUnidad(1, 'kilómetro', 'metro'), 1000, 1e-9));
  ok('el metro lineal es el mismo metro', casi(convertirUnidad(5, 'metro lineal', 'metro'), 5, 1e-9));

  /* Cantidades reales, no sólo el 1. */
  ok('12.5 quintales son 1250 libras', casi(convertirUnidad(12.5, 'quintal', 'libra'), 1250, 1e-6));
  ok('55 galones (un tonel) son 208.2 litros', casi(convertirUnidad(55, 'galón', 'litro'), 208.198, 1e-3));
}

/* ── 3. NO SE MEZCLAN FAMILIAS ──────────────────────────────────────────── */
{
  ok('galones a metros = null (no son la misma cosa)', convertirUnidad(3, 'galón', 'metro') === null);
  ok('libras a litros = null', convertirUnidad(3, 'libra', 'litro') === null);
  ok('metros a quintales = null', convertirUnidad(3, 'metro', 'quintal') === null);
  ok('una unidad de conteo no se convierte a nada', convertirUnidad(3, 'caja', 'libra') === null);
  ok('una unidad inventada tampoco', convertirUnidad(3, 'vara', 'metro') === null);
  ok('texto que no es número = null', convertirUnidad('mucho', 'libra', 'onza') === null);
}

/* ── 4. NINGÚN GIRO OFRECE UNA UNIDAD MUERTA ────────────────────────────── */
{
  const huerfanas = [];
  Object.entries(GIROS).forEach(([id, g]) => {
    (g.unidades || []).forEach(u => { if (!UNIDADES_TODAS.includes(u)) huerfanas.push(`${id}: ${u}`); });
  });
  ok(`ningún giro ofrece una unidad fuera del catálogo (huérfanas: ${huerfanas.length})`, huerfanas.length === 0);
  huerfanas.forEach(h => console.log('        ↳ ' + h));

  ok('todos los giros ofrecen al menos una unidad', Object.values(GIROS).every(g => (g.unidades || []).length > 0));
  /* El giro general es el que ve un negocio sin vertical: tiene que traer
     TODO lo que Henry pidió, porque no se sabe qué vende. */
  const general = GIROS.general.unidades;
  ['gramo', 'litro', 'galón', 'quintal', 'tonelada', 'onza', 'metro', 'yarda', 'pie',
   'pulgada', 'kilómetro', 'metro cuadrado', 'metro cúbico', 'mililitro', 'vaso']
    .forEach(u => ok(`el giro general ofrece "${u}"`, general.includes(u)));
}

/* ── 5. LA BÁSCULA SE OFRECE POR PESO, Y SIN LISTAS COPIADAS ────────────── */
{
  ['libra', 'quintal', 'arroba', 'gramo', 'onza', 'tonelada', 'kg'].forEach(u =>
    ok(`el POS ofrece la báscula para "${u}"`, esUnidadDePeso(u) === true));
  ok('...y para las abreviaturas que escribe la gente (lb)', esUnidadDePeso('LB') === true);
  ok('no la ofrece para litros', esUnidadDePeso('litro') === false);
  ok('...ni para piezas', esUnidadDePeso('pieza') === false);
  ok('...ni para metros', esUnidadDePeso('metro') === false);
  ok('vacío no revienta', esUnidadDePeso('') === false);
  ok('null tampoco', esUnidadDePeso(null) === false);

  /* La regla vive en un solo lado: el POS no puede tener su propia lista, o se
     queda vieja el día que se agrega una unidad (le pasó al gramo). */
  const pos = leer('js', 'pos', 'pos.js');
  ok('el POS usa la función y no una copia de la lista',
     /esUnidadDePeso\(linea\.unidad\)/.test(pos) && !/const porPeso = \[/.test(pos));

  /* Y las bodegas tampoco: tenían cinco unidades escritas a mano. */
  const bod = leer('js', 'modulos', 'operacion', 'bodegas.js');
  ok('las bodegas ofrecen el catálogo completo, no cinco a mano',
     /UNIDADES_TODAS/.test(bod) && !/\['unidad','litro','kg','par','caja'\]/.test(bod));

  /* Cambiar las listas no puede cambiarle la unidad a un artículo ya cargado:
     el stock está contado en la vieja. */
  const inv = leer('js', 'modulos', 'operacion', 'inventario.js');
  ok('el inventario conserva la unidad del artículo aunque su giro ya no la ofrezca',
     /!perfil\.unidades\.includes\(u0\)/.test(inv));
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
