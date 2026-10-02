/* "VOLVER AL PANEL SAAS" TIENE QUE PINTAR EL PANEL.

   salirSoporte fijaba App.paginaActual = 'superadmin' y DESPUÉS llamaba
   navegarA('superadmin'). navegarA ve "ya estoy ahí", y como el Panel SaaS
   tiene sub-menú lo toma por un clic para contraerlo: retorna sin pintar.
   Quedaba el Dashboard del comercio con la ruta del panel, y ni volver a
   navegar lo arreglaba (solo un F5). Encontrado corriendo la demo E2E en el
   Chrome de Henry, 2026-10-01; el arreglo se verificó ahí mismo. */
const fs = require('fs');
const path = require('path');
const sa = fs.readFileSync(path.join(__dirname, '..', 'js/modulos/admin/superadmin.js'), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const cuerpo = n => sa.slice(sa.indexOf(n), sa.indexOf('\n  },', sa.indexOf(n)));
for (const f of ['async salirSoporte', 'async entrarComercio']) {
  const c = cuerpo(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  ok(`${f}: no fija App.paginaActual (navegarA lo hace)`, !/App\.paginaActual\s*=/.test(c));
  ok(`${f}: navega con App.navegarA`, /App\.navegarA\(/.test(c));
}
ok('salirSoporte vuelve a la pestaña Comercios', /this\._tab = 'comercios';\s*\n\s*App\.navegarA\('superadmin'\)/.test(cuerpo('async salirSoporte')));

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
