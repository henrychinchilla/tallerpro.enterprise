/* PERMISOS_MIN (supabase/functions/ai-assistant/index.ts) es un espejo a mano
   de PERMISOS (js/core/config.js) — no hay forma de importar el archivo del
   navegador desde una Edge Function Deno sin agregar infraestructura nueva.
   Un espejo a mano se desalinea solo: justo así quedó `armeria` en `true`
   para mecánico al crear el módulo, copiando el patrón de herrería sin
   revisar contra la intención real. Esta prueba no exige igualdad total
   (el espejo puede ser más conservador) — exige que NUNCA sea más permisivo
   que la fuente real: si PERMISOS_MIN dice que un rol puede tocar un módulo,
   config.js debe decir true también. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* config.js real, cargado igual que test/inventario-permisos-rol.js */
const ctx = { console, window: {} };
ctx.window = ctx;
vm.createContext(ctx);
/* config.js no expone `window.PERMISOS` (igual que docs.js): en el navegador
   basta con ser un `const` de script-scope. Se recupera evaluando el
   identificador como última expresión del script. */
const PERMISOS = vm.runInContext(fs.readFileSync(raiz('js', 'core', 'config.js'), 'utf8') + '\nPERMISOS;', ctx);

/* PERMISOS_MIN vive en un archivo TypeScript (Deno) — se extrae el literal
   del objeto en vez de ejecutar el archivo entero (tiene sintaxis TS que
   Node no entiende: anotaciones de tipo, `Deno.env`, etc.). */
const tsSource = fs.readFileSync(raiz('supabase', 'functions', 'ai-assistant', 'index.ts'), 'utf8');
const m = tsSource.match(/const PERMISOS_MIN: Record<string, string\[\]> = (\{[\s\S]*?\n\});/);
ok('PERMISOS_MIN se encuentra en el archivo (si esto falla, cambió de forma y hay que ajustar la extracción)', !!m);
const PERMISOS_MIN = new Function('return ' + m[1])();

/* ── Cada rol de PERMISOS_MIN existe de verdad en config.js ─────────────── */
for (const rol of Object.keys(PERMISOS_MIN)) {
  ok(`el rol "${rol}" existe en PERMISOS (config.js)`, !!PERMISOS[rol]);
}

/* ── Nunca más permisivo que la fuente real ──────────────────────────────
   '*' (superadmin/admin) no se compara módulo por módulo: por diseño ven
   todo lo que el tenant activó, igual que en config.js. */
for (const [rol, modulos] of Object.entries(PERMISOS_MIN)) {
  if (modulos.includes('*')) continue;
  for (const modulo of modulos) {
    ok(`${rol}: PERMISOS_MIN dice que puede tocar "${modulo}" y config.js coincide`,
       PERMISOS[rol]?.[modulo] === true);
  }
}

/* ── El caso que motivó esta prueba: no se repite ────────────────────────
   Un mecánico no debe poder tocar armería en ninguno de los dos lados. */
ok('mecánico NO tiene armería en PERMISOS_MIN', !PERMISOS_MIN.mecanico.includes('armeria'));
ok('mecánico NO tiene armería en config.js tampoco', PERMISOS.mecanico?.armeria !== true);

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
