/* Levanta el sitio en local, corre el humo y apaga el servidor.
   Existe para que sea UN comando (`npm run humo`) y no tres pasos que alguien
   olvida: el que se olvida siempre es levantar el servidor, y entonces el humo
   falla por una razón que no tiene nada que ver con la app. */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(aqui, '..', '..');
const PUERTO = process.env.HUMO_PORT || '8099';
const BASE = `http://localhost:${PUERTO}`;

const servidor = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['--yes', 'serve@latest', '-l', PUERTO, '.'],
  { cwd: RAIZ, stdio: 'ignore', shell: process.platform === 'win32' });

const apagar = () => { try { servidor.kill(); } catch (_) {} };
process.on('exit', apagar);
process.on('SIGINT', () => { apagar(); process.exit(130); });

/* Esperar a que responda, con tope: si el servidor no levanta, decirlo claro
   en vez de dejar el humo fallando por timeout. */
const listo = await (async () => {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE + '/', { redirect: 'follow' });
      if (r.ok) return true;
    } catch (_) { /* todavía no levanta */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
})();

if (!listo) {
  console.log('FAIL — no se pudo levantar el servidor local en ' + BASE);
  apagar();
  process.exit(1);
}

const humo = spawn(process.execPath, [path.join(aqui, 'humo.mjs')],
  { cwd: RAIZ, stdio: 'inherit', env: { ...process.env, HUMO_URL: BASE } });

humo.on('exit', (code) => { apagar(); process.exit(code ?? 1); });
