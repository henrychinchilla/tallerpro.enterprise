/* EQUIPO SAAS: MÍNIMO PRIVILEGIO (mig 150).

   Sin saas_rol el colaborador caía en "total", y el rol solo recortaba la
   pantalla: un "Soporte" podía subirse a total o crear superadmins por API.
   Ahora: sin rol = soporte, y gestionar el equipo (BD y Edge Functions)
   exige ser el dueño o saas_rol 'total'. Probado contra la BD con bloque
   revertido: soporte no se sube ni crea, sí actualiza su ultimo_login. */
const fs = require('fs');
const path = require('path');
const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const sa = leer('js/modulos/admin/superadmin.js');
const linea = sa.split('\n').find(l => l.startsWith('const saasRol'));
ok('sin saas_rol el colaborador es soporte, no total', /: 'soporte'\);\s*$/.test(linea || ''));
ok('el dueño sigue siendo total', /SA_DUENO \? 'total'/.test(linea || ''));

for (const f of ['crear-usuario', 'reset-password', 'eliminar-usuario']) {
  const src = leer(`supabase/functions/${f}/index.ts`);
  ok(`${f}: calcula esSuperadminTotal con default soporte`, /esSuperadminTotal/.test(src) && /\?\? "soporte"\) === "total"/.test(src));
}
ok('crear-usuario: crear un superadmin exige total', /rol === "superadmin" && !esSuperadminTotal/.test(leer('supabase/functions/crear-usuario/index.ts')));

const mig = leer('db/migrations/150_equipo_saas_minimo_privilegio.sql');
ok('is_superadmin_total() con default soporte', /coalesce\(permisos_custom ->> 'saas_rol', 'soporte'\) = 'total'/.test(mig));
ok('el trigger protege rol/activo/permisos del equipo', /sensible and not public\.is_superadmin_total\(\)/.test(mig));

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
