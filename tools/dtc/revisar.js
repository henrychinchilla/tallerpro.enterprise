/* Detector de construcciones sospechosas + muestra estratificada para revisión humana */
const fs = require('fs');
const T = __dirname + '/';
const es = JSON.parse(fs.readFileSync(T + 'dtc_es.json', 'utf8'));
const en = Object.fromEntries(JSON.parse(fs.readFileSync(T + 'verificados.json', 'utf8')));

const olores = [];
for (const [c, t] of Object.entries(es)) {
  const m = [];
  if (/§/.test(t)) m.push('marcador sin resolver');
  if (/^\s*—/.test(t)) m.push('empieza con guión');
  if ((t.match(/—/g) || []).length > 1) m.push('varios guiones');
  if (/\b(\w+) \1\b/i.test(t)) m.push('palabra repetida');
  if (/\(\)|\(\s*\)/.test(t)) m.push('paréntesis vacío');
  if (/\s{2,}/.test(t)) m.push('espacios dobles');
  if (/[,/]\s*$/.test(t)) m.push('termina en signo');
  if (t.length > 95) m.push('muy largo');
  if (m.length) olores.push([c, t, m.join(', ')]);
}
console.log('sospechosos:', olores.length);
olores.slice(0, 20).forEach(([c, t, m]) => console.log(`  ${c} [${m}]\n     ${t}`));

console.log('\n===== MUESTRA (1 de cada 12) =====');
const claves = Object.keys(es).sort();
claves.filter((_, i) => i % 12 === 0).forEach(c => {
  console.log(`${c}  ${es[c]}`);
  console.log(`        ↑ ${en[c]}`);
});
