/* Levanta el sitio en local, corre las pruebas de navegador que se le pidan y
   apaga el servidor.

   Existe para que sea UN comando y no tres pasos que alguien olvida: el que se
   olvida siempre es levantar el servidor, y entonces la prueba falla por una
   razón que no tiene nada que ver con la app.

   Uso:  node test/humo/correr.mjs [archivo.mjs ...]
   Sin argumentos corre humo.mjs. Si una suite falla, se sigue con las demás y
   al final se devuelve error: interesa el panorama completo, no la primera. */
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
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

/* Servidor estático PROPIO, dentro de este mismo proceso.

   Antes esto era `npx --yes serve@latest`, y se caía a media corrida: el
   2026-08-26 tumbó tres despliegues seguidos con ERR_CONNECTION_REFUSED, y el
   fallo aparecía como si la app estuviera rota ("el sitio publica
   /app-version.json — no responde"). Tres cosas se sumaban:

     · `serve@latest` se resuelve POR RED en cada corrida.
     · `stdio:'ignore'` tiraba a la basura el error del servidor, así que cuando
       moría no quedaba ni rastro de por qué.
     · `shell:true` en Windows hacía que `kill()` matara la shell y dejara el
       `serve` real HUÉRFANO — de ahí los procesos node acumulados y el puerto
       ocupado en corridas siguientes.

   Un sitio estático no necesita nada de eso. Sin red, sin npx, sin shell y sin
   proceso hijo: nada que pueda morirse por su cuenta ni quedar huérfano. */
const TIPOS = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.map':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif',
  '.svg':'image/svg+xml', '.webp':'image/webp', '.ico':'image/x-icon',
  '.woff':'font/woff', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8',
  '.apk':'application/vnd.android.package-archive', '.aab':'application/octet-stream',
  '.csv':'text/csv; charset=utf-8', '.pdf':'application/pdf'
};
const servidor = http.createServer((req, res) => {
  let ruta;
  try { ruta = decodeURIComponent(new URL(req.url, BASE).pathname); }
  catch (_) { res.writeHead(400); return res.end('URL invalida'); }
  if (ruta.endsWith('/')) ruta += 'index.html';
  /* path.resolve normaliza los ".." antes de comparar: sin esto, un
     /../../algo saldría del repo. */
  const destino = path.resolve(RAIZ, '.' + ruta);
  if (destino !== RAIZ && !destino.startsWith(RAIZ + path.sep)) {
    res.writeHead(403); return res.end('Fuera de la raiz');
  }
  /* URLs limpias: /privacidad debe servir privacidad.html, como hace worker.js
     en producción y como hacía `serve`. Sin esto el servidor de pruebas no se
     parece al de verdad, que es justo lo que una prueba de humo debe imitar. */
  const candidatos = path.extname(destino) ? [destino] : [destino, destino + '.html'];
  const servir = (i) => {
    if (i >= candidatos.length) { res.writeHead(404); return res.end('No encontrado'); }
    fs.stat(candidatos[i], (err, st) => (err || !st.isFile()) ? servir(i + 1) : enviar(candidatos[i], st));
  };
  const enviar = (archivo, st) => {
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(archivo).on('error', () => res.destroy()).pipe(res);
  };
  servir(0);
});
servidor.on('error', e => { console.log('FAIL — el servidor de pruebas fallo: ' + e.message); });
await new Promise(r => servidor.listen(Number(PUERTO), '127.0.0.1', r));

const apagar = () => { try { servidor.close(); } catch (_) {} };
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
