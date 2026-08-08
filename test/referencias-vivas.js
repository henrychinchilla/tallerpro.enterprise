/* MÉTODOS QUE NO EXISTEN, ESCRITOS DENTRO DE UNA PLANTILLA.

   Esta prueba existe por una pregunta de Henry que merecía una respuesta con
   número: "¿cuándo vamos a parar de tener siempre más bugs?".

   Los dos que la motivaron:
     · `UI.escUI.jsAttr(...)` en formulas_alimento.js — rompía la pantalla de
       fórmulas entera al pintar la lista de insumos.
     · `UI.numero(...)` en venta_granos.js — el método nunca se escribió, así
       que la lista de transacciones de granos reventaba en la primera fila.

   POR QUÉ NINGUNA RED LOS ATRAPABA, que es lo que de verdad importa:
     · `node --check` no los ve: `UI.escUI.jsAttr(x)` es sintaxis VÁLIDA. El
       error es de ejecución, no de gramática.
     · Las demás pruebas del repo leen el código como TEXTO y le pasan
       expresiones regulares. Nunca ejecutan la pantalla, así que una llamada a
       un método inexistente les parece una cadena más.
   Resultado: sólo reventaban cuando un usuario abría esa pantalla. Eso no es
   mala suerte, es un hueco de método — y esta prueba lo tapa.

   Cómo funciona: junta los miembros declarados de los objetos singleton (UI,
   DB) y busca en TODO js/ cualquier `UI.algo` / `DB.algo` que no esté entre
   ellos. Es estático y barato, así que corre en cada cambio.

   Si agregás un método asignado en runtime (`UI.x = ...`), la prueba lo cuenta
   como declarado: se leen también esas asignaciones. */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* Todos los .js de la app (no las pruebas ni node_modules). */
const archivos = [];
(function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p);
    else if (e.name.endsWith('.js')) archivos.push(p);
  }
})(path.join(raiz, 'js'));

/* Miembros de un objeto declarado como literal:
     nombre(args) {   |   nombre: valor   |   async nombre(args) {
   más los que se cuelgan después (UI.algo = ...). */
function miembrosDe(texto) {
  const s = new Set();
  let m;
  const literal = /^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*[:(]/gm;
  while ((m = literal.exec(texto))) s.add(m[1]);
  const asignado = /^\s*(?:UI|DB)\.([A-Za-z_$][\w$]*)\s*=/gm;
  while ((m = asignado.exec(texto))) s.add(m[1]);
  return s;
}

const OBJETOS = {
  UI: miembrosDe(fs.readFileSync(path.join(raiz, 'js', 'core', 'ui.js'), 'utf8')),
  DB: miembrosDe(fs.readFileSync(path.join(raiz, 'js', 'core', 'db.js'), 'utf8')),
};

/* Se ignoran las cadenas que sólo NOMBRAN el método (mensajes de error, este
   mismo comentario) mirando que venga seguido de `(` o `.`: lo que interesa es
   la llamada, no la mención. */
const hallazgos = [];
for (const archivo of archivos) {
  const rel = path.relative(raiz, archivo).replace(/\\/g, '/');
  fs.readFileSync(archivo, 'utf8').split('\n').forEach((linea, i) => {
    for (const [obj, declarados] of Object.entries(OBJETOS)) {
      const re = new RegExp(`\\b${obj}\\.([A-Za-z_$][\\w$]*)\\s*[.(]`, 'g');
      let m;
      while ((m = re.exec(linea))) {
        if (declarados.has(m[1])) continue;
        hallazgos.push(`${rel}:${i + 1}  ${obj}.${m[1]}`);
      }
    }
  });
}

ok(`ningún método inexistente de UI/DB (encontrados: ${hallazgos.length})`, hallazgos.length === 0);
hallazgos.forEach(h => console.log('        ↳ ' + h));

/* ── La prueba tiene que poder fallar ────────────────────────────────────────
   Una guardia que no se verifica a la inversa es una que tranquiliza y no
   cuida: se comprueba que el detector SÍ enrojece con el bug real que lo
   motivó. Sin esto, un cambio que rompa el detector pasaría como "verde". */
{
  const declarados = OBJETOS.UI;
  const detecta = (linea) => {
    const re = /\bUI\.([A-Za-z_$][\w$]*)\s*[.(]/g;
    let m; while ((m = re.exec(linea))) if (!declarados.has(m[1])) return true;
    return false;
  };
  ok('el detector marca el bug que lo motivó (UI.escUI.jsAttr)',
     detecta("`${UI.escUI.jsAttr(i.nombre)}`") === true);
  ok('...y el otro (UI.numero antes de existir)',
     detecta('${UI.metodoQueNoExiste(v.cantidad_kg)}') === true);
  ok('y NO marca los que sí existen', detecta('${UI.esc(x)} ${UI.q(y)}') === false);
}

/* ── Los formateadores que la app usa de verdad ─────────────────────────────
   UI.numero se llamaba desde granos sin existir. Se prueba lo que hace, no
   sólo que esté: un formateador que redondea kilos a enteros descuadra el
   inventario, que guarda numeric(14,3). */
{
  const src = fs.readFileSync(path.join(raiz, 'js', 'core', 'ui.js'), 'utf8');
  const m = src.match(/\n  numero\(n, decimales = 3\) \{[\s\S]*?\n  \},/);
  ok('UI.numero existe', !!m);
  if (m) {
    const numero = new Function('return function ' + m[0].trim().replace(/,$/, ''))();
    ok('formatea kilos con decimales', numero(12.5) === '12.5');
    ok('no redondea las fracciones chicas del inventario', numero(0.125) === '0.125');
    ok('null no revienta ni imprime "null"', numero(null) === '0');
    ok('no le pone Q (no es dinero)', !/Q/.test(numero(1500)));
  }
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
