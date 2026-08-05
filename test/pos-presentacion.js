/* Presentación del POS al estilo del de DoctorPro.

   Dos cosas se prueban acá, y la segunda es la que importa de verdad:

   1) Que las piezas del sistema visual existan (chips con conteo, tarjetas con
      badge de stock, barra de atajos) y que la hoja de estilo se cargue.

   2) QUE LOS ATAJOS QUE SE ANUNCIAN EXISTAN. La barra dice F2/F4/Esc y que el
      escáner agrega solo. Un atajo pintado que no hace nada es peor que no
      pintarlo: el cajero lo intenta, no pasa nada, y desconfía del resto. */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const pos = fs.readFileSync(path.join(raiz, 'js', 'pos', 'pos.js'), 'utf8');
const css = fs.readFileSync(path.join(raiz, 'css', 'pos-polish.css'), 'utf8');
const html = fs.readFileSync(path.join(raiz, 'pos.html'), 'utf8');
const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── La hoja de estilo llega al navegador ───────────────────────────────── */
{
  ok('pos.html enlaza la capa de presentación', /css\/pos-polish\.css/.test(html));
  ok('carga Plus Jakarta Sans (cuerpo)', /Plus\+Jakarta\+Sans/.test(html));
  ok('carga Outfit (títulos y montos)', /family=Outfit|&family=Outfit/.test(html));
  /* Si no está en el precache, tras un deploy el SW sirve la página nueva con
     la hoja vieja y el POS se ve a medio pintar. */
  ok('el Service Worker precachea la hoja', /css\/pos-polish\.css/.test(sw));
}

/* ── Las piezas visuales ────────────────────────────────────────────────── */
{
  ['.fpos-search', '.fpos-chips', '.fpos-chip', '.fpos-grid', '.fpos-card',
   '.fpos-stock', '.fpos-teclas', '.fpos-cobrar'].forEach(c =>
    ok(`la hoja define ${c}`, css.includes(c)));

  ok('el badge de stock tiene los tres estados', /\.fpos-stock\.ok/.test(css) &&
     /\.fpos-stock\.low/.test(css) && /\.fpos-stock\.out/.test(css));
  ok('los tres estados se distinguen en tema oscuro',
     /data-theme="dark"\]\s*\.fpos-stock\.ok/.test(css));
  ok('el POS usa las clases nuevas en la rejilla', /class="fpos-grid"/.test(pos));
  ok('la tarjeta marca el agotado como no clicable', /fpos-card \$\{sinStock \? 'off'/.test(pos));
  ok('el agotado no lleva onclick', /\$\{sinStock \? '' : `onclick=/.test(pos));
}

/* ── Los chips dicen CUÁNTOS hay ────────────────────────────────────────── */
{
  ok('existe el repintado de chips', /_pintarChips\s*\(\)/.test(pos));
  ok('el chip lleva su conteo en un <small>', /<small>\$\{n\}<\/small>/.test(pos));
  /* El conteo se calcula sobre lo ya filtrado por texto: al buscar "aceite",
     cada categoría debe decir cuántos aceites tiene, no su total. */
  ok('el conteo respeta el buscador', /const base = this\._filtrados\(\)/.test(pos));
  ok('...y se calcula sin la categoría activa (si no, las demás darían cero)',
     /this\._cat = '';[\s\S]{0,80}_filtrados\(\)/.test(pos));
  ok('los chips se repintan junto con la rejilla',
     /_pintarGrid\(\) \{[\s\S]*?this\._pintarChips\(\);[\s\S]{0,20}\},/.test(pos));
}

/* ── LOS ATAJOS ANUNCIADOS EXISTEN ──────────────────────────────────────── */
{
  ok('la barra anuncia F2, F4 y Esc',
     /<kbd>F2<\/kbd>/.test(pos) && /<kbd>F4<\/kbd>/.test(pos) && /<kbd>Esc<\/kbd>/.test(pos));

  ok('hay un manejador de teclado', /_cablearAtajos\s*\(\)/.test(pos));
  ok('se cablea al renderizar el POS', /this\._cablearAtajos\(\)/.test(pos));
  ok('no se cablea dos veces (render corre varias veces)', /_atajosListos/.test(pos));

  const fn = pos.slice(pos.indexOf('_cablearAtajos()'), pos.indexOf('_agregarPorBusqueda()'));
  ok('F2 lleva el foco al buscador', /'F2'/.test(fn) && /pos-busca/.test(fn));
  ok('F4 cobra', /'F4'/.test(fn) && /this\.cobrar\(\)/.test(fn));
  ok('Esc limpia la búsqueda', /'Escape'/.test(fn));
  ok('F4 con el carrito vacío avisa en vez de cobrar nada',
     /this\._cart\.length \? [\s\S]{0,40}cobrar[\s\S]{0,120}vacío/i.test(fn) ||
     /if \(this\._cart\.length\) this\.cobrar\(\)/.test(fn));
  ok('los atajos no se disparan fuera del POS', /pos-grid'\)\) return/.test(fn));
}

/* ── El escáner de código de barras ─────────────────────────────────────── */
{
  ok('la barra dice que el escaneo agrega solo', /se agrega solo/.test(pos));
  ok('existe la función que lo hace', /_agregarPorBusqueda\s*\(\)/.test(pos));

  const fn = pos.slice(pos.indexOf('_agregarPorBusqueda()'));
  /* Un escáner manda el código completo y un Enter. Si además hubiera un
     producto cuyo NOMBRE contiene ese código, agregar el equivocado sería peor
     que no agregar nada: por eso la coincidencia exacta de código manda. */
  ok('prioriza la coincidencia exacta de código sobre el nombre',
     /codigo_barras \|\| ''\)\.toLowerCase\(\) === b/.test(fn));
  ok('con varias coincidencias NO adivina', /Sin coincidencias|elegí una/.test(fn));
  ok('no agrega algo sin stock', /sin stock/i.test(fn));
  ok('limpia el buscador para el siguiente escaneo', /this\._busca = ''/.test(fn));
}

/* ── Responsivo ─────────────────────────────────────────────────────────── */
{
  ok('la rejilla se adapta sola al ancho', /repeat\(auto-fill, minmax\(158px/.test(css));
  ok('en teléfono las tarjetas se achican', /max-width: 600px[\s\S]{0,220}minmax\(132px/.test(css));
  /* En teléfono no hay teclado físico: la barra de atajos sólo roba alto. */
  ok('la barra de atajos se oculta en teléfono',
     /max-width: 920px\)\s*\{\s*\.fpos-teclas\s*\{\s*display:\s*none/.test(css));
  ok('respeta a quien pidió menos animación', /prefers-reduced-motion/.test(css));
  ok('el POS sigue apilando las dos columnas en móvil',
     /@media \(max-width: 920px\)[\s\S]{0,400}\.pos-layout \{ grid-template-columns:1fr; \}/.test(pos));
}

/* ── Nada de datos sin escapar en la tarjeta ────────────────────────────── */
{
  /* Se recorta por la firma con llave: `POS._pintarGrid()` aparece antes en
     el oninput del buscador, y anclar ahí dejaba el recorte vacío. */
  const fn = pos.slice(pos.indexOf('_tarjetaProducto(p) {'), pos.indexOf('_pintarGrid() {'));
  /* Este fue un caso REAL: ${p.nombre} salía crudo y el primer detector de
     XSS no lo vio porque la plantilla tenía otras anidadas dentro. */
  ok('el nombre del producto va escapado', /UI\.esc\(p\.nombre\)/.test(fn));
  ok('el código también', /UI\.esc\(codigo\)/.test(fn));
  ok('la unidad de medida también', /UI\.esc\(p\.unidad_medida\)/.test(fn));
  ok('la URL de la imagen va codificada', /encodeURI\(p\.imagen_url\)/.test(fn));
  ok('no queda ningún ${p.nombre} crudo en el POS', !/\$\{p\.nombre\}/.test(pos));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
