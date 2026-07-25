/* Verificación dura: ninguna palabra del vocabulario inglés de la fuente
   puede sobrevivir en la traducción (salvo siglas técnicas que se usan igual). */
const fs = require('fs');
const T = __dirname + '/';
const crudos = JSON.parse(fs.readFileSync(T + 'verificados.json', 'utf8'));
const es = JSON.parse(fs.readFileSync(T + 'dtc_es.json', 'utf8'));

/* siglas/palabras que en español se escriben igual */
const OK = new Set(['a','b','c','d','e','f','g','h','i','j','k','l','m','n','p','r','s','t','u','v','w',
  'ii','iii','o2','maf','map','iat','ect','tps','ckp','cmp','egr','rpm','kam','ram','rom','mil','obd',
  'evap','vss','iac','prndl','pcm','ecm','tcm','abs','sae','knock','wastegate','turbo','sensor','rotor',
  'motor','control','controles','computadora','banco','cilindro','balance','nivel','pedal','total',
  'normal','error','serial','no','y','o','de','el','la','en','para','del','al','con','sin','muy',
  'bajo','alto','se','por','un','una','ac']);

const vocabIngles = new Set();
for (const [, d] of crudos) {
  for (const w of d.split(/[^A-Za-z]+/).filter(Boolean)) vocabIngles.add(w.toLowerCase());
}

const fugas = [];
for (const [codigo, texto] of Object.entries(es)) {
  for (const tok of texto.split(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/).filter(Boolean)) {
    const t = tok.toLowerCase();
    if (OK.has(t)) continue;
    if (/[áéíóúñ]/.test(t)) continue;          // claramente español
    if (vocabIngles.has(t)) fugas.push([codigo, tok, texto]);
  }
}

console.log('códigos:', Object.keys(es).length);
if (fugas.length) {
  console.log('*** ' + fugas.length + ' palabra(s) en inglés sobrevivieron ***');
  const porPalabra = {};
  fugas.forEach(([c, t]) => (porPalabra[t] = (porPalabra[t] || 0) + 1));
  console.log(Object.entries(porPalabra).sort((a, b) => b[1] - a[1]).map(([t, n]) => t + ':' + n).join('  '));
  console.log('\nejemplos:');
  fugas.slice(0, 12).forEach(([c, t, txt]) => console.log(`  ${c} [${t}] ${txt}`));
  process.exitCode = 1;
} else {
  console.log('✓ cero palabras en inglés');
}
