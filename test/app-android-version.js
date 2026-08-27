/* El aviso de "hay una versión nueva de la app de Android".

   Lo que esto cuida NO es que el modal se vea bonito: es que el aviso diga la
   verdad. Hay dos formas silenciosas de que mienta, y las dos dejan al usuario
   peor que sin aviso:

     · Los tres números se desincronizan. La versión vive en build.gradle, en
       el APK que se copia a /nexuspro.apk y en app-version.json. Si el JSON
       anuncia la 4 pero el APK publicado sigue siendo la 3, el usuario instala,
       vuelve a entrar, y le sale OTRA VEZ "actualiza" — para siempre.
     · La regla de decisión se equivoca de caso. El más delicado: los APK
       anteriores al versionCode 4 no saben reportar su versión. Estar dentro
       de la app sin poder decir cuál eres es justamente la prueba de que eres
       viejo, y es el único camino por el que la base YA INSTALADA puede
       enterarse de que hay algo nuevo. Si ese caso se rompe, el aviso nace
       inútil: sólo lo verían los que ya tienen la versión nueva.

   Se prueba el código real (js/core/app.js cargado en un sandbox), no una
   copia de la regla. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const zlib = require('zlib');

const RAIZ = path.join(__dirname, '..');
const APP_JS = path.join(RAIZ, 'js', 'core', 'app.js');
const VERSION_JSON = path.join(RAIZ, 'app-version.json');
const GRADLE = path.join(RAIZ, 'android', 'app', 'build.gradle');
const APK = path.join(RAIZ, 'nexuspro.apk');

let pasadas = 0, fallidas = 0;
function ok(nombre, cond) {
  if (cond) { pasadas++; console.log('PASS — ' + nombre); }
  else { fallidas++; console.log('FAIL — ' + nombre); }
}

/* ── Lector mínimo de ZIP ────────────────────────────────────────────────────
   Un APK es un ZIP. Se lee por el directorio central (no por los cabeceros
   locales, que pueden traer los tamaños en 0 y dejarlos en el data descriptor). */
function leerDelZip(rutaZip, nombre) {
  const b = fs.readFileSync(rutaZip);
  let eocd = -1;
  for (let i = b.length - 22; i >= 0 && i > b.length - 66000; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const total = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) return null;
    const metodo   = b.readUInt16LE(p + 10);
    const compLen  = b.readUInt32LE(p + 20);
    const nomLen   = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const comLen   = b.readUInt16LE(p + 32);
    const local    = b.readUInt32LE(p + 42);
    const nom      = b.slice(p + 46, p + 46 + nomLen).toString('latin1');
    if (nom === nombre) {
      const lNom   = b.readUInt16LE(local + 26);
      const lExtra = b.readUInt16LE(local + 28);
      const ini    = local + 30 + lNom + lExtra;
      const datos  = b.slice(ini, ini + compLen);
      return metodo === 8 ? zlib.inflateRawSync(datos) : datos;
    }
    p += 46 + nomLen + extraLen + comLen;
  }
  return null;
}

/* ── Sandbox: carga el app.js REAL con lo mínimo del navegador ─────────────── */
function cargar({ ua = 'Mozilla/5.0 (Linux; Android 13) Chrome/120', referrer = '',
                  local = {}, sesion = {}, busqueda = '', publicada = null,
                  modalAbierto = false } = {}) {
  const modales = [];
  const almacen = (datos) => ({
    _d: Object.assign({}, datos),
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  });
  const localStorage = almacen(local);
  const sessionStorage = almacen(sesion);
  const historial = [];

  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Number, Array,
    String, Object, URLSearchParams, isNaN, parseInt, parseFloat, encodeURIComponent,
    localStorage, sessionStorage,
    addEventListener: () => {},   // app.js engancha beforeinstallprompt en window
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    navigator: { userAgent: ua },
    location: { search: busqueda, pathname: '/', hash: '' },
    history: { replaceState: (a, b, url) => historial.push(url) },
    document: {
      referrer,
      getElementById: (id) => id === 'modal-overlay'
        ? { classList: { contains: () => modalAbierto } } : null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    fetch: async (url) => ({
      ok: publicada !== null,
      json: async () => ({ android: publicada }),
    }),
    UI: {
      esc: (v = '') => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
      modal: (titulo, cuerpo) => modales.push({ titulo, cuerpo }),
      cerrarModal: () => {},
      toast: () => {},
      q: v => 'Q' + v,
      fecha: v => v,
    },
    Modulos: {},
    Auth: { user: {}, tenant: {} },
    DB: {},
    TEMAS: { aplicar: () => {} },
    window: {},
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(APP_JS, 'utf8') + '\n;globalThis.__App = App;', ctx);
  return { App: ctx.__App, modales, localStorage, historial, sessionStorage };
}

/* Lo que hoy está publicado, para no inventar números en las pruebas */
const publicada = JSON.parse(fs.readFileSync(VERSION_JSON, 'utf8')).android;

(async () => {

  /* ══ 1. Los tres números dicen lo mismo ═══════════════════════════════════ */
  {
    const gradle = fs.readFileSync(GRADLE, 'utf8');
    const gvc = /appVersionCode\s*=\s*(\d+)/.exec(gradle);
    const gvn = /appVersionName\s*=\s*"([^"]+)"/.exec(gradle);
    ok('build.gradle declara la versión en un solo lugar', !!gvc && !!gvn);
    ok('build.gradle y app-version.json coinciden en versionCode',
       !!gvc && Number(gvc[1]) === publicada.versionCode);
    ok('build.gradle y app-version.json coinciden en versionName',
       !!gvn && gvn[1] === publicada.versionName);

    /* Y sobre todo: el APK que de verdad se sirve. Se lee del binario, que es
       lo único que el teléfono va a instalar. La URL de arranque lleva dentro
       el versionCode, así que sirve de huella. */
    const manifest = leerDelZip(APK, 'AndroidManifest.xml');
    ok('el APK publicado se puede leer', !!manifest && manifest.length > 0);
    const texto = manifest ? manifest.toString('utf16le') : '';
    const m = /appvc=(\d+)&appvn=([0-9][0-9.]*)/.exec(texto);
    ok('el APK publicado se identifica al abrir el sitio (?app=android&appvc=…)', !!m);
    ok('el APK publicado ES la versión que anuncia app-version.json',
       !!m && Number(m[1]) === publicada.versionCode && m[2] === publicada.versionName);
    ok('el peso anunciado corresponde al APK real (±2 KB)',
       Math.abs(Math.round(fs.statSync(APK).size / 1024) - publicada.apkKB) <= 2);
  }

  /* ══ 1.b La llave de firma rotada (2026-08-25) ════════════════════════════
     La llave anterior estuvo servida públicamente en el CDN casi dos meses, así
     que se dio por comprometida y se generó otra. Dos cosas no pueden fallar:
     que su huella VIEJA no siga autorizada en assetlinks.json —si siguiera,
     quien tenga esa llave podría publicar una app que Android abre a pantalla
     completa como si fuera NexusPro—, y que se le avise al usuario de que esta
     vez tiene que desinstalar antes, porque Android rechaza instalar encima
     cuando la firma cambia y sólo dice "aplicación no instalada". */
  {
    const al = JSON.parse(fs.readFileSync(path.join(RAIZ, '.well-known', 'assetlinks.json'), 'utf8'));
    const huellas = al?.[0]?.target?.sha256_cert_fingerprints || [];
    const VIEJA = '8B:D8:E8:84:CE:2C:CA:68:59:4D:90:70:AB:F2:75:E3:00:C7:9A:3A:00:5D:E2:45:75:6F:95:75:5C:F7:F8:75';
    ok('assetlinks declara al menos una huella', huellas.length >= 1);
    ok('la huella COMPROMETIDA ya no está autorizada',
       !huellas.some(h => h.toUpperCase() === VIEJA));
    ok('las huellas tienen forma de SHA-256 (32 bytes en hexadecimal)',
       huellas.every(h => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(h)));
    ok('assetlinks apunta al paquete de la app', al?.[0]?.target?.package_name === publicada.paquete);

    ok('app-version.json avisa desde qué versión hay que reinstalar',
       Number.isFinite(publicada.reinstalarSiMenorQue));
    /* La regla NO es que sea igual al versionCode. Ese número marca la versión
       en la que CAMBIÓ LA LLAVE (la 5, el 2026-08-25) y se queda ahí: la 6 y
       las siguientes van firmadas con la misma llave, así que quien esté en la
       5 actualiza normal y sólo los anteriores deben desinstalar. La igualdad
       era una coincidencia de que la rotación y la versión publicada fueran la
       misma, y al publicar la 4.94.0 (vc6) esta prueba falló sin que hubiera
       nada roto. Lo que sí es un bug es que apunte al FUTURO: mandaría a
       reinstalar por una versión que todavía no existe. */
    ok('…y ese número no apunta a una versión que aún no existe',
       publicada.reinstalarSiMenorQue >= 1 &&
       publicada.reinstalarSiMenorQue <= publicada.versionCode);

    const appjs = fs.readFileSync(APP_JS, 'utf8');
    ok('el aviso contempla el caso "hay que desinstalar primero"',
       /reinstalarSiMenorQue/.test(appjs) && /DESINSTALAR primero/i.test(appjs));
  }

  /* ══ 2. La app se presenta y la URL queda limpia ══════════════════════════ */
  {
    const { App, localStorage, historial, sessionStorage } =
      cargar({ busqueda: '?app=android&appvc=4&appvn=4.77.0' });
    const info = JSON.parse(localStorage.getItem('np_android_app') || 'null');
    ok('guarda la versión con que la app abrió el sitio', info && info.vc === 4 && info.vn === '4.77.0');
    ok('recuerda que va DENTRO de la app', sessionStorage.getItem('np_twa') === '1');
    ok('limpia los parámetros de la URL', historial.length === 1 && !String(historial[0]).includes('appvc'));
    ok('App._appAndroid queda listo para el aviso', App._appAndroid && App._appAndroid.vc === 4);
  }

  /* ══ 3. La regla de decisión ══════════════════════════════════════════════ */

  /* EL CASO QUE JUSTIFICA TODO: la base ya instalada. Un APK viejo entra en la
     app pero no sabe decir qué versión es — y precisamente por eso es viejo. */
  {
    const { App, modales } = cargar({
      referrer: 'android-app://com.cmtelecom.nexuspro', publicada });
    await App.avisoAppAndroid();
    ok('APK viejo (no reporta versión) DENTRO de la app → avisa que actualice',
       modales.length === 1 && /versión nueva/i.test(modales[0].titulo));
    ok('…y el botón dice Actualizar, no Descargar',
       modales.length === 1 && /Actualizar ahora/.test(modales[0].cuerpo));
  }

  {
    const { App, modales } = cargar({
      referrer: 'android-app://com.cmtelecom.nexuspro',
      local: { np_android_app: JSON.stringify({ vc: publicada.versionCode, vn: publicada.versionName }) },
      publicada });
    await App.avisoAppAndroid();
    ok('app al día → NO molesta', modales.length === 0);
  }

  /* Firma vieja: instalar encima es imposible, y hay que decirlo. */
  {
    const { App, modales } = cargar({
      local: { np_android_app: JSON.stringify({ vc: publicada.reinstalarSiMenorQue - 1, vn: '4.77.0' }) },
      publicada });
    await App.avisoAppAndroid();
    ok('con la firma anterior, avisa que hay que DESINSTALAR primero',
       modales.length === 1 && /DESINSTALAR primero/i.test(modales[0].cuerpo));
    ok('…y explica que no se pierden los datos',
       modales.length === 1 && /no pierdes nada|no está[n]? en el teléfono/i.test(modales[0].cuerpo));
  }
  {
    /* Una futura versión ya firmada con la llave nueva NO debe pedir desinstalar */
    const futura = Object.assign({}, publicada, { versionCode: publicada.versionCode + 1, versionName: '9.9.9' });
    const { App, modales } = cargar({
      local: { np_android_app: JSON.stringify({ vc: publicada.versionCode, vn: publicada.versionName }) },
      publicada: futura });
    await App.avisoAppAndroid();
    ok('una actualización normal posterior NO pide desinstalar',
       modales.length === 1 && !/DESINSTALAR primero/i.test(modales[0].cuerpo));
  }

  {
    const { App, modales } = cargar({
      local: { np_android_app: JSON.stringify({ vc: publicada.versionCode - 1, vn: '4.76.0' }) },
      publicada });
    await App.avisoAppAndroid();
    ok('versión anterior, abierta desde el navegador → avisa que actualice',
       modales.length === 1 && /versión nueva/i.test(modales[0].titulo));
    ok('…y le dice qué versión tiene y cuál es la nueva',
       modales.length === 1 && modales[0].cuerpo.includes('4.76.0') && modales[0].cuerpo.includes(publicada.versionName));
  }

  {
    const { App, modales } = cargar({ publicada });
    await App.avisoAppAndroid();
    ok('Android sin la app → le ofrece instalarla',
       modales.length === 1 && /Instala la app/i.test(modales[0].titulo));
    ok('…con el enlace al APK que se publica', modales.length === 1 && modales[0].cuerpo.includes(publicada.apkUrl));
  }

  {
    const { App, modales } = cargar({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', publicada });
    await App.avisoAppAndroid();
    ok('en iPhone no ofrece una app de Android', modales.length === 0);
  }

  {
    const { App, modales } = cargar({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64)', publicada });
    await App.avisoAppAndroid();
    ok('en Windows tampoco', modales.length === 0);
  }

  /* ══ 4. Sin fuente de verdad, no se inventa un aviso ══════════════════════ */
  {
    const { App, modales } = cargar({ publicada: null });
    await App.avisoAppAndroid();
    ok('si /app-version.json no responde, no avisa nada', modales.length === 0);
  }

  /* ══ 5. Posponer: callarse sin volverse mudo ══════════════════════════════ */
  {
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const { App, modales } = cargar({
      local: { np_android_aviso: JSON.stringify({ vc: publicada.versionCode, modo: 'instalar', hasta: manana }) },
      publicada });
    await App.avisoAppAndroid();
    ok('"Después" calla el aviso mientras dure', modales.length === 0);
  }
  {
    const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const { App, modales } = cargar({
      local: { np_android_aviso: JSON.stringify({ vc: publicada.versionCode, modo: 'instalar', hasta: ayer }) },
      publicada });
    await App.avisoAppAndroid();
    ok('…y vuelve cuando se vence', modales.length === 1);
  }
  {
    /* Lo importante: una versión NUEVA reabre el aviso aunque lo hubiera
       pospuesto, porque la posposición va atada al versionCode. */
    const lejos = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const { App, modales } = cargar({
      local: { np_android_aviso: JSON.stringify({ vc: publicada.versionCode - 1, modo: 'instalar', hasta: lejos }) },
      publicada });
    await App.avisoAppAndroid();
    ok('una versión NUEVA reabre el aviso aunque estuviera pospuesto', modales.length === 1);
  }
  {
    const { App, localStorage } = cargar({ publicada });
    App._posponerAvisoApp(publicada.versionCode, 'actualizar');
    const g = JSON.parse(localStorage.getItem('np_android_aviso'));
    const hoy = new Date().toISOString().slice(0, 10);
    ok('posponer una ACTUALIZACIÓN insiste al día siguiente', g.vc === publicada.versionCode && g.hasta > hoy);
    const { App: A2, localStorage: L2 } = cargar({ publicada });
    A2._posponerAvisoApp(publicada.versionCode, 'instalar');
    ok('posponer una INSTALACIÓN espera más que una actualización',
       JSON.parse(L2.getItem('np_android_aviso')).hasta > g.hasta);
  }

  /* ══ 6. No pisar otro modal (el aviso SAT sale primero) ═══════════════════ */
  {
    const { App, modales } = cargar({ publicada, modalAbierto: true });
    await App.avisoAppAndroid();
    ok('con otro modal abierto, espera en vez de pisarlo', modales.length === 0);
  }

  /* ══ 7. Google Play: el día que la ficha esté viva ════════════════════════ */
  {
    const enPlay = Object.assign({}, publicada, { enPlayStore: true });
    const { App, modales } = cargar({ publicada: enPlay });
    await App.avisoAppAndroid();
    ok('con enPlayStore:true manda a Google Play',
       modales.length === 1 && modales[0].cuerpo.includes(enPlay.playUrl));
    ok('…y ya no pide activar "origen desconocido"',
       modales.length === 1 && !/origen desconocido|esta fuente/i.test(modales[0].cuerpo));
  }
  {
    /* Mientras NO esté publicada, el aviso no puede mandar a una ficha que da 404 */
    const { App, modales } = cargar({ publicada });
    await App.avisoAppAndroid();
    ok('mientras enPlayStore sea false, NO enlaza a Play',
       modales.length === 1 && !modales[0].cuerpo.includes('play.google.com'));
  }

  /* ══ 8. Regresión: el keystore no puede volver al CDN ═════════════════════
     El 2026-08-25 android/tallerpro.keystore y su contraseña respondían 200 en
     producción: .gitignore protege el repo, pero wrangler sube el directorio de
     trabajo. Con eso cualquiera podía firmar un APK que Android aceptaría como
     actualización legítima. Esto vigila las dos barreras. */
  {
    const ai = fs.readFileSync(path.join(RAIZ, '.assetsignore'), 'utf8');
    const lineas = ai.split('\n').map(l => l.trim());
    ok('.assetsignore excluye el proyecto Android del CDN', lineas.includes('android/'));
    ok('.assetsignore excluye el material de firma', lineas.includes('*.keystore') && lineas.includes('keystore.properties'));
    ok('.assetsignore excluye el bundle de Play (.aab)', lineas.includes('*.aab'));
    /* El APK oficial TIENE que subir: taparlo es exactamente el bug que dejó el
       botón de descargas en 404. Nada de patrones genéricos con negación — los
       builds viejos se excluyen por nombre. */
    ok('.assetsignore NO tapa el APK que se ofrece descargar',
       !lineas.some(l => /^!?\*\.apk$/.test(l)) && !lineas.includes('nexuspro.apk'));
    ok('.assetsignore excluye los builds viejos sueltos por nombre',
       lineas.includes('NexusPro-build-henry.apk'));

    const w = fs.readFileSync(path.join(RAIZ, 'worker.js'), 'utf8');
    const rutaPriv = /const PRIVATE_PATH = (\/.*\/);/.exec(w);
    const filePriv = /const PRIVATE_FILE = (\/.*\/i);/.exec(w);
    ok('worker.js define las dos listas', !!rutaPriv && !!filePriv);
    const reRuta = rutaPriv && eval(rutaPriv[1]);
    const reFile = filePriv && eval(filePriv[1]);
    const tapado = p => (reRuta && reRuta.test(p)) || (reFile && reFile.test(p));
    ok('worker.js tapa el keystore', tapado('/android/tallerpro.keystore'));
    ok('worker.js tapa la contraseña del keystore', tapado('/android/keystore.properties'));
    ok('worker.js tapa todo el proyecto Android', tapado('/android/app/build.gradle'));
    ok('worker.js tapa el bundle de Play', tapado('/NexusPro-4.77.0-play.aab'));
    ok('…pero NO tapa el APK que la gente descarga', !tapado('/nexuspro.apk'));
    ok('…ni el archivo de versión que dispara el aviso', !tapado('/app-version.json'));
  }

  console.log(`\n   ${pasadas} pasadas, ${fallidas} fallidas`);
  if (fallidas) process.exitCode = 1;
})();
