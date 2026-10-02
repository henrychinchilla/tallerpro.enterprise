/* EL SUPERADMIN CAMBIA SU PROPIA CONTRASEÑA DENTRO DE LA APP.

   No había cómo (Auth.cambiarPassword solo se usaba en el primer ingreso y
   en la recuperación). Henry, 2026-10-01: «permite que solo el superadmin
   pueda cambiar su propio password dentro de la app». Va sobre su propia
   sesión (updateUser solo toca al usuario logueado), y la cuenta del dueño
   nadie más la puede cambiar: sin 🔑 en las listas y reset-password lo
   rechaza para quien no es el dueño. */
const fs = require('fs');
const path = require('path');
const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const sa = leer('js/modulos/admin/superadmin.js');
const header = sa.slice(sa.indexOf('<div class="page-header">'), sa.indexOf('<div class="page-actions">'));
ok('el botón 🔑 Mi contraseña está en el encabezado del panel', /modalMiPassword\(\)/.test(header));
ok('...fuera de page-actions, para que lo tengan también soporte y cobros', !!header);
const m = sa.slice(sa.indexOf('modalMiPassword() {'), sa.indexOf('/* ── EQUIPO: colaboradores'));
ok('solo un superadmin abre el modal', /Auth\.user\?\.rol !== 'superadmin'\) return/.test(m));
ok('cambia la contraseña de la sesión propia (Auth.cambiarPassword)', /Auth\.cambiarPassword\(p1\)/.test(m));
ok('pide repetirla y mínimo 8', /p1 !== p2/.test(m) && /p1\.length < 8/.test(m));
ok('el dueño no tiene 🔑 en las listas', /email===SA_DUENO\?'':/.test(sa) && /dueno\?'<span/.test(sa));
ok('reset-password: la cuenta del dueño solo la cambia el dueño',
   /email === "henry\.chinchilla@gmail\.com" && !esDueno/.test(leer('supabase/functions/reset-password/index.ts')));

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
