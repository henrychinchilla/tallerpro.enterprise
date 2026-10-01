/* CANAL A — COBRO SAAS AUTOMÁTICO (mig 152, Edge saas-cobrar).

   Base para cualquier pasarela de CM, APAGADA por flag. Reglas que no se
   pueden romper:
   - un cargo que no ocurrió nunca renueva (sin conector = error explícito);
   - el éxito pasa por el MISMO registrar_cobro_saas del cobro manual;
   - Canal A no lee credenciales del comercio (tenant_integraciones);
   - apagado = solo simula, no escribe.
   Verificado en prod (pg_net, dry_run): plan correcto, nada escrito. */
const fs = require('fs');
const path = require('path');
const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const fn = leer('supabase/functions/saas-cobrar/index.ts');
const mig = leer('db/migrations/152_saas_billing_auto.sql');

ok('arranca APAGADO', /'activo', false/.test(mig));
ok('apagado o dry_run = solo simula', /simular = body\.dry_run === true \|\| cfg\.activo !== true/.test(fn) &&
   /if \(simular\) \{ fila\.resultado = "simulado"; plan\.push\(fila\); continue; \}/.test(fn));
ok('sin conector → error explícito, nunca ok', /Sin conector para/.test(fn) && /const CONECTORES:[^\n]*Promise<Cargo>> = \{\};/.test(fn));
ok('el éxito usa registrar_cobro_saas (sin cobro huérfano)', /if \(r\.ok\) \{[\s\S]*rpc\("registrar_cobro_saas"/.test(fn));
ok('cobrado pero no registrado se reporta, no se esconde', /CARGO HECHO pero no se registró/.test(fn));
ok('Canal A no lee credenciales del comercio', !/tenant_integraciones|leer_secreto_integracion/.test(fn));
ok('el comercio propio de CM no se cobra ni se corta', /duenoPerfil\?\.tenant_id/.test(fn));
ok('la Edge exige superadmin TOTAL o el cron', /saas_rol \?\? "soporte"\) === "total"/.test(fn) && /get_cron_secret/.test(fn));
ok('registrar_cobro_saas acepta a la Edge (service_role)', /OR auth\.role\(\) = 'service_role'/.test(mig));
ok('un pago exitoso reinicia los intentos', /billing_intentos = 0/.test(mig));
ok('el panel puede simular y configurar', /simularCobroAuto/.test(leer('js/modulos/admin/superadmin.js')));

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
