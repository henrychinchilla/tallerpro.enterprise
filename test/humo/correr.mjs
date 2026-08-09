/* Levanta el sitio en local, corre las pruebas de navegador que se le pidan y
   apaga el servidor.

   Existe para que sea UN comando y no tres pasos que alguien olvida: el que se
   olvida siempre es levantar el servidor, y entonces la prueba falla por una
   razón que no tiene nada que ver con la app.

   Uso:  node test/humo/correr.mjs [archivo.mjs ...]
   Sin argumentos corre humo.mjs. Si una suite falla, se sigue con las demás y
   al final se devuelve error: interesa el panorama completo, no la primera. */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(aqui, '..', '..');
const PUERTO = process.env.HUMO_PORT || '8199';
const BASE = `http://127.0.0.1:${PUERTO}`;
/* --movil corre el mismo recorrido en pantalla de teléfono (390x844), que es
   donde se tapan las cosas: las categorías sobre los productos, el total fuera
   de vista. */
const args = process.argv.slice(2);
const MOVIL = args.includes('--movil');
const SUITES = args.filter(a => a !== '--movil');
if (!SUITES.length) SUITES.push('humo.mjs');

const servidor = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['--yes', 'serve@latest', '-l', PUERTO, '.'],
  { cwd: RAIZ, stdio: 'ignore', shell: process.platform === 'win32' });

const apagar = () => { try { servidor.kill(); } catch (_) {} };
process.on('exit', apagar);
process.on('SIGINT', () => { apagar(); process.exit(130); });

/* Esperar a que responda, con tope: si el servidor no levanta, decirlo claro en
   vez de dejar las pruebas fallando por timeout. */
const listo = await (async () => {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + '/', { redirect: 'follow' }); if (r.ok) return true; }
    catch (_) { /* todavía no levanta */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
})();

if (!listo) {
  console.log('FAIL — no se pudo levantar el servidor local en ' + BASE);
  apagar();
  process.exit(1);
}

let fallaron = 0;
for (const suite of SUITES) {
  console.log(`\n═══ ${suite} ═══`);
  const code = await new Promise((res) => {
    const p = spawn(process.execPath, [path.join(aqui, suite)],
      { cwd: RAIZ, stdio: 'inherit',
        env: { ...process.env, HUMO_URL: BASE, ...(MOVIL ? { HUMO_MOVIL: '1' } : {}) } });
    p.on('exit', (c) => res(c ?? 1));
  });
  if (code !== 0) fallaron++;
}

apagar();
if (fallaron) console.log(`\n${fallaron} suite(s) con fallos.`);
process.exit(fallaron ? 1 : 0);
