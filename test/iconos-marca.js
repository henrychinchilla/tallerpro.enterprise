/* EL ÍCONO DECÍA "TALLERPRO".

   Henry lo descubrió usando la app: el nombre viejo seguía dibujado DENTRO de
   la imagen. No aparecía en ninguna búsqueda de texto del código —por eso
   sobrevivió a todo el rebranding— y encima era naranja con una llave de
   taller, cuando la app hace rato usa azul y ya no es sólo para talleres
   (vende granos, armas, alimento para animales).

   Lo que esta prueba puede cuidar de verdad, sin abrir las imágenes:
     · Que exista cada ícono que manifest.json e index.html prometen. Un ícono
       declarado y ausente es un cuadro roto en la pantalla de instalación.
     · Que el PNG mida lo que dice medir (se lee del encabezado IHDR, sin
       librerías): un icon-512.png que en realidad mide 72 se ve borroso.
     · Que el generador siga produciendo la marca correcta. Es lo único que
       ata la imagen a un texto revisable. */
const fs = require('fs');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);
const leer = (...f) => fs.readFileSync(raiz(...f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* Ancho y alto de un PNG: van en el IHDR, bytes 16-23, big-endian. */
function medidaPNG(archivo) {
  const b = fs.readFileSync(archivo);
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/* ── 1. LOS ÍCONOS QUE LA APP PROMETE, EXISTEN Y MIDEN LO QUE DICEN ─────── */
{
  const manifest = JSON.parse(leer('manifest.json'));
  ok('el manifest declara íconos', Array.isArray(manifest.icons) && manifest.icons.length > 0);

  manifest.icons.forEach(ic => {
    const rel = ic.src.replace(/^\//, '');
    const f = raiz(...rel.split('/'));
    const existe = fs.existsSync(f);
    ok(`existe ${ic.src}`, existe);
    if (!existe) return;
    const m = medidaPNG(f);
    const esperado = parseInt(String(ic.sizes).split('x')[0], 10);
    ok(`...y mide ${esperado}x${esperado} de verdad`, !!m && m.w === esperado && m.h === esperado);
  });

  /* index.html referencia los suyos aparte del manifest. */
  const html = leer('index.html');
  const refs = [...html.matchAll(/href="(\/icons\/[^"]+)"/g)].map(m => m[1]);
  ok('index.html referencia íconos', refs.length > 0);
  refs.forEach(r => ok(`existe el ícono de index.html ${r}`, fs.existsSync(raiz(...r.replace(/^\//, '').split('/')))));
}

/* ── 2. EL LANZADOR DE ANDROID Y EL DE WINDOWS ─────────────────────────── */
{
  /* Estos van DENTRO del APK y del instalador: cambiarlos en el repo no basta,
     hay que recompilar. Por eso importa que estén al día en el repo, que es de
     donde sale la próxima compilación. */
  const dpis = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  Object.entries(dpis).forEach(([dpi, s]) => {
    const f = raiz('android', 'app', 'src', 'main', 'res', `mipmap-${dpi}`, 'ic_launcher.png');
    const existe = fs.existsSync(f);
    ok(`Android tiene su ícono ${dpi}`, existe);
    if (existe) {
      const m = medidaPNG(f);
      ok(`...de ${s}px`, !!m && m.w === s && m.h === s);
    }
  });

  const ico = raiz('icons', 'icon.ico');
  ok('Windows tiene su .ico', fs.existsSync(ico));
  ok('...y no está vacío', fs.existsSync(ico) && fs.statSync(ico).size > 5000);
}

/* ── 3. LA MARCA DEL GENERADOR ─────────────────────────────────────────── */
{
  const gen = leer('tools', 'generar-iconos.js');
  ok('el generador dibuja NEXUSPRO', /NEXUSPRO/.test(gen));
  ok('...y ya no dice TALLERPRO', !/TALLERPRO/.test(gen.replace(/^[\s\S]*?\*\//, '')));
  /* El azul de la app, no el naranja viejo. */
  ok('usa el azul corporativo', /#2563EB|#60A5FA/i.test(gen));
  ok('no quedó ninguna llave de taller (era de cuando la app era sólo talleres)',
     !/wrench|llave/i.test(gen.replace(/^[\s\S]*?\*\//, '')));
  /* Los tamaños chicos van SIN texto: a 48px la palabra es una mancha. */
  ok('los tamaños chicos van sin texto', /svgSinTexto/.test(gen));
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
