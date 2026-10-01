/* TODO BORRADO PIDE CONFIRMACIÓN.

   Recorre cada llamada que borra (DB.delete*, deleteRegistro, .delete()) en
   js/modulos y js/pos, y exige un confirm/UI.confirmar dentro de la misma
   función. Al auditarlo (2026-10-01) faltaba solo uno: quitar un ítem de la
   OT. Excepciones = borrados que no son acción del usuario (deshacer un alta
   fallida) o que ya confirmó el llamador. */
const fs = require('fs');
const path = require('path');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const raiz = path.join(__dirname, '..');
const EXCEPCIONES = [
  'js/modulos/admin/superadmin.js:guardarNuevoTaller',   // deshace el alta si falla el usuario admin
];
const archivos = [];
const recorrer = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) recorrer(p); else if (e.name.endsWith('.js')) archivos.push(p);
});
recorrer(path.join(raiz, 'js/modulos')); recorrer(path.join(raiz, 'js/pos'));

const sinConfirmar = [];
let revisados = 0;
for (const f of archivos) {
  const rel = path.relative(raiz, f).replace(/\\/g, '/');
  const L = fs.readFileSync(f, 'utf8').split('\n');
  L.forEach((l, i) => {
    if (/^\s*(\/\/|\*)/.test(l) || !/DB\.delete\w*\(|deleteRegistro\(|\.delete\(\)/.test(l)) return;
    let ini = i; while (ini > 0 && !/^\s{2}(async\s+)?[A-Za-z_]\w*\s*\(.*\)\s*\{\s*$/.test(L[ini])) ini--;
    const fn = (L[ini].match(/([A-Za-z_]\w*)\s*\(/) || [])[1];
    if (EXCEPCIONES.includes(`${rel}:${fn}`)) return;
    revisados++;
    if (!/confirm/i.test(L.slice(ini, i + 1).join('\n'))) sinConfirmar.push(`${rel}:${i + 1} (${fn})`);
  });
}
ok(`se revisaron los borrados (${revisados})`, revisados > 10);
ok('todos piden confirmación' + (sinConfirmar.length ? ' — faltan: ' + sinConfirmar.join(', ') : ''), !sinConfirmar.length);

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
