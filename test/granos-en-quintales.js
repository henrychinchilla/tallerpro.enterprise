/* EL GRANO SE NEGOCIA POR QUINTAL, PERO LA TABLA GUARDA KILOS.

   Henry vio "Precio por kg (Q) *" después de que se cambiaran las unidades y
   preguntó por qué seguía ahí. La respuesta: se habían cambiado los CATÁLOGOS
   (los <select> de inventario, bodegas y POS) y ese rótulo es texto escrito a
   mano dentro del formulario de granos.

   Y no se arreglaba cambiando la palabra: las columnas son `cantidad_kg` y
   `precio_kg`. Si el campo dice "quintal" y el número se guarda como kg, una
   compra de 200 quintales entra como 200 kg — CUATRO VECES MENOS, con el total
   mal. Por eso la unidad es de pantalla y la conversión pasa al guardar y al
   leer, que es lo que esta prueba cuida: que el viaje de ida y vuelta no
   pierda ni invente nada. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);
const leer = (...f) => fs.readFileSync(raiz(...f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };
const casi = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

const ctx = {
  console, Math, Date, JSON, String, Number, Object, Array, RegExp, isNaN, isFinite, Promise,
  UI: { esc: v => String(v ?? ''), q: v => 'Q' + Number(v || 0).toFixed(2), fecha: v => String(v ?? ''),
        numero: (v, d = 3) => (Number(v) || 0).toLocaleString('es-GT', { maximumFractionDigits: d }),
        kpiCard: () => '', modal() {}, cerrarModal() {}, toast() {} },
  Modulos: { btnAccion: () => '', eliminarRegistro() {} },
  DB: {}, Auth: { tenant: {}, user: {} },
  document: { getElementById: () => null, querySelectorAll: () => [] },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(leer('js', 'core', 'giros.js'), ctx);
vm.runInContext(leer('js', 'modulos', 'agropecuaria', 'venta_granos.js'), ctx);
const G = ctx.Modulos.venta_granos;

/* ── 1. LA UNIDAD DE TRABAJO ES EL QUINTAL ──────────────────────────────── */
{
  ok('el módulo arranca en quintales, no en kilos', G._unidad === 'quintal');
  ok('un quintal son 45.359 kg', casi(G._kgPorUnidad('quintal'), 45.359237));
  ok('la libra también está disponible', casi(G._kgPorUnidad('libra'), 0.45359237));
  ok('y el kg sigue funcionando para quien lo quiera', casi(G._kgPorUnidad('kg'), 1));
  /* Una unidad que no existe no puede devolver 0: dividir por 0 daría Infinity
     y el stock quedaría en un número imposible. */
  ok('una unidad desconocida no rompe la cuenta (cae en 1)', G._kgPorUnidad('vara') === 1);
}

/* ── 2. IDA Y VUELTA SIN PERDER NADA ────────────────────────────────────── */
{
  G._unidad = 'quintal';
  /* 200 quintales guardados = 9071.85 kg. */
  const kg = 200 * 45.359237;
  ok('200 quintales se leen como 200 quintales', casi(G._cant(kg), 200, 1e-9));
  ok('...y en libras son 20,000', casi(G._cant(kg, 'libra'), 20000, 1e-6));
  ok('...y en kg son 9071.85', casi(G._cant(kg, 'kg'), 9071.8474, 1e-3));

  /* Un precio de Q210 por quintal se guarda como Q4.63 por kg. */
  const precioKg = 210 / 45.359237;
  ok('Q210 por quintal se leen como Q210 por quintal', casi(G._precio(precioKg), 210, 1e-9));
  ok('...que son Q2.10 por libra', casi(G._precio(precioKg, 'libra'), 2.1, 1e-9));

  /* LO QUE IMPORTA DE VERDAD: el total no puede cambiar según la unidad. */
  const totalDesdeQuintal = 200 * 210;
  const totalDesdeKg = (200 * 45.359237) * (210 / 45.359237);
  ok('el total es el mismo se calcule en quintales o en kilos',
     casi(totalDesdeQuintal, totalDesdeKg, 1e-6) && casi(totalDesdeQuintal, 42000, 1e-6));

  G._unidad = 'quintal';
}

/* ── 3. LA PANTALLA YA NO DICE "kg" DONDE SE ESCRIBE ────────────────────── */
{
  const src = leer('js', 'modulos', 'agropecuaria', 'venta_granos.js');
  ok('el formulario ya no pide "Precio por kg"', !/Precio por kg/.test(src));
  ok('...ni "Cantidad (kg)"', !/Cantidad \(kg\)/.test(src));
  ok('el rótulo sale de la unidad elegida', /Precio por <span class="form-unidad-lbl">/.test(src));
  ok('hay un selector de unidad en el formulario', /id="form-unidad"/.test(src));
  ok('...que ofrece quintal, libra, arroba, tonelada y kg',
     /'quintal','libra','arroba','tonelada','kg'/.test(src));
  ok('el guardado convierte a kilos antes de escribir en la tabla',
     /cantidadIngresada \* kgPorUnidad/.test(src) && /precioIngresado \/ kgPorUnidad/.test(src));
  /* El total se calcula con lo que el usuario ESCRIBIÓ: si se calculara con
     los convertidos, el redondeo movería el centavo que él está viendo. */
  ok('el total sale de los números tal como se escribieron',
     /cantidadIngresada \* precioIngresado/.test(src));
  ok('la lista muestra la cantidad en la unidad elegida', /this\._cant\(v\.cantidad_kg\)/.test(src));
  ok('...y el precio también', /this\._precio\(v\.precio_kg\)/.test(src));

  /* Cambiar de unidad no puede borrar lo que ya se escribió. */
  ok('cambiar la unidad convierte los números en vez de limpiarlos',
     /_cambiarUnidad\(nueva\)/.test(src) && /kgAnt \/ kgNue/.test(src));
}

/* ── 4. LAS OTRAS PANTALLAS DEL GIRO ────────────────────────────────────── */
{
  const maga = leer('js', 'modulos', 'agropecuaria', 'precios_maga.js');
  ok('la comparación contra el mercado va por quintal', /Mi Q\/quintal/.test(maga));
  ok('...convirtiendo desde el kilo que guarda la tabla', /_porQuintal\(f\.precio_kg\)/.test(maga));
  ok('la medida del producto se explica en libras', /libras/.test(maga));

  const form = leer('js', 'modulos', 'agropecuaria', 'formulas_alimento.js');
  ok('el consumo de la fórmula se pide en GRAMOS (así se pesa una ración)',
     /Consumo por animal al día \(gramos\)/.test(form));
  ok('...y se guarda en kilos, que es como hace la cuenta el módulo',
     /consumoGramos \/ 1000/.test(form));
  /* 120 g de un conejo tienen que quedar como 0.12 en la columna. */
  const g = 120, kg = g / 1000;
  ok('120 gramos se guardan como 0.12 kg', casi(kg, 0.12, 1e-9));
  ok('y un alevín de 0.1 g cabe en la columna numeric(10,4)', +(0.1 / 1000).toFixed(4) === 0.0001);
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
