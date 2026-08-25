/* HUMO — el aviso de "hay una versión nueva de la app de Android".

   Las pruebas de texto (test/app-android-version.js) ya miden la regla en un
   sandbox. Esto es otra cosa: abrir un navegador de verdad, entrar al sistema
   como se entra todos los días, y ver si el aviso SALE. Es la única red que ve
   los fallos de ejecución — un método que no existe, un modal que se pisa con
   otro, un fetch que la CSP bloquea. Nada de eso lo ve un regex.

   Se simula un teléfono Android que trae la app instalada pero VIEJA, que es el
   caso que justifica toda la función: la base ya instalada no tiene forma de
   enterarse de que hay un APK nuevo.

   Contra producción:
     HUMO_URL=https://nexuspro.cmtelecommgt.com node test/humo/correr.mjs app-android.mjs
*/
import { abrirSesion, marcador, irA, BASE, credenciales } from './ayuda.mjs';

const { estado, ok } = marcador();

/* Lo que el sitio declara como versión publicada. Todo lo demás se compara
   contra esto, para que la prueba no envejezca cada vez que se sube la app. */
const publicada = await fetch(BASE + '/app-version.json')
  .then(r => r.ok ? r.json() : null).then(j => j?.android).catch(() => null);

/* Deja el navegador creyendo que es un Android con cierta versión instalada, y
   vuelve a pedir el aviso — que es justo lo que App.iniciar() hace al entrar. */
const pedirAviso = (pagina, vcInstalado, vnInstalado) => pagina.evaluate(async (d) => {
  Object.defineProperty(navigator, 'userAgent', {
    get: () => 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile', configurable: true });
  if (d.vc === null) localStorage.removeItem('np_android_app');
  else localStorage.setItem('np_android_app', JSON.stringify({ vc: d.vc, vn: d.vn }));
  localStorage.removeItem('np_android_aviso');
  App._verAndroid = undefined;      // que vuelva a leer el JSON del sitio
  App._appAndroid = undefined;
  App._detectarAppAndroid();
  UI.cerrarModal();
  await App.avisoAppAndroid();
  const caja = document.getElementById('modal-overlay');
  return {
    abierto: !!caja?.classList.contains('open'),
    titulo:  document.getElementById('modal-titulo')?.innerText || '',
    cuerpo:  document.getElementById('modal-body')?.innerText || '',
    html:    document.getElementById('modal-body')?.innerHTML || '',
  };
}, { vc: vcInstalado, vn: vnInstalado });

if (!credenciales()) {
  console.log('⚠️  Sin credenciales — el humo no corre.');
} else if (!publicada) {
  ok('el sitio publica /app-version.json', false, BASE + '/app-version.json no responde');
} else {
  ok('el sitio publica /app-version.json', true);

  const s = await abrirSesion({ viewport: { width: 412, height: 915 } });
  if (!s) {
    ok('entra al sistema en un teléfono', false, 'no se pudo iniciar sesión');
  } else {
    const { pagina, navegador, errores } = s;

    /* ── 1. La app instalada quedó atrás → tiene que avisar ─────────────── */
    {
      const r = await pedirAviso(pagina, publicada.versionCode - 1, 'ANTERIOR');
      ok('con una versión anterior instalada, el aviso SALE al entrar', r.abierto, r.titulo);
      ok('...y dice que hay una versión nueva', /versión nueva/i.test(r.titulo), r.titulo);
      ok('...nombra la versión publicada', r.cuerpo.includes(publicada.versionName), r.cuerpo);
      ok('...y ofrece actualizar', /actualizar/i.test(r.cuerpo), r.cuerpo);
      ok('...con un enlace de descarga real, no un botón muerto',
         r.html.includes(publicada.apkUrl), r.html.slice(0, 200));

      /* Que el enlace exista de verdad: el botón ya dio 404 una vez. */
      const resp = await fetch(BASE + publicada.apkUrl, { method: 'HEAD' }).catch(() => null);
      ok('el APK que ofrece el aviso se descarga (no da 404)',
         !!resp && resp.ok, resp ? ('HTTP ' + resp.status) : 'sin respuesta');
    }

    /* ── 2. "Después" tiene que callarlo, o se vuelve insoportable ──────── */
    {
      const r = await pagina.evaluate(async () => {
        App._posponerAvisoApp(9999, 'actualizar');   // pospuesto para la versión 9999
        const caja = document.getElementById('modal-overlay');
        const cerrado = !caja?.classList.contains('open');
        App._verAndroid = { versionCode: 9999, versionName: '99.9', apkUrl: '/nexuspro.apk' };
        await App.avisoAppAndroid();
        return { cerrado, vuelve: !!caja?.classList.contains('open') };
      });
      ok('"Después" cierra el aviso', r.cerrado);
      ok('...y no lo vuelve a mostrar mientras dure', !r.vuelve);
    }

    /* ── 3. La app al día NO debe molestar ──────────────────────────────── */
    {
      const r = await pedirAviso(pagina, publicada.versionCode, publicada.versionName);
      ok('con la app AL DÍA no sale ningún aviso', r.abierto === false, r.titulo);
    }

    /* ── 4. Sin la app: se le ofrece instalarla ─────────────────────────── */
    {
      const r = await pedirAviso(pagina, null, null);
      ok('en Android sin la app, le ofrece instalarla', r.abierto && /Instala la app/i.test(r.titulo), r.titulo);
    }

    /* ── 5. La pantalla de Descargas cuenta lo mismo que el aviso ───────── */
    {
      await pagina.evaluate(() => UI.cerrarModal());
      await irA(pagina, 'descarga');
      const texto = await pagina.evaluate(() => document.getElementById('page-content')?.innerText || '');
      ok('la pantalla de Descargas muestra la versión publicada',
         texto.includes(publicada.versionName), texto.slice(0, 300));
      ok('...y ofrece el APK con su peso real',
         texto.includes(String(publicada.apkKB)), texto.slice(0, 300));
    }

    /* Los 404 del catálogo de terceros son ruido conocido de otras pantallas;
       lo que no puede haber es una excepción de JavaScript. */
    const rotos = errores.filter(e => /EXCEPCIÓN/.test(e));
    ok('ninguna excepción de JavaScript en el camino', rotos.length === 0, rotos.join(' | '));

    await navegador.close();
  }
}

console.log(`\n   ${estado.pasadas} pasadas, ${estado.fallidas} fallidas`);
if (estado.fallidas) process.exitCode = 1;
