/* Extrae los códigos del CSV MIT. Ojo: 9 líneas traen dos códigos pegados
   (falta el salto de línea en la fuente), hay que partirlas o se pierden. */
const fs = require('fs');
const T = __dirname + '/';

const texto = fs.readFileSync(T + 'generic.csv', 'utf8');
const sinEncabezados = texto.split(/\r?\n/)
  .filter(l => !/DTC Codes/i.test(l))          // "DTC Codes - P0400-P0499 – ..." no es un código
  .join('\n');
// separar códigos embebidos; ojo: "Stuck OnP0753" no tiene frontera de palabra
const normalizado = sinEncabezados.replace(/([A-Za-z)"\d])\s*(P[0-9][0-9A-F]{3})[ ,]/g, '$1\n$2,');

const codigos = [];
const vistos = new Set();
for (const l of normalizado.split(/\r?\n/)) {
  const m = l.match(/^\s*"?([PBCU][0-9][0-9A-F]{3})"?\s*[,]\s*(.+?)\s*$/i);
  if (!m) continue;
  const cod = m[1].toUpperCase();
  const desc = m[2].replace(/^"|"$/g, '').trim();
  if (vistos.has(cod)) continue;
  vistos.add(cod);
  codigos.push([cod, desc]);
}

fs.writeFileSync(T + 'verificados.json', JSON.stringify(codigos));
console.log('códigos extraídos:', codigos.length);
for (const c of ['P0174', 'P0175', 'P0300', 'P0420', 'P0455']) {
  const f = codigos.find(x => x[0] === c);
  console.log(' ', c, '=>', f ? f[1] : '(FALTA)');
}
