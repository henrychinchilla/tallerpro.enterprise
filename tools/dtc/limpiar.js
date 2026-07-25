/* La fuente comunitaria trae defectos reales (líneas truncadas, OCR de dígitos,
   paréntesis sin cerrar). Reparar lo que es determinista y DESCARTAR lo dudoso:
   más vale un código sin descripción que una descripción equivocada. */
const fs = require('fs');
const T = __dirname + '/';
const codigos = JSON.parse(fs.readFileSync(T + 'verificados.json', 'utf8'));

/* ── Reparaciones deterministas ── */
function reparar(cod, d) {
  let s = d
    .replace(/\b02 Sensor\b/gi, 'O2 Sensor')
    .replace(/\bBank I\b/g, 'Bank 1')
    .replace(/\bSensor I\b/g, 'Sensor 1')
    .replace(/\bPetal\b/gi, 'Pedal')
    // OCR de dígitos en posiciones donde SAE siempre lleva número
    .replace(/\bCylinder S\b/g, 'Cylinder 5')
    .replace(/\bCylinder [Il]\b/g, 'Cylinder 1')
    .replace(/\bCylinder O\b/g, 'Cylinder 0')
    .replace(/\bGear [Il]\b/g, 'Gear 1')
    // "Stock On/Off" es errata de "Stuck On/Off" (atascado)
    .replace(/\bStock (On|Off)\b/g, 'Stuck $1')
    // familia "(Cam/Rotor/Injector)" truncada en la fuente
    .replace(/\(Cam\/R$/, '(Cam/Rotor/Injector)')
    .replace(/(Range\/Performance|Intermittent) Injector\)$/, '$1 (Cam/Rotor/Injector)')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/* ── Detección de lo que quedó dudoso ── */
function defectos(d) {
  const malos = [];
  const abre = (d.match(/\(/g) || []).length, cierra = (d.match(/\)/g) || []).length;
  if (abre !== cierra) malos.push('paréntesis desbalanceados');
  if (/\/[A-Z]$/.test(d)) malos.push('cortado a media palabra');
  if (/\b[A-Z]\/$/.test(d)) malos.push('cortado');
  if (d.length < 6) malos.push('demasiado corto');
  if (/\bCylinder [A-Za-z]\b/.test(d)) malos.push('número de cilindro ilegible');
  if (/\bBank [A-Za-z]\b/.test(d)) malos.push('número de banco ilegible');
  return malos;
}

const limpios = [], descartados = [];
for (const [cod, desc] of codigos) {
  const r = reparar(cod, desc);
  const m = defectos(r);
  if (m.length) descartados.push([cod, desc, r, m.join(', ')]);
  else limpios.push([cod, r]);
}

fs.writeFileSync(T + 'verificados.json', JSON.stringify(limpios));
console.log('limpios:', limpios.length, '| descartados:', descartados.length);
descartados.forEach(([c, o, r, m]) => console.log(`  ✗ ${c}  [${m}]  "${o}"`));
