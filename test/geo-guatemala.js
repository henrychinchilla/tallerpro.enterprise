/* Departamentos, municipios y códigos postales de Guatemala.

   Sale de revisar el DPI real de un cliente: el documento trae el lugar de
   nacimiento y la vecindad como DOS líneas (departamento y municipio) y la
   app los guardaba como un solo texto. Partirlos permite además derivar el
   código postal, que hoy nadie escribe a mano.

   LO QUE MÁS IMPORTA PROBAR es que un código NO se invente. Estos valores
   terminan impresos en una declaración jurada que se firma ante notario: un
   municipio que no existe debe devolver null, no el código del vecino. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ctx = { console, Math, Date, JSON, String, Number, Object, Array, RegExp };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'js', 'core', 'geo-guatemala.js'), 'utf8'), ctx);
const { GEO_GT, departamentosGT, municipiosGT, codigoPostalGT, buscarDepartamento,
        normalizarGeo, paisDesdeISO, nacionalidadDesdeISO } = ctx;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── El catálogo está completo ──────────────────────────────────────────── */
{
  ok('están los 22 departamentos', departamentosGT().length === 22);
  ok('cada uno tiene prefijo de 2 dígitos',
     Object.values(GEO_GT).every(d => /^\d{2}$/.test(d.cod)));
  ok('los prefijos van del 01 al 22 sin repetirse',
     new Set(Object.values(GEO_GT).map(d => d.cod)).size === 22);
  ok('ninguno se quedó sin municipios',
     Object.values(GEO_GT).every(d => d.municipios.length > 0));
  /* 22 departamentos, ~340 municipios y aldeas con código propio. */
  const total = Object.values(GEO_GT).reduce((s, d) => s + d.municipios.length, 0);
  ok(`hay más de 300 lugares con código (${total})`, total > 300);
}

/* ── EL CASO REAL: el DPI de Henry ──────────────────────────────────────── */
{
  /* Nació en Santa Catarina Mita, Jutiapa. Vive en Fraijanes, Guatemala. */
  ok('Santa Catarina Mita, Jutiapa → 22003',
     codigoPostalGT('Jutiapa', 'Santa Catarina Mita') === '22003');
  ok('Fraijanes, Guatemala → 01062',
     codigoPostalGT('Guatemala', 'Fraijanes') === '01062');
}

/* ── Códigos verificados contra la fuente ──────────────────────────────── */
{
  [['Guatemala', 'Mixco', '01057'],
   ['Guatemala', 'Villa Nueva', '01064'],
   ['Guatemala', 'San Jose Pinula', '01052'],
   ['Guatemala', 'San Juan Sacatepequez', '01059'],
   ['Sacatepequez', 'Antigua Guatemala', '03001'],
   ['Quetzaltenango', 'Quetzaltenango', '09001'],
   ['Peten', 'Flores', '17001'],
   ['Jalapa', 'Jalapa', '21001'],
  ].forEach(([d, m, cp]) =>
    ok(`${m}, ${d} → ${cp}`, codigoPostalGT(d, m) === cp));

  /* Las zonas de la capital: regla 010NN verificada contra cuatro publicados. */
  ok('Ciudad de Guatemala zona 6 → 01006',
     codigoPostalGT('Guatemala', 'Ciudad de Guatemala zona 6') === '01006');
  ok('zona 21 → 01021', codigoPostalGT('Guatemala', 'Ciudad de Guatemala zona 21') === '01021');
  ok('hay 25 zonas de la capital',
     municipiosGT('Guatemala').filter(m => /^Ciudad de Guatemala zona/.test(m.nombre)).length === 25);
}

/* ── NO SE INVENTAN CÓDIGOS ─────────────────────────────────────────────── */
{
  ok('un municipio inexistente devuelve null', codigoPostalGT('Jutiapa', 'Narnia') === null);
  ok('un departamento inexistente devuelve null', codigoPostalGT('Nárnia', 'Jutiapa') === null);
  ok('sin municipio devuelve el código del departamento',
     codigoPostalGT('Jutiapa') === '22000');
  ok('sin nada devuelve null', codigoPostalGT(null, null) === null);
  /* Un municipio de OTRO departamento no debe colarse: Fraijanes es de
     Guatemala, no de Jutiapa. */
  ok('un municipio de otro departamento no cuela',
     codigoPostalGT('Jutiapa', 'Fraijanes') === null);
}

/* ── Se escribe de mil formas y hay que reconocerlas ────────────────────── */
{
  /* El DPI imprime en MAYÚSCULAS y sin tildes; la gente escribe con tilde;
     el catálogo postal va sin ella. Los tres tienen que encontrarse. */
  ok('las MAYÚSCULAS del DPI encuentran el municipio',
     codigoPostalGT('JUTIAPA', 'SANTA CATARINA MITA') === '22003');
  ok('con tilde encuentra al catálogo sin tilde',
     codigoPostalGT('Sololá', 'Panajachel') === '07010');
  ok('sin tilde encuentra al departamento con tilde',
     buscarDepartamento('Peten') === 'Peten');
  ok('los espacios de más no molestan',
     codigoPostalGT('  Jutiapa ', ' Santa  Catarina  Mita ') === '22003');
  ok('normalizarGeo quita tildes y baja a minúsculas',
     normalizarGeo('SOLOLÁ') === 'solola');
}

/* ── Los municipios dependen del departamento ──────────────────────────── */
{
  ok('Jutiapa tiene sus municipios', municipiosGT('Jutiapa').length >= 27);
  ok('un departamento desconocido devuelve lista vacía', municipiosGT('Narnia').length === 0);
  ok('cada municipio trae nombre y código',
     municipiosGT('Jalapa').every(m => m.nombre && /^\d{5}$/.test(m.codigo)));
  /* Los códigos de un departamento son correlativos: ese ES el mecanismo. */
  const jal = municipiosGT('Jalapa');
  ok('los códigos son correlativos dentro del departamento',
     jal.every((m, i) => Number(m.codigo) === Number(jal[0].codigo) + i));
}

/* ── GTM no es una nacionalidad ─────────────────────────────────────────── */
{
  /* El DPI imprime el código ISO. Una declaración jurada no puede decir
     "de nacionalidad GTM": el notario no la acepta. Y país y gentilicio son
     cosas distintas — el DPI trae los dos campos por separado. */
  ok('GTM como país → Guatemala', paisDesdeISO('GTM') === 'Guatemala');
  ok('GTM como nacionalidad → Guatemalteca', nacionalidadDesdeISO('GTM') === 'Guatemalteca');
  ok('minúsculas también', paisDesdeISO('gtm') === 'Guatemala');
  ok('SLV → El Salvador / Salvadoreña',
     paisDesdeISO('SLV') === 'El Salvador' && nacionalidadDesdeISO('SLV') === 'Salvadoreña');
  ok('USA → Estados Unidos', paisDesdeISO('USA') === 'Estados Unidos');
  /* Si ya viene el nombre escrito, no se toca. */
  ok('un país ya escrito pasa igual', paisDesdeISO('Guatemala') === 'Guatemala');
  ok('un código desconocido se devuelve tal cual', paisDesdeISO('XYZ') === 'XYZ');
  ok('vacío devuelve null', paisDesdeISO('') === null && nacionalidadDesdeISO(null) === null);
}


/* -- El asiento del registro civil (L: F: P: del reverso) ---------------- */
{
  const fs2 = require('fs'), path2 = require('path');
  const r2 = path2.join(__dirname, '..');
  /* El asiento del registro civil se pide en el EXPEDIENTE de armería: sale
     del reverso del DPI y sólo lo necesita una declaración jurada. */
  const srcCli = fs2.readFileSync(path2.join(r2, 'js', 'modulos', 'especializados', 'clientes-armeria.js'), 'utf8');
  const srcIA = fs2.readFileSync(path2.join(r2, 'supabase', 'functions', 'ai-assistant', 'index.ts'), 'utf8');
  const migR = fs2.readFileSync(path2.join(r2, 'db', 'migrations', '131_clientes_registro_civil.sql'), 'utf8');

  ['registro_libro', 'registro_folio', 'registro_pagina'].forEach(c => {
    ok('la migracion guarda ' + c, migR.includes(c));
    ok('el prompt lee ' + c, srcIA.includes('"' + c + '"'));
    ok('el formulario guarda ' + c, srcCli.includes("'" + c + "'"));
  });

  /* Van como TEXTO: en asientos viejos hay letras y ceros a la izquierda que
     un integer se comeria. */
  ok('se guardan como texto, no como numero', /registro_libro\s+text/.test(migR));
  /* El prompt necesita el ejemplo literal para no confundir las tres letras. */
  ok('el prompt trae el ejemplo real del DPI', /L:102 F:42 P:263/.test(srcIA));
  ok('la pantalla explica para que sirve', /asiento del registro civil/.test(srcCli));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
