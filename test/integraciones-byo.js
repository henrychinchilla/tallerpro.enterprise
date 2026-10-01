/* CANAL B — PAGOS Y FEL PROPIOS DEL COMERCIO (mig 153).

   - El formulario FEL guardaba la contraseña del certificador EN CLARO en
     tenants.config_infile (la lee cualquier usuario del comercio) y la
     volvía a pintar en value="". Ahora va cifrada a tenant_integraciones.
   - La pantalla decía "INFILE — integrado con NexusPro" y "NexusPro
     gestiona tu FEL": no existe esa integración. Ahora lo dice la verdad.
   - Canal B nunca toca credenciales de CM; el navegador nunca recibe
     secretos (privilegio por columna; solo service_role descifra).
   Probado contra la BD (bloque revertido): admin guarda con pista …1234,
   no lee el cifrado ni descifra, no toca otro comercio. */
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const com = leer('js/modulos/herramientas/comunicaciones.js');
const g = com.slice(com.indexOf('async guardarInfile'), com.indexOf('async _cargarPistaFel'));
ok('FEL: la contraseña ya no se guarda en config_infile', !/cfg\.password/.test(g));
ok('FEL: la contraseña va cifrada por guardarIntegracion', /DB\.guardarIntegracion\('fel'/.test(g));
ok('FEL: la contraseña no se vuelve a pintar en el formulario', !/value="\$\{infile\.password/.test(com));
ok('FEL: nada dice "integrado con NexusPro" ni "NexusPro gestiona"',
   !/integrado con NexusPro|NexusPro gestiona/.test(com + leer('js/modulos/admin/configuracion.js')));

const mig = leer('db/migrations/153_tenant_integraciones.sql');
ok('el navegador no puede leer secreto_enc (GRANT por columna sin ella)',
   /GRANT SELECT \(id, tenant_id, tipo, proveedor, ambiente, publico, secreto_pista,[^)]*\)/.test(mig) &&
   !/GRANT SELECT \([^)]*secreto_enc/.test(mig));
ok('solo service_role descifra', /leer_secreto_integracion\(uuid,text\) FROM public, anon, authenticated/.test(mig) &&
   /leer_secreto_integracion\(uuid,text\) TO service_role/.test(mig));
ok('llave de Vault propia de Canal B (no la de tarjetas de Canal A)', /'integraciones_tenant_key'/.test(mig) && !/tarjeta_token_key/.test(mig));
ok('nace apagado', /'integraciones_byo', jsonb_build_object\('activo', false\)/.test(mig));

const edge = leer('supabase/functions/integracion-tenant/index.ts');
ok('Canal B no usa la tarjeta ni credenciales de CM', !/tenant_tarjetas|leer_token_tarjeta|STRIPE_SECRET|CM_/.test(edge));
ok('sin conector → error explícito', /Sin conector para/.test(edge));
ok('la Edge no devuelve el secreto', !/json\(\{[^}]*sec\b/.test(edge));

/* Grep del prompt: ningún secreto de pasarela en el frontend. */
const front = [];
const recorrer = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) recorrer(p); else if (/\.(js|html)$/.test(e.name)) front.push(p);
});
recorrer(path.join(raiz, 'js'));
['index.html', 'pos.html'].forEach(f => front.push(path.join(raiz, f)));
const fugas = front.filter(f => /sk_live_[0-9A-Za-z]{8,}|sk_test_[0-9A-Za-z]{8,}|whsec_[0-9A-Za-z]{8,}/.test(fs.readFileSync(f, 'utf8')));
ok('ningún sk_live / sk_test / whsec en el frontend' + (fugas.length ? ': ' + fugas.join(', ') : ''), !fugas.length);

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
