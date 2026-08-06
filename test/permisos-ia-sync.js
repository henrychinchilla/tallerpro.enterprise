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


/* -- Nexus conoce lo nuevo de armeria, y solo si el ROL lo permite -------- */
{
  const fs2 = require('fs'), path2 = require('path');
  const srcIA2 = fs2.readFileSync(path2.join(__dirname, '..', 'supabase', 'functions', 'ai-assistant', 'index.ts'), 'utf8');

  ok('el snapshot trae el saldo de municion pendiente', /municion_pendiente_de_entregar/.test(srcIA2));
  ok('...y las entregas del mes', /cartuchos_entregados_del_mes/.test(srcIA2));
  /* Sin codigo de DIGECAM la entrega quedo sin su respaldo real. */
  ok('senala las entregas sin codigo de DIGECAM', /entregas_sin_codigo_digecam/.test(srcIA2));
  ok('avisa de los clientes sin tipo de licencia', /clientes_sin_tipo_de_licencia/.test(srcIA2));

  /* El tope y sus limites viajan CON los datos: si Nexus viera el conteo sin
     el recordatorio, lo presentaria como si fuera la cuota nacional. */
  ok('el recordatorio legal viaja junto al conteo', /recordatorio_legal/.test(srcIA2));
  ok('...dice que el 250 es POR ARMA', /250 POR ARMA REGISTRADA/.test(srcIA2));
  ok('...y que el conteo es una REFERENCIA PARCIAL', /REFERENCIA PARCIAL/.test(srcIA2));
  ok('...y que la tenencia no vence', /tarjeta de tenencia NO vence/.test(srcIA2));

  /* Un mecanico no debe ver el saldo de municion de un cliente. */
  ok('el bloque se arma solo si el ROL puede tocar armeria',
     srcIA2.includes('modsDelRol.includes("armeria")'));
  /* Va ANTES del corte financiero: quien atiende el mostrador lo necesita. */
  ok('es operativo, no financiero (va antes del corte por rol elevado)',
     srcIA2.indexOf('municion_pendiente_de_entregar') < srcIA2.indexOf('if (!elevado) return snap;'));
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
