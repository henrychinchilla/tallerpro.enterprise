/* SOPORTE → POS SIN PERDER EL COMERCIO.

   En soporte a PRUEBAS, el POS decía "sin negocio asignado" y las consultas
   salían con tenant_id=null (el texto "null" → 400 uuid inválido):
   - el POS solo miraba membresías, y el superadmin no es miembro;
   - si lo fuera, seleccionar_taller_pos le pisa tenant_id y rol.
   Y getTenant() sin negocio devolvía un comercio CUALQUIERA (limit 1). */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const pos = leer('js/pos/pos.js');
const db = leer('js/core/db.js');

const proc = pos.slice(pos.indexOf('async _procesarSesion'), pos.indexOf('_puedeEntrar()'));
ok('el superadmin se desvía ANTES del RPC de membresías',
   proc.indexOf("rol === 'superadmin'") > -1 &&
   proc.indexOf("rol === 'superadmin'") < proc.indexOf('getMisTalleresPOS'));
const soporte = pos.slice(pos.indexOf('async _entrarComoSoporte'), pos.indexOf('renderSinTaller() {'));
ok('_entrarComoSoporte usa tp_soporte_tenant', /tp_soporte_tenant/.test(soporte));
ok('_entrarComoSoporte NO llama seleccionarTallerPOS (pisaría rol/tenant)', !/seleccionarTallerPOS/.test(soporte));
ok('getTenant() sin negocio ya no hace limit(1)', !/else q = q\.limit\(1\)/.test(db));

/* La guarda, con un builder falso que imita el de PostgREST. */
class Filtro { constructor() { this.f = []; } eq(c, v) { this.f.push([c, v]); return this; } }
const ctx = { console, window: {}, supabase: { createClient: () => ({ from: () => ({ select: () => new Filtro() }) }) },
  SUPABASE_URL: 'x', SUPABASE_KEY: 'k' };
vm.createContext(ctx);
vm.runInContext(db + '\n;this.__sb = getSB();', ctx);
const b = new Filtro();
b.eq('tenant_id', null).eq('tenant_id', 'null').eq('tenant_id', 'abc').eq('ot_id', null);
ok('tenant_id null → UUID inexistente', b.f[0][1] === '00000000-0000-0000-0000-000000000000');
ok('tenant_id "null" → UUID inexistente', b.f[1][1] === '00000000-0000-0000-0000-000000000000');
ok('un tenant real pasa igual', b.f[2][1] === 'abc');
ok('otras columnas no se tocan', b.f[3][1] === null);

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
