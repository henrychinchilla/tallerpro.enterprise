/* Validación de Docs.subirArchivo() antes de tocar red/crypto: un archivo
   rechazado (tipo o tamaño) debe fallar ANTES del hash/upload, no a medias. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, crypto: {}, getSB: () => ({}), getTID: () => 't1', Auth: {} };
ctx.window = ctx;
vm.createContext(ctx);
/* docs.js no expone `window.Docs` (a diferencia de giros.js): en el navegador
   basta con que sea un `const` de script-scope, varios <script> lo comparten.
   Acá se recupera evaluando el identificador como última expresión. */
const Docs = vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'docs.js'), 'utf8') + '\nDocs;', ctx);

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

(async () => {
  const sinArchivo = await Docs.subirArchivo('cliente', 'c1', 'dpi', 'DPI', null);
  ok('sin archivo, rechaza antes de tocar crypto/red', !!sinArchivo.error);

  const tipoInvalido = await Docs.subirArchivo('cliente', 'c1', 'dpi', 'DPI', { type: 'application/zip', size: 100 });
  ok('un .zip se rechaza (solo foto o PDF)', !!tipoInvalido.error);
  ok('el mensaje explica qué sí se acepta', /foto|PDF/i.test(tipoInvalido.error.message));

  const muyGrande = await Docs.subirArchivo('cliente', 'c1', 'dpi', 'DPI', { type: 'image/jpeg', size: 20 * 1024 * 1024 });
  ok('una foto de 20MB se rechaza (tope 15MB)', !!muyGrande.error);

  ok('las 4 extensiones soportadas están mapeadas',
     ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].every(t => Docs._EXT_POR_TIPO[t]));

  console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
  process.exitCode = fallidas ? 1 : 0;
})();
