/* LA PANTALLA DE CAMBIO OBLIGATORIO DE CONTRASEÑA ERA UNA TRAMPA.

   Henry creó un usuario para El Granjero. Al entrar por primera vez, la app
   pide cambiar la contraseña — pero el cliente todavía no quería cambiarla, y
   ahí se quedó: la pantalla no tenía ningún botón para salir.

   Y lo peor no era eso. Cuando aparece esa pantalla la sesión de Supabase YA
   está abierta, así que:
     · recargar la página volvía a caer en el cambio de contraseña, y
     · NO se podía entrar con otro usuario en ese mismo navegador.
   Se veía "pegado" porque efectivamente lo estaba.

   Lo que se cuida acá:
     1. Que haya una salida, y que esa salida CIERRE LA SESIÓN (si sólo
        repintara el login, la sesión del primero seguiría viva y el problema
        volvería tal cual).
     2. Que salir NO marque la contraseña como cambiada: el cambio sigue siendo
        obligatorio y se le vuelve a pedir en el próximo ingreso, hasta que lo
        haga. Eso es lo que pidió Henry, y es lo que pasa también si se cae la
        conexión o cierra la pestaña a la mitad. */
const fs = require('fs');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);
const leer = (...f) => fs.readFileSync(raiz(...f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const login = leer('js', 'core', 'login.js');

/* ── 1. HAY SALIDA ──────────────────────────────────────────────────────── */
{
  const vista = login.slice(login.indexOf("'cambiar-pass': `"), login.indexOf("'cambiar-pass': `") + 2000);
  ok('la pantalla de cambio de contraseña tiene botón de salida',
     /loginSalirCambioPass\(\)/.test(vista));
  ok('...y dice claramente que no podrá entrar hasta cambiarla',
     /no vas a poder entrar/.test(vista));
  ok('...y que se le va a volver a pedir', /siguiente ingreso/.test(vista));
  ok('el botón de guardar sigue estando (no se rompió el flujo normal)',
     /loginCambiarPass\(\)/.test(vista));
}

/* ── 2. LA SALIDA CIERRA LA SESIÓN ──────────────────────────────────────── */
{
  const fn = login.slice(login.indexOf('async function loginSalirCambioPass'),
                         login.indexOf('async function loginSalirCambioPass') + 900);
  ok('la salida existe como función', fn.length > 50);
  /* EL PUNTO CENTRAL: sin cerrar sesión, recargar volvía al mismo lugar y no
     se podía entrar con otro usuario. */
  ok('cierra la sesión de verdad', /Auth\.logout\(\)/.test(fn));
  ok('...y limpia lo que quedó en memoria aunque el logout falle sin red',
     /Auth\.user = Auth\.tenant = Auth\.supaUser = Auth\.licencia = null/.test(fn));
  ok('...incluido el tenant cacheado', /_cachedTenantId = null/.test(fn));
  ok('vuelve al formulario de inicio de sesión', /renderLogin\('login'\)/.test(fn));

  /* Y lo que NO debe hacer: dar por cumplido el cambio. */
  ok('NO marca la contraseña como cambiada', !/debe_cambiar_password/.test(fn));
  ok('...ni llama a cambiarPassword', !/cambiarPassword/.test(fn));
}

/* ── 3. SE LE SIGUE PIDIENDO HASTA QUE LA CAMBIE ────────────────────────── */
{
  /* Las dos puertas de entrada a la app tienen que seguir mandando al cambio
     mientras la marca siga puesta: la del login normal y la de la sesión ya
     abierta (recargar la página). */
  ok('al iniciar sesión se le pide el cambio',
     /if \(r\.debe_cambiar\) \{ renderLogin\('cambiar-pass'\); return; \}/.test(login));
  ok('y al recargar con sesión abierta, también',
     /if \(Auth\.user\?\.debe_cambiar_password\) \{ renderLogin\('cambiar-pass'\); return; \}/.test(login));

  /* La marca la limpia SÓLO el cambio efectivo, en auth.js. */
  const auth = leer('js', 'core', 'auth.js');
  ok('la marca se limpia únicamente al guardar la contraseña nueva',
     /debe_cambiar_password: false/.test(auth) && /cambiarPassword/.test(auth));
}

/* ── 4. LAS APPS SE PUEDEN DESCARGAR ────────────────────────────────────── */
{
  /* El botón del APK daba 404: el worker bloqueaba la extensión .apk aunque el
     archivo sí se subía. Dos archivos que se contradecían — .assetsignore
     hasta explicaba en un comentario que el .apk NO se excluye a propósito. */
  const worker = leer('worker.js');
  ok('el worker ya no bloquea el .apk', !/\|apk\|/.test(worker));
  ok('...pero sigue bloqueando los documentos sensibles',
     /pdf/.test(worker) && /xls/.test(worker) && /pptx?/.test(worker));
  ok('...y las carpetas internas', /\.claude/.test(worker) && /\.git/.test(worker));

  const ai = leer('.assetsignore');
  ok('el .apk se sigue subiendo al CDN', !/^\*\.apk/m.test(ai));

  /* El enlace de Windows apuntaba a un repositorio que no existe
     (nexuspro.enterprise) y por eso daba 404. */
  const desc = leer('js', 'modulos', 'herramientas', 'descarga.js');
  ok('el enlace de Windows apunta al repositorio real',
     /github\.com\/henrychinchilla\/tallerpro\.enterprise/.test(desc));
  /* Se busca la URL, no la palabra: el comentario del archivo nombra el
     repositorio equivocado justamente para explicar por qué daba 404. */
  ok('...y ninguna URL apunta al que no existe',
     !/github\.com\/henrychinchilla\/nexuspro\.enterprise/.test(desc));
  ok('la descarga de Android sigue ofreciéndose', /href="\/nexuspro\.apk"/.test(desc));
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
