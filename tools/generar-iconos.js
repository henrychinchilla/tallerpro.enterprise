/* Genera el juego completo de íconos de NexusPro desde un SVG.

   El anterior decía TALLERPRO y traía una llave de taller, en naranja. Dos
   cosas mal: el nombre viejo y una paleta que la app ya no usa (el rediseño
   corporativo pasó a azul; la variable sigue llamándose --amber pero vale
   #3B82F6). Y una llave dice "taller mecánico" a un negocio que hoy también
   vende granos, armas o alimento para conejos.

   El nuevo: la marca "N" sobre un disco azul, con los nodos del nexo. Sin
   herramientas de ningún oficio. */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const raiz = process.argv[2];
const salida = path.join(raiz, 'icons');

/* AZUL de la app (--amber en css/base.css, tema claro) sobre el azul oscuro
   del fondo. El degradado del disco va de #60A5FA a #2563EB para que se note
   volumen incluso a 48 px. */
const svg = (lado) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#131C2E"/>
      <stop offset="1" stop-color="#0B1220"/>
    </linearGradient>
    <linearGradient id="disco" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#60A5FA"/>
      <stop offset="1" stop-color="#2563EB"/>
    </linearGradient>
  </defs>

  <rect width="512" height="512" rx="108" fill="url(#fondo)"/>
  <circle cx="256" cy="238" r="150" fill="url(#disco)"/>

  <!-- La "N" de NexusPro, la misma marca que usa la app adentro.
       Trazo grueso a propósito: a 48 px un trazo fino se convierte en papilla. -->
  <path d="M196 316 V160 L316 316 V160"
        fill="none" stroke="#FFFFFF" stroke-width="34"
        stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Los nodos del "nexo": los extremos conectados. Son lo que distingue la
       marca de una N cualquiera, y siguen leyéndose como puntos al achicarse. -->
  <circle cx="196" cy="160" r="20" fill="#FFFFFF"/>
  <circle cx="316" cy="316" r="20" fill="#FFFFFF"/>

  <text x="256" y="452" text-anchor="middle"
        font-family="Segoe UI, Arial, Helvetica, sans-serif"
        font-size="66" font-weight="700" letter-spacing="2"
        fill="#93C5FD">NEXUSPRO</text>
</svg>`;

/* Sin texto para los tamaños chicos: abajo de 128 px la palabra es una mancha
   ilegible que sólo ensucia el ícono. */
const svgSinTexto = (lado) => svg(lado).replace(/<text[\s\S]*?<\/text>/, '');

const PWA = [72, 96, 128, 144, 152, 192, 384, 512];
const ANDROID = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ICO = [16, 32, 48, 64, 128, 256];

(async () => {
  for (const s of PWA) {
    const fuente = s >= 128 ? svg(s) : svgSinTexto(s);
    await sharp(Buffer.from(fuente)).resize(s, s).png().toFile(path.join(salida, `icon-${s}.png`));
    console.log('icons/icon-' + s + '.png');
  }

  for (const [dpi, s] of Object.entries(ANDROID)) {
    const dir = path.join(raiz, 'android', 'app', 'src', 'main', 'res', `mipmap-${dpi}`);
    if (!fs.existsSync(dir)) continue;
    const fuente = s >= 128 ? svg(s) : svgSinTexto(s);
    await sharp(Buffer.from(fuente)).resize(s, s).png().toFile(path.join(dir, 'ic_launcher.png'));
    console.log(`android mipmap-${dpi}/ic_launcher.png (${s}px)`);
  }

  /* El .ico de Windows: varios tamaños dentro de un archivo. */
  const tmp = path.join(raiz, '.icotmp');
  fs.mkdirSync(tmp, { recursive: true });
  const partes = [];
  for (const s of ICO) {
    const f = path.join(tmp, `${s}.png`);
    const fuente = s >= 128 ? svg(s) : svgSinTexto(s);
    await sharp(Buffer.from(fuente)).resize(s, s).png().toFile(f);
    partes.push(f);
  }
  /* png-to-ico se publica como módulo ES transpilado: la función viene en
     `.default`, no en el objeto que devuelve require(). */
  const mod = require('png-to-ico');
  const pngToIco = mod.default || mod;
  fs.writeFileSync(path.join(salida, 'icon.ico'), await pngToIco(partes));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('icons/icon.ico');
})();
