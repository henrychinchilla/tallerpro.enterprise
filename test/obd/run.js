/* Corre todas las pruebas del módulo OBD y devuelve un código de salida útil.

   Cada archivo se ejecuta en su propio proceso: comparten el mismo sandbox de
   `vm` pero no el estado, y una prueba que deja el módulo a medias (un flag de
   transporte sin restaurar, por ejemplo) no puede ensuciar a la siguiente. Eso
   ya pasó una vez: una suite fijaba `_via` tarde y la de al lado tomaba el
   camino equivocado.

   Uso:  npm test                          (desde la raíz del repo) */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const suites = fs.readdirSync(dir)
  .filter(f => f.endsWith('.js') && f !== 'run.js' && f !== 'harness.js')
  .sort();

let fallaron = 0, totalPass = 0, totalFail = 0;

for (const s of suites) {
  console.log('\n── ' + s.replace('.js', '') + ' ──');
  let salida = '';
  try {
    salida = execFileSync(process.execPath, [path.join(dir, s)], { encoding: 'utf8' });
  } catch (e) {
    /* Código de salida distinto de 0: hubo FAIL, o el archivo se cayó. En los
       dos casos hay que mostrar lo que alcanzó a imprimir. */
    salida = (e.stdout || '') + (e.stderr || '');
    fallaron++;
  }
  process.stdout.write(salida);
  totalPass += (salida.match(/^PASS /gm) || []).length;
  totalFail += (salida.match(/^FAIL /gm) || []).length;
}

console.log('\n═══════════════════════════════════');
console.log(`${suites.length} suites · ${totalPass} pasadas · ${totalFail} fallidas`);
if (fallaron || totalFail) {
  console.log(`${fallaron} suite(s) con fallos`);
  process.exit(1);
}
console.log('todo en verde');
