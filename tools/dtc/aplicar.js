/* Fusiona el diccionario generado con el que ya trae el módulo y reescribe
   el bloque _DTCS. Las entradas escritas a mano ganan: están mejor redactadas. */
const fs = require('fs');
const T = __dirname + '/';
const F = require('path').join(__dirname, '..', '..', 'js', 'modulos', 'operacion', 'diagnostico_obd.js');

const generado = JSON.parse(fs.readFileSync(T + 'dtc_es.json', 'utf8'));
let src = fs.readFileSync(F, 'utf8');

const ini = src.indexOf('  _DTCS: {');
const fin = src.indexOf('\n  },', ini);
if (ini < 0 || fin < 0) throw new Error('no encontré el bloque _DTCS');
const bloqueViejo = src.slice(ini, fin);

/* entradas escritas a mano */
const aMano = {};
for (const m of bloqueViejo.matchAll(/\b([PBCU][0-9A-F]{4}):'((?:[^'\\]|\\.)*)'/g)) aMano[m[1]] = m[2];
console.log('escritas a mano:', Object.keys(aMano).length);

const total = { ...generado };
for (const [c, d] of Object.entries(aMano)) total[c] = d;   // las de a mano mandan
const claves = Object.keys(total).sort();
console.log('total en el diccionario:', claves.length);

/* reescribir el bloque, una línea por código para que el diff sea legible */
const lineas = claves.map(c => `    ${c}:'${total[c].replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`);
const nuevo = [
  '  /* Diccionario DTC genéricos SAE en español.',
  '     Base: lista MIT de todrobbins/dtcdb (SAE J2012 genéricos), normalizada y',
  '     traducida por tools/dtc/ — ver ese directorio para regenerar y auditar.',
  '     La fuente traía defectos reales (líneas truncadas, "02"→O2, "Cylinder I"→1,',
  "     'Stock On'→'Stuck On'); se reparan ahí, no a mano aquí.",
  '     OJO: la tabla dtc_catalogo de la BD está corrida un lugar desde ~P0170 y por',
  '     eso NO se usa como fuente de verdad; este diccionario manda. */',
  '  _DTCS: {',
  ...lineas,
].join('\n');

src = src.slice(0, ini) + nuevo + src.slice(fin);
fs.writeFileSync(F, src);
console.log('bloque _DTCS reescrito');
